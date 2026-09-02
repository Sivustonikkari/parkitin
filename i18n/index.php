<?php

// lists available locales (metadata only, not full translations) for the language switcher
header('Content-Type: application/json');

$locales = [];
foreach (glob(__DIR__ . '/*.json') as $file) {
    $data = json_decode(file_get_contents($file), true);
    if (!is_array($data) || !isset($data['locale'])) {
        continue;
    }

    $locales[] = [
        'locale' => $data['locale'],
        'name' => $data['name'] ?? $data['locale'],
        'default' => (bool)($data['default'] ?? false),
    ];
}

echo json_encode($locales);
