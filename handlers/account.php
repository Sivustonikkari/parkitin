<?php
// User login, profile, parking, and payment operations.

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../mailer.php';

const LOGIN_TOKEN_TTL_MINUTES = 15;
const SESSION_TTL_MINUTES = 60;

function issue_login_link(PDO $db, array $account): void
{
    $token = bin2hex(random_bytes(32));
    $stmt = $db->prepare(
        'INSERT INTO login_tokens (user_id, token_hash, expires_at)
         VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ' . LOGIN_TOKEN_TTL_MINUTES . ' MINUTE))'
    );
    $stmt->execute([$account['id'], password_hash($token, PASSWORD_DEFAULT)]);

    $link = APP_URL . '?token=' . urlencode($token);
    send_login_link_email($account['email'], $link);
}

function handle_login_request(string $method): void
{
    if ($method !== 'POST') {
        send_json(['error' => 'Method not allowed'], 405);
    }

    $data = json_body();
    require_fields($data, ['email']);
    require_valid_email($data['email']);

    $db = get_db();
    $stmt = $db->prepare('SELECT * FROM users WHERE email = ?');
    $stmt->execute([$data['email']]);
    $account = $stmt->fetch();

    if (!$account) {
        send_json(['needs_registration' => true]);
    }

    issue_login_link($db, $account);
    send_json(['message' => 'Login link sent, check your email']);
}

function handle_register(string $method): void
{
    if ($method !== 'POST') {
        send_json(['error' => 'Method not allowed'], 405);
    }

    $data = json_body();
    require_fields($data, ['email']);
    require_valid_email($data['email']);

    $db = get_db();
    $role = role_for_new_user($db);

    try {
        $stmt = $db->prepare(
            "INSERT INTO users (email, role, status) VALUES (?, ?, 'pending')"
        );
        $stmt->execute([$data['email'], $role]);
        $accountId = (int)$db->lastInsertId();
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') {
            send_json(['error' => 'An account with this email already exists'], 409);
        }
        throw $e;
    }

    issue_login_link($db, ['id' => $accountId, 'email' => $data['email']]);
    send_json(['message' => 'Account created, check your email to confirm'], 201);
}

function handle_verify(string $method): void
{
    if ($method !== 'GET') {
        send_json(['error' => 'Method not allowed'], 405);
    }

    $token = $_GET['token'] ?? '';
    if ($token === '') {
        send_json(['error' => 'Missing token'], 400);
    }

    $db = get_db();
    $stmt = $db->prepare(
        'SELECT * FROM login_tokens WHERE expires_at > NOW() AND used_at IS NULL'
    );
    $stmt->execute();

    $matched = null;
    foreach ($stmt->fetchAll() as $row) {
        if (password_verify($token, $row['token_hash'])) {
            $matched = $row;
            break;
        }
    }

    if (!$matched) {
        send_json(['error' => 'Invalid or expired token'], 400);
    }

    $db->beginTransaction();

    $db->prepare('UPDATE login_tokens SET used_at = NOW() WHERE id = ?')->execute([$matched['id']]);
    $db->prepare("UPDATE users SET status = 'confirmed' WHERE id = ? AND status = 'pending'")
        ->execute([$matched['user_id']]);

    $sessionToken = bin2hex(random_bytes(32));
    $db->prepare(
        'INSERT INTO user_sessions (user_id, token_hash, expires_at)
         VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ' . SESSION_TTL_MINUTES . ' MINUTE))'
    )->execute([$matched['user_id'], password_hash($sessionToken, PASSWORD_DEFAULT)]);

    $db->commit();

    send_json(['session_token' => $sessionToken, 'expires_in' => SESSION_TTL_MINUTES * 60]);
}

// resolves the Authorization: Bearer session token to an account, or 401
function require_account_session(): array
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/^Bearer\s+(.+)$/i', $header, $m)) {
        send_json(['error' => 'Missing session token'], 401);
    }
    $token = $m[1];

    $db = get_db();
    $stmt = $db->prepare(
        'SELECT s.*, a.email, a.status, a.role, a.reg_number, a.first_name, a.last_name, a.postal_code, a.parking FROM user_sessions s
         JOIN users a ON a.id = s.user_id
         WHERE s.expires_at > NOW()'
    );
    $stmt->execute();

    foreach ($stmt->fetchAll() as $row) {
        if (password_verify($token, $row['token_hash'])) {
            return $row;
        }
    }

    send_json(['error' => 'Invalid or expired session'], 401);
}

function handle_me(string $method): void
{
    if ($method !== 'GET') {
        send_json(['error' => 'Method not allowed'], 405);
    }

    $session = require_account_session();
    $hasDetails = $session['reg_number'] !== null && $session['first_name'] !== null
        && $session['last_name'] !== null && $session['postal_code'] !== null;
    send_json([
        'email' => $session['email'],
        'status' => $session['status'],
        'role' => $session['role'],
        'reg_number' => $session['reg_number'],
        'first_name' => $session['first_name'],
        'last_name' => $session['last_name'],
        'postal_code' => $session['postal_code'],
        'city' => $session['postal_code'] === null ? null : post_office_for_postal_code($session['postal_code']),
        'needs_details' => !$hasDetails,
    ]);
}

function handle_update_profile(string $method): void
{
    if ($method !== 'POST') {
        send_json(['error' => 'Method not allowed'], 405);
    }

    $session = require_account_session();
    $data = json_body();
    require_fields($data, ['reg_number', 'first_name', 'last_name', 'postal_code']);

    $postalCode = trim($data['postal_code']);
    if (!preg_match('/^\d{5}$/', $postalCode)) {
        send_json(['error' => 'Invalid postal code'], 400);
    }

    $city = post_office_for_postal_code($postalCode);
    if ($city === null) {
        send_json(['error' => 'Postal code not found'], 400);
    }

    $db = get_db();
    $stmt = $db->prepare(
        'UPDATE users SET reg_number = ?, first_name = ?, last_name = ?, postal_code = ? WHERE id = ?'
    );
    $stmt->execute([
        $data['reg_number'],
        $data['first_name'],
        $data['last_name'],
        $postalCode,
        $session['user_id'],
    ]);

    send_json(['message' => 'Profile updated']);
}

function handle_delete_profile(string $method): void
{
    if ($method !== 'DELETE') {
        send_json(['error' => 'Method not allowed'], 405);
    }

    $session = require_account_session();
    $db = get_db();
    $stmt = $db->prepare('DELETE FROM users WHERE id = ?');
    $stmt->execute([$session['user_id']]);

    send_json(['message' => 'Profile deleted']);
}

function handle_map_lots(string $method): void
{
    if ($method !== 'GET') {
        send_json(['error' => 'Method not allowed'], 405);
    }

    require_account_session();
    $lots = get_db()->query(
        'SELECT l.id, l.name, l.address, l.city, l.postal_code, l.latitude, l.longitude, l.info, l.capacity,
         l.price_first_3h, l.price_per_extra_hour,
         COUNT(s.id) AS reserved_slots,
         COUNT(ps.id) - COUNT(s.id) AS available_slots
         FROM parking_lots l
         LEFT JOIN parking_slots ps ON ps.lot_id = l.id AND ps.is_active = 1
         LEFT JOIN parking_sessions s ON s.slot_id = ps.id AND s.end_time IS NULL
         GROUP BY l.id ORDER BY l.name'
    )->fetchAll();
    send_json($lots);
}

function handle_parking_start(string $method): void
{
    if ($method !== 'POST') send_json(['error' => 'Method not allowed'], 405);
    $session = require_account_session();
    $data = json_body();
    require_fields($data, ['lot_id']);
    $db = get_db();
    $db->beginTransaction();

    $active = $db->prepare('SELECT id FROM parking_sessions WHERE user_id = ? AND end_time IS NULL FOR UPDATE');
    $active->execute([$session['user_id']]);
    if ($active->fetch()) {
        $db->rollBack();
        send_json(['error' => 'You already have active parking'], 409);
    }

    $lotStmt = $db->prepare('SELECT * FROM parking_lots WHERE id = ? FOR UPDATE');
    $lotStmt->execute([$data['lot_id']]);
    $lot = $lotStmt->fetch();
    if (!$lot) {
        $db->rollBack();
        send_json(['error' => 'Lot not found'], 404);
    }
    $slotStmt = $db->prepare(
        'SELECT ps.id, ps.slot_number, ps.name FROM parking_slots ps
         LEFT JOIN parking_sessions s ON s.slot_id = ps.id AND s.end_time IS NULL
         WHERE ps.lot_id = ? AND ps.is_active = 1 AND s.id IS NULL
         ORDER BY ps.slot_number LIMIT 1 FOR UPDATE'
    );
    $slotStmt->execute([$lot['id']]);
    $slot = $slotStmt->fetch();
    if (!$slot) {
        $db->rollBack();
        send_json(['error' => 'No free slots available'], 409);
    }

    $insert = $db->prepare('INSERT INTO parking_sessions (slot_id, user_id, reg_number, start_time) VALUES (?, ?, ?, NOW())');
    $insert->execute([$slot['id'], $session['user_id'], $session['reg_number']]);
    $parkingId = (int)$db->lastInsertId();
    $startTime = $db->query('SELECT NOW()')->fetchColumn();
    $db->prepare('UPDATE users SET parking = ? WHERE id = ?')->execute([
        json_encode(['lot_id' => (int)$lot['id'], 'start_time' => $startTime, 'session_id' => $parkingId]), $session['user_id']
    ]);
    $parking = json_decode($lot['parking'] ?? '[]', true) ?: [];
    $parking[] = $parkingId;
    $db->prepare('UPDATE parking_lots SET parking = ? WHERE id = ?')->execute([json_encode($parking), $lot['id']]);
    $db->commit();
    send_json([
        'parking_id' => $parkingId,
        'lot_id' => (int)$lot['id'],
        'start_time' => $startTime,
        'slot_id' => (int)$slot['id'],
        'slot_number' => (int)$slot['slot_number'],
        'slot_name' => $slot['name'],
    ], 201);
}

function handle_parking_cancel(string $method): void
{
    if ($method !== 'POST') send_json(['error' => 'Method not allowed'], 405);
    $session = require_account_session();
    $db = get_db();
    $db->beginTransaction();
    $stmt = $db->prepare(
        'SELECT s.id, l.id AS lot_id, l.parking
         FROM parking_sessions s
         JOIN parking_slots ps ON ps.id = s.slot_id
         JOIN parking_lots l ON l.id = ps.lot_id
         WHERE s.user_id = ? AND s.end_time IS NULL FOR UPDATE'
    );
    $stmt->execute([$session['user_id']]);
    $parking = $stmt->fetch();
    if (!$parking) {
        $db->rollBack();
        send_json(['error' => 'No active parking'], 404);
    }

    $db->prepare('DELETE FROM parking_sessions WHERE id = ?')->execute([$parking['id']]);
    $db->prepare('UPDATE users SET parking = NULL WHERE id = ?')->execute([$session['user_id']]);
    $lotParking = array_values(array_filter(
        json_decode($parking['parking'] ?? '[]', true) ?: [],
        fn ($id) => (int)$id !== (int)$parking['id']
    ));
    $db->prepare('UPDATE parking_lots SET parking = ? WHERE id = ?')->execute([
        json_encode($lotParking),
        $parking['lot_id'],
    ]);
    $db->commit();
    send_json(['message' => 'Parking cancelled']);
}

function handle_parking_status(string $method): void
{
    if ($method !== 'GET') send_json(['error' => 'Method not allowed'], 405);
    $session = require_account_session();
    $activeParking = json_decode($session['parking'] ?? '', true);
    if (!is_array($activeParking) || empty($activeParking['lot_id']) || empty($activeParking['start_time'])) {
        send_json(['parking' => null]);
    }
    $stmt = get_db()->prepare(
        'SELECT id AS lot_id, name AS lot_name, price_first_3h, price_per_extra_hour
         FROM parking_lots WHERE id = ?'
    );
    $stmt->execute([$activeParking['lot_id']]);
    $parking = $stmt->fetch();
    if (!$parking) send_json(['parking' => null]);
    $parking['id'] = $activeParking['session_id'] ?? null;
    $parking['start_time'] = $activeParking['start_time'];
    $seconds = time() - (new DateTime($activeParking['start_time']))->getTimestamp();
    $parking['price'] = calculate_price($parking, $seconds);
    send_json(['parking' => $parking]);
}

function handle_parking_stop(string $method): void
{
    if ($method !== 'POST') send_json(['error' => 'Method not allowed'], 405);
    $session = require_account_session();
    $db = get_db();
    $db->beginTransaction();
    $stmt = $db->prepare(
        'SELECT s.*, l.id AS lot_id, l.name AS lot_name, l.parking, l.price_first_3h, l.price_per_extra_hour,
         ps.slot_number, ps.name AS slot_name
         FROM parking_sessions s
         JOIN users u ON u.id = s.user_id
         JOIN parking_slots ps ON ps.id = s.slot_id
         JOIN parking_lots l ON l.id = ps.lot_id
         WHERE s.user_id = ? AND s.end_time IS NULL FOR UPDATE'
    );
    $stmt->execute([$session['user_id']]);
    $parking = $stmt->fetch();
    if (!$parking) {
        $db->rollBack();
        send_json(['error' => 'No active parking'], 404);
    }
    $durationStmt = $db->prepare('SELECT TIMESTAMPDIFF(SECOND, ?, NOW())');
    $durationStmt->execute([$parking['start_time']]);
    $seconds = max(0, (int)$durationStmt->fetchColumn());
    $price = calculate_price($parking, $seconds);
    $db->prepare('UPDATE parking_sessions SET end_time = NOW(), price_charged = ? WHERE id = ?')->execute([$price, $parking['id']]);
    $db->prepare('UPDATE users SET parking = NULL WHERE id = ?')->execute([$session['user_id']]);
    $lotParking = array_values(array_filter(json_decode($parking['parking'] ?? '[]', true) ?: [], fn ($id) => (int)$id !== (int)$parking['id']));
    $db->prepare('UPDATE parking_lots SET parking = ? WHERE id = ?')->execute([json_encode($lotParking), $parking['lot_id']]);
    $db->commit();
    $slot = $parking['slot_name'] ?: 'Slot ' . $parking['slot_number'];
    send_json([
        'price_charged' => $price,
        'lot_name' => $parking['lot_name'],
        'slot' => $slot,
        'duration_minutes' => (int)round($seconds / 60),
    ]);
}

function handle_payments(string $method): void
{
    if ($method !== 'GET') send_json(['error' => 'Method not allowed'], 405);
    $session = require_account_session();
    $status = $_GET['status'] ?? 'open';
    if (!in_array($status, ['open', 'paid'], true)) send_json(['error' => 'Invalid status'], 400);
    $stmt = get_db()->prepare(
        'SELECT s.id, l.name AS lot_name, s.start_time, s.end_time, s.price_charged, s.status
         FROM parking_sessions s
         JOIN parking_slots ps ON ps.id = s.slot_id
         JOIN parking_lots l ON l.id = ps.lot_id
         WHERE s.user_id = ? AND s.end_time IS NOT NULL AND s.status = ?
         ORDER BY s.end_time DESC'
    );
    $stmt->execute([$session['user_id'], $status]);
    send_json($stmt->fetchAll());
}

function handle_payments_pay(string $method): void
{
    if ($method !== 'POST') send_json(['error' => 'Method not allowed'], 405);
    $session = require_account_session();
    $stmt = get_db()->prepare(
        "UPDATE parking_sessions SET status = 'paid' WHERE user_id = ? AND end_time IS NOT NULL AND status = 'open'"
    );
    $stmt->execute([$session['user_id']]);
    send_json(['paid_count' => $stmt->rowCount()]);
}
