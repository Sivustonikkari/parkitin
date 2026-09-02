<?php

require_once __DIR__ . '/../helpers.php';

function handle_slots(string $method): void
{
    if ($method !== 'GET') {
        send_json(['error' => 'Method not allowed'], 405);
    }

    if (!isset($_GET['lot_id'])) {
        send_json(['error' => 'lot_id is required'], 400);
    }

    $db = get_db();
    $sql = "SELECT s.id, s.lot_id, s.slot_number, s.name, s.is_active,
                   (ps.id IS NOT NULL) AS occupied
            FROM parking_slots s
            LEFT JOIN parking_sessions ps ON ps.slot_id = s.id AND ps.end_time IS NULL
            WHERE s.lot_id = ?";
    $params = [$_GET['lot_id']];

    if (isset($_GET['status'])) {
        if ($_GET['status'] === 'free') {
            $sql .= ' HAVING occupied = 0';
        } elseif ($_GET['status'] === 'occupied') {
            $sql .= ' HAVING occupied = 1';
        }
    }

    $sql .= ' ORDER BY s.slot_number';

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    send_json($stmt->fetchAll());
}

function handle_free_slot(string $method): void
{
    if ($method !== 'GET') {
        send_json(['error' => 'Method not allowed'], 405);
    }

    if (!isset($_GET['lot_id'])) {
        send_json(['error' => 'lot_id is required'], 400);
    }

    $db = get_db();
    $stmt = $db->prepare(
        'SELECT s.id, s.lot_id, s.slot_number, s.name
         FROM parking_slots s
         LEFT JOIN parking_sessions ps ON ps.slot_id = s.id AND ps.end_time IS NULL
         WHERE s.lot_id = ? AND s.is_active = 1 AND ps.id IS NULL
         ORDER BY s.slot_number
         LIMIT 1'
    );
    $stmt->execute([$_GET['lot_id']]);
    $slot = $stmt->fetch();

    if (!$slot) {
        send_json(['error' => 'No free slot available'], 404);
    }

    send_json($slot);
}
