<?php
// One-time database import of Digitraffic-shaped parking data.

// One-off CLI import: mock data shaped like Digitraffic's Parking Facilities API
// (https://tie.digitraffic.fi) — GeoJSON FeatureCollection of parking facilities.
// Run with: php scripts/import_digitraffic.php

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

$mockFile = __DIR__ . '/digitraffic-mock.json';
$data = json_decode(file_get_contents($mockFile), true);

if (!is_array($data) || empty($data['features'])) {
    fwrite(STDERR, "Could not read mock Digitraffic data from $mockFile\n");
    exit(1);
}

// Digitraffic doesn't publish pricing, so mock started-minute rates are used.
const DEFAULT_PRICE_FIRST_3H = 0.50;
const DEFAULT_PRICE_PER_EXTRA_HOUR = 0.30;

$db = get_db();

foreach ($data['features'] as $feature) {
    $props = $feature['properties'] ?? [];
    $name = $props['name'] ?? null;
    $address = $props['streetAddress'] ?? null;
    $postalCode = $props['postalCode'] ?? null;
    $capacity = (int)($props['maxCapacity'] ?? 0);
    $coordinates = $feature['geometry']['coordinates'] ?? [];
    $longitude = isset($coordinates[0]) ? (float)$coordinates[0] : null;
    $latitude = isset($coordinates[1]) ? (float)$coordinates[1] : null;

    if (!$name || !$address || !$postalCode || $capacity <= 0) {
        echo "Skipping incomplete facility: " . ($name ?? 'unknown') . "\n";
        continue;
    }

    $existsStmt = $db->prepare('SELECT id FROM parking_lots WHERE name = ?');
    $existsStmt->execute([$name]);
    $existing = $existsStmt->fetch();
    if ($existing) {
        $db->prepare('UPDATE parking_lots SET latitude = ?, longitude = ? WHERE id = ?')
            ->execute([$latitude, $longitude, $existing['id']]);
        echo "Skipping '$name', already imported\n";
        continue;
    }

    $city = post_office_for_postal_code($postalCode);
    if ($city === null) {
        echo "Skipping '$name', unknown postal code $postalCode\n";
        continue;
    }

    $db->beginTransaction();

    $insertLot = $db->prepare(
        'INSERT INTO parking_lots (name, address, city, postal_code, latitude, longitude, info, capacity, price_first_3h, price_per_extra_hour)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $info = 'Imported from Digitraffic mock data (operator: ' . ($props['operatorName'] ?? 'unknown') . ')';
    $insertLot->execute([
        $name, $address, $city, $postalCode, $latitude, $longitude, $info,
        $capacity, DEFAULT_PRICE_FIRST_3H, DEFAULT_PRICE_PER_EXTRA_HOUR,
    ]);
    $lotId = (int)$db->lastInsertId();

    $insertSlot = $db->prepare('INSERT INTO parking_slots (lot_id, slot_number) VALUES (?, ?)');
    for ($i = 1; $i <= $capacity; $i++) {
        $insertSlot->execute([$lotId, $i]);
    }

    $db->commit();

    echo "Imported '$name' ($city) with $capacity slots (lot id $lotId)\n";
}

echo "Done.\n";
