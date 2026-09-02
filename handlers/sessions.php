<?php
// Handler for starting and ending vehicle parking sessions.

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/users.php';

function calculate_price(array $lot, int $seconds): float
{
    $minutes = max(1, (int)ceil($seconds / 60));
    $firstThreeHours = min($minutes, 180);
    $remainingMinutes = max(0, $minutes - 180);

    return $firstThreeHours * (float)$lot['price_first_3h']
        + $remainingMinutes * (float)$lot['price_per_extra_hour'];
}

function handle_sessions(string $method): void
{
    if ($method !== 'POST') {
        send_json(['error' => 'Method not allowed'], 405);
    }

    $db = get_db();
    $data = json_body();
    require_fields($data, ['reg_number', 'lot_id']);

    $lotStmt = $db->prepare('SELECT * FROM parking_lots WHERE id = ?');
    $lotStmt->execute([$data['lot_id']]);
    $lot = $lotStmt->fetch();
    if (!$lot) {
        send_json(['error' => 'Lot not found'], 404);
    }

    $db->beginTransaction();

    $user = find_or_create_user($db, $data['reg_number']);
    $activeStmt = $db->prepare('SELECT id FROM parking_sessions WHERE user_id = ? AND end_time IS NULL FOR UPDATE');
    $activeStmt->execute([$user['id']]);
    if ($activeStmt->fetch()) {
        $db->rollBack();
        send_json(['error' => 'User already has active parking'], 409);
    }

    // lock a free slot for this lot to avoid double check-in races
    $slotStmt = $db->prepare(
        'SELECT s.id FROM parking_slots s
         LEFT JOIN parking_sessions ps ON ps.slot_id = s.id AND ps.end_time IS NULL
         WHERE s.lot_id = ? AND s.is_active = 1 AND ps.id IS NULL
         ORDER BY s.slot_number LIMIT 1 FOR UPDATE'
    );
    $slotStmt->execute([$data['lot_id']]);
    $slot = $slotStmt->fetch();

    if (!$slot) {
        $db->rollBack();
        send_json(['error' => 'No free slot available'], 409);
    }

    $insert = $db->prepare(
        'INSERT INTO parking_sessions (slot_id, user_id, reg_number, start_time)
         VALUES (?, ?, ?, NOW())'
    );
    $insert->execute([$slot['id'], $user['id'], $data['reg_number']]);
    $sessionId = (int)$db->lastInsertId();
    $startTime = $db->query('SELECT NOW()')->fetchColumn();
    $db->prepare('UPDATE users SET parking = ? WHERE id = ?')->execute([
        json_encode(['lot_id' => (int)$lot['id'], 'start_time' => $startTime, 'session_id' => $sessionId]), $user['id']
    ]);
    $lotParking = json_decode($lot['parking'] ?? '[]', true) ?: [];
    $lotParking[] = $sessionId;
    $db->prepare('UPDATE parking_lots SET parking = ? WHERE id = ?')->execute([json_encode($lotParking), $lot['id']]);

    $db->commit();

    send_json(['session_id' => $sessionId, 'slot_id' => (int)$slot['id']], 201);
}

function handle_session_end(string $method): void
{
    if ($method !== 'POST') {
        send_json(['error' => 'Method not allowed'], 405);
    }

    $db = get_db();
    $data = json_body();

    if (empty($data['session_id']) && empty($data['slot_id'])) {
        send_json(['error' => 'session_id or slot_id is required'], 400);
    }

    if (!empty($data['session_id'])) {
        $stmt = $db->prepare('SELECT * FROM parking_sessions WHERE id = ?');
        $stmt->execute([$data['session_id']]);
    } else {
        $stmt = $db->prepare('SELECT * FROM parking_sessions WHERE slot_id = ? AND end_time IS NULL');
        $stmt->execute([$data['slot_id']]);
    }
    $session = $stmt->fetch();

    if (!$session) {
        send_json(['error' => 'Active session not found'], 404);
    }
    if ($session['end_time'] !== null) {
        send_json(['error' => 'Session already closed'], 400);
    }

    $lotStmt = $db->prepare(
        'SELECT l.* FROM parking_lots l
         JOIN parking_slots s ON s.lot_id = l.id
         WHERE s.id = ?'
    );
    $lotStmt->execute([$session['slot_id']]);
    $lot = $lotStmt->fetch();

    $start = new DateTime($session['start_time']);
    $end = new DateTime();
    $seconds = $end->getTimestamp() - $start->getTimestamp();
    $price = calculate_price($lot, $seconds);

    $update = $db->prepare(
        'UPDATE parking_sessions SET end_time = NOW(), price_charged = ? WHERE id = ?'
    );
    $update->execute([$price, $session['id']]);
    $db->prepare('UPDATE users SET parking = NULL WHERE id = ?')->execute([$session['user_id']]);
    $lotParking = array_values(array_filter(json_decode($lot['parking'] ?? '[]', true) ?: [], fn ($id) => (int)$id !== (int)$session['id']));
    $db->prepare('UPDATE parking_lots SET parking = ? WHERE id = ?')->execute([json_encode($lotParking), $lot['id']]);

    send_json([
        'session_id' => (int)$session['id'],
        'price_charged' => $price,
    ]);
}
