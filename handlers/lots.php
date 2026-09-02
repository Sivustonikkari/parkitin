<?php
// REST handler for parking lots and their slot definitions.

require_once __DIR__ . '/../helpers.php';

function handle_lots(string $method): void
{
    $db = get_db();

    if ($method === 'GET') {
        if (isset($_GET['id'])) {
            $stmt = $db->prepare('SELECT * FROM parking_lots WHERE id = ?');
            $stmt->execute([$_GET['id']]);
            $lot = $stmt->fetch();
            if (!$lot) {
                send_json(['error' => 'Lot not found'], 404);
            }
            send_json($lot);
        }

        $rows = $db->query('SELECT * FROM parking_lots ORDER BY id')->fetchAll();
        send_json($rows);
    }

    if ($method === 'POST') {
        $data = json_body();
        require_fields($data, [
            'name', 'address', 'postal_code',
            'slots', 'price_first_3h', 'price_per_extra_hour',
        ]);
        $slots = validate_lot_slots($data['slots']);

        $city = post_office_for_postal_code(trim($data['postal_code']));
        if ($city === null) {
            send_json(['error' => 'Postal code not found'], 400);
        }
        $coordinates = geocode_address($data['address'], $data['postal_code'], $city);
        if ($coordinates === null) {
            send_json(['error' => 'Address could not be located'], 400);
        }

        if (!is_numeric($data['price_first_3h']) || !is_numeric($data['price_per_extra_hour'])) {
            send_json(['error' => 'prices must be numeric'], 400);
        }

        $db->beginTransaction();

        $stmt = $db->prepare(
            'INSERT INTO parking_lots (name, address, city, postal_code, latitude, longitude, info, capacity, price_first_3h, price_per_extra_hour)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $data['name'],
            $data['address'],
            $city,
            $data['postal_code'],
            $coordinates['latitude'],
            $coordinates['longitude'],
            $data['info'] ?? null,
            count($slots),
            $data['price_first_3h'],
            $data['price_per_extra_hour'],
        ]);
        $lotId = (int)$db->lastInsertId();

        $slotStmt = $db->prepare(
            'INSERT INTO parking_slots (lot_id, slot_number, name, is_active) VALUES (?, ?, ?, ?)'
        );
        foreach ($slots as $index => $slot) {
            $slotStmt->execute([$lotId, $index + 1, $slot['name'], $slot['is_active']]);
        }

        $db->commit();

        send_json(['id' => $lotId], 201);
    }

    if ($method === 'PUT') {
        if (!isset($_GET['id'])) {
            send_json(['error' => 'id is required'], 400);
        }

        $data = json_body();
        require_fields($data, [
            'name', 'address', 'postal_code',
            'slots', 'price_first_3h', 'price_per_extra_hour',
        ]);
        $slots = validate_lot_slots($data['slots']);

        $city = post_office_for_postal_code(trim($data['postal_code']));
        if ($city === null) {
            send_json(['error' => 'Postal code not found'], 400);
        }
        $coordinates = geocode_address($data['address'], $data['postal_code'], $city);
        if ($coordinates === null) {
            send_json(['error' => 'Address could not be located'], 400);
        }

        if (!is_numeric($data['price_first_3h']) || !is_numeric($data['price_per_extra_hour'])) {
            send_json(['error' => 'prices must be numeric'], 400);
        }

        $db->beginTransaction();

        $existingStmt = $db->prepare(
            'SELECT ps.id, ps.slot_number, ps.name, ps.is_active,
             EXISTS(SELECT 1 FROM parking_sessions s WHERE s.slot_id = ps.id AND s.end_time IS NULL) AS reserved
             FROM parking_slots ps WHERE ps.lot_id = ? FOR UPDATE'
        );
        $existingStmt->execute([$_GET['id']]);
        $existingSlots = $existingStmt->fetchAll();
        $existingIds = array_column($existingSlots, 'id');
        $submittedIds = array_filter(array_column($slots, 'id'));
        $submittedSlotIndexes = [];
        foreach ($slots as $index => $slot) {
            if ($slot['id'] !== null) {
                $submittedSlotIndexes[$slot['id']] = $index;
            }
        }
        if (array_diff($submittedIds, $existingIds)) {
            $db->rollBack();
            send_json(['error' => 'Invalid slot for this lot'], 400);
        }
        $deletedIds = array_diff($existingIds, $submittedIds);

        foreach ($existingSlots as $existingSlot) {
            if (!$existingSlot['reserved']) {
                continue;
            }
            $index = $submittedSlotIndexes[(int)$existingSlot['id']] ?? null;
            $submitted = $index === null ? null : $slots[$index];
            if ($submitted === null || (int)$existingSlot['slot_number'] !== $index + 1
                || ($existingSlot['name'] ?? null) !== $submitted['name']
                || (int)$existingSlot['is_active'] !== $submitted['is_active']) {
                $db->rollBack();
                send_json(['error' => 'A reserved slot cannot be edited, deleted, or renumbered'], 409);
            }
        }

        if ($deletedIds) {
            $placeholders = implode(',', array_fill(0, count($deletedIds), '?'));
            $sessionStmt = $db->prepare(
                "SELECT COUNT(*) FROM parking_sessions WHERE slot_id IN ($placeholders)"
            );
            $sessionStmt->execute(array_values($deletedIds));
            if ((int)$sessionStmt->fetchColumn() > 0) {
                $db->rollBack();
                send_json(['error' => 'A slot with parking history cannot be deleted'], 409);
            }

            $deleteStmt = $db->prepare("DELETE FROM parking_slots WHERE id IN ($placeholders)");
            $deleteStmt->execute(array_values($deletedIds));
        }

        $tempStmt = $db->prepare('UPDATE parking_slots SET slot_number = slot_number + 1000000 WHERE lot_id = ?');
        $tempStmt->execute([$_GET['id']]);
        $createSlotStmt = $db->prepare(
            'INSERT INTO parking_slots (lot_id, slot_number, name, is_active) VALUES (?, ?, ?, ?)'
        );
        $updateSlotStmt = $db->prepare(
            'UPDATE parking_slots SET slot_number = ?, name = ?, is_active = ? WHERE id = ? AND lot_id = ?'
        );
        foreach ($slots as $index => $slot) {
            if ($slot['id'] !== null) {
                $updateSlotStmt->execute([$index + 1, $slot['name'], $slot['is_active'], $slot['id'], $_GET['id']]);
            } else {
                $createSlotStmt->execute([$_GET['id'], $index + 1, $slot['name'], $slot['is_active']]);
            }
        }

        $stmt = $db->prepare(
            'UPDATE parking_lots SET name = ?, address = ?, city = ?, postal_code = ?, latitude = ?, longitude = ?, info = ?,
             capacity = ?, price_first_3h = ?, price_per_extra_hour = ? WHERE id = ?'
        );
        $stmt->execute([
            $data['name'],
            $data['address'],
            $city,
            $data['postal_code'],
            $coordinates['latitude'],
            $coordinates['longitude'],
            $data['info'] ?? null,
            count($slots),
            $data['price_first_3h'],
            $data['price_per_extra_hour'],
            $_GET['id'],
        ]);

        $db->commit();

        send_json(['message' => 'Lot updated']);
    }

    if ($method === 'DELETE') {
        if (!isset($_GET['id'])) {
            send_json(['error' => 'id is required'], 400);
        }

        $stmt = $db->prepare('DELETE FROM parking_lots WHERE id = ?');
        $stmt->execute([$_GET['id']]);

        if ($stmt->rowCount() === 0) {
            send_json(['error' => 'Lot not found'], 404);
        }

        send_json(['message' => 'Lot deleted']);
    }

    send_json(['error' => 'Method not allowed'], 405);
}

function validate_lot_slots($slots): array
{
    if (!is_array($slots) || count($slots) === 0) {
        send_json(['error' => 'slots must be a non-empty array'], 400);
    }

    $validated = [];
    foreach ($slots as $slot) {
        if (!is_array($slot)) {
            send_json(['error' => 'Invalid slot'], 400);
        }
        $name = trim((string)($slot['name'] ?? ''));
        if (strlen($name) > 100) {
            send_json(['error' => 'Slot name is too long'], 400);
        }
        $validated[] = [
            'id' => isset($slot['id']) && is_numeric($slot['id']) ? (int)$slot['id'] : null,
            'name' => $name === '' ? null : $name,
            'is_active' => !empty($slot['is_active']) ? 1 : 0,
        ];
    }
    return $validated;
}
