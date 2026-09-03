<?php
// Plate-recognition camera simulation: starts and stops parking by registration plate.

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/sessions.php';

function camera_normalize_plate(string $plate): string
{
    return mb_strtoupper(trim($plate), 'UTF-8');
}

function camera_plate_is_valid(string $plate): bool
{
    return (bool)preg_match('/^[A-ZÅÄÖ]{1,3}-[0-9]{1,3}$/u', camera_normalize_plate($plate));
}

function camera_user_summary(array $user): array
{
    return [
        'id' => (int)$user['id'],
        'reg_number' => $user['reg_number'],
        'email' => $user['email'],
        'first_name' => $user['first_name'],
        'last_name' => $user['last_name'],
    ];
}

// Starts parking exactly like the manual flow: locks a free slot and writes the same session rows.
function camera_start_parking(string $plate, int $lotId): array
{
    $plate = camera_normalize_plate($plate);
    if (!camera_plate_is_valid($plate)) {
        return ['ok' => false, 'status' => 400, 'error' => 'invalid_plate'];
    }

    $db = get_db();
    $db->beginTransaction();

    $userStmt = $db->prepare(
        'SELECT id, email, first_name, last_name, reg_number FROM users WHERE reg_number = ? FOR UPDATE'
    );
    $userStmt->execute([$plate]);
    $user = $userStmt->fetch();
    if (!$user) {
        $db->rollBack();
        return ['ok' => false, 'status' => 404, 'error' => 'plate_not_found'];
    }

    $active = $db->prepare('SELECT id FROM parking_sessions WHERE user_id = ? AND end_time IS NULL FOR UPDATE');
    $active->execute([$user['id']]);
    if ($active->fetch()) {
        $db->rollBack();
        return ['ok' => false, 'status' => 409, 'error' => 'already_parking'];
    }

    $lotStmt = $db->prepare('SELECT * FROM parking_lots WHERE id = ? FOR UPDATE');
    $lotStmt->execute([$lotId]);
    $lot = $lotStmt->fetch();
    if (!$lot) {
        $db->rollBack();
        return ['ok' => false, 'status' => 404, 'error' => 'lot_not_found'];
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
        return ['ok' => false, 'status' => 409, 'error' => 'lot_full'];
    }

    $insert = $db->prepare(
        'INSERT INTO parking_sessions (slot_id, user_id, reg_number, start_time) VALUES (?, ?, ?, NOW())'
    );
    $insert->execute([$slot['id'], $user['id'], $plate]);
    $parkingId = (int)$db->lastInsertId();
    $startTime = $db->query('SELECT NOW()')->fetchColumn();

    $db->prepare('UPDATE users SET parking = ? WHERE id = ?')->execute([
        json_encode(['lot_id' => (int)$lot['id'], 'start_time' => $startTime, 'session_id' => $parkingId]),
        $user['id'],
    ]);

    $lotParking = json_decode($lot['parking'] ?? '[]', true) ?: [];
    $lotParking[] = $parkingId;
    $db->prepare('UPDATE parking_lots SET parking = ? WHERE id = ?')->execute([
        json_encode($lotParking),
        $lot['id'],
    ]);

    $db->commit();

    return [
        'ok' => true,
        'status' => 201,
        'data' => [
            'plate' => $plate,
            'user' => camera_user_summary($user),
            'parking_id' => $parkingId,
            'lot_id' => (int)$lot['id'],
            'lot_name' => $lot['name'],
            'lot_address' => $lot['address'],
            'lot_city' => $lot['city'],
            'slot' => $slot['name'] ?: 'Paikka ' . $slot['slot_number'],
            'start_time' => $startTime,
        ],
    ];
}

// Ends parking exactly like the manual flow, leaving the session as an open invoice.
function camera_stop_parking(string $plate): array
{
    $plate = camera_normalize_plate($plate);
    if (!camera_plate_is_valid($plate)) {
        return ['ok' => false, 'status' => 400, 'error' => 'invalid_plate'];
    }

    $db = get_db();
    $db->beginTransaction();

    $userStmt = $db->prepare(
        'SELECT id, email, first_name, last_name, reg_number FROM users WHERE reg_number = ? FOR UPDATE'
    );
    $userStmt->execute([$plate]);
    $user = $userStmt->fetch();
    if (!$user) {
        $db->rollBack();
        return ['ok' => false, 'status' => 404, 'error' => 'plate_not_found'];
    }

    $stmt = $db->prepare(
        'SELECT s.*, l.id AS lot_id, l.name AS lot_name, l.parking, l.price_first_3h, l.price_per_extra_hour,
         ps.slot_number, ps.name AS slot_name
         FROM parking_sessions s
         JOIN parking_slots ps ON ps.id = s.slot_id
         JOIN parking_lots l ON l.id = ps.lot_id
         WHERE s.user_id = ? AND s.end_time IS NULL FOR UPDATE'
    );
    $stmt->execute([$user['id']]);
    $parking = $stmt->fetch();
    if (!$parking) {
        $db->rollBack();
        return ['ok' => false, 'status' => 404, 'error' => 'no_active_parking'];
    }

    $durationStmt = $db->prepare('SELECT TIMESTAMPDIFF(SECOND, ?, NOW())');
    $durationStmt->execute([$parking['start_time']]);
    $seconds = max(0, (int)$durationStmt->fetchColumn());
    $price = calculate_price($parking, $seconds);

    $db->prepare('UPDATE parking_sessions SET end_time = NOW(), price_charged = ? WHERE id = ?')
        ->execute([$price, $parking['id']]);
    $db->prepare('UPDATE users SET parking = NULL WHERE id = ?')->execute([$user['id']]);

    $lotParking = array_values(array_filter(
        json_decode($parking['parking'] ?? '[]', true) ?: [],
        fn ($id) => (int)$id !== (int)$parking['id']
    ));
    $db->prepare('UPDATE parking_lots SET parking = ? WHERE id = ?')->execute([
        json_encode($lotParking),
        $parking['lot_id'],
    ]);

    $db->commit();

    return [
        'ok' => true,
        'status' => 200,
        'data' => [
            'plate' => $plate,
            'user' => camera_user_summary($user),
            'parking_id' => (int)$parking['id'],
            'lot_id' => (int)$parking['lot_id'],
            'lot_name' => $parking['lot_name'],
            'slot' => $parking['slot_name'] ?: 'Paikka ' . $parking['slot_number'],
            'start_time' => $parking['start_time'],
            'duration_minutes' => (int)round($seconds / 60),
            'price_charged' => $price,
        ],
    ];
}

function camera_search_lots(string $query, int $limit = 25): array
{
    $like = '%' . $query . '%';
    $stmt = get_db()->prepare(
        'SELECT id, name, address, postal_code, city FROM parking_lots
         WHERE CAST(id AS CHAR) = ? OR name LIKE ? OR address LIKE ? OR city LIKE ?
         ORDER BY name LIMIT ' . max(1, $limit)
    );
    $stmt->execute([$query, $like, $like, $like]);
    return $stmt->fetchAll();
}

// Resolves free-text autocomplete input into a single lot, preferring a leading numeric id.
function camera_resolve_lot(string $query): array
{
    $query = trim($query);
    if ($query === '') {
        return ['ok' => false, 'error' => 'lot_not_found'];
    }

    if (preg_match('/^(\d+)/', $query, $match)) {
        $stmt = get_db()->prepare('SELECT id, name, address, postal_code, city FROM parking_lots WHERE id = ?');
        $stmt->execute([(int)$match[1]]);
        $lot = $stmt->fetch();
        if ($lot) {
            return ['ok' => true, 'lot' => $lot];
        }
    }

    $matches = camera_search_lots($query);
    if (count($matches) === 1) {
        return ['ok' => true, 'lot' => $matches[0]];
    }
    if (count($matches) === 0) {
        return ['ok' => false, 'error' => 'lot_not_found'];
    }

    return ['ok' => false, 'error' => 'lot_ambiguous', 'matches' => $matches];
}

function handle_camera_start(string $method): void
{
    if ($method !== 'POST') {
        send_json(['error' => 'Method not allowed'], 405);
    }

    $data = json_body();
    require_fields($data, ['plate', 'lot_id']);
    if (!is_numeric($data['lot_id'])) {
        send_json(['error' => 'lot_id must be numeric'], 400);
    }

    $result = camera_start_parking((string)$data['plate'], (int)$data['lot_id']);
    if (!$result['ok']) {
        send_json(['error' => $result['error']], $result['status']);
    }

    send_json($result['data'], $result['status']);
}

function handle_camera_stop(string $method): void
{
    if ($method !== 'POST') {
        send_json(['error' => 'Method not allowed'], 405);
    }

    $data = json_body();
    require_fields($data, ['plate']);

    $result = camera_stop_parking((string)$data['plate']);
    if (!$result['ok']) {
        send_json(['error' => $result['error']], $result['status']);
    }

    send_json($result['data'], $result['status']);
}

function handle_camera_lots(string $method): void
{
    if ($method !== 'GET') {
        send_json(['error' => 'Method not allowed'], 405);
    }

    send_json(camera_search_lots(trim((string)($_GET['q'] ?? ''))));
}
