<?php
// Shared JSON, input validation, email, and city lookup helpers.

function send_json($data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

function json_body(): array
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function require_fields(array $data, array $fields): void
{
    foreach ($fields as $field) {
        if (!array_key_exists($field, $data) || $data[$field] === '' || $data[$field] === null) {
            send_json(['error' => "Missing required field: $field"], 400);
        }
    }
}

function require_valid_email(string $email): void
{
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        send_json(['error' => 'Invalid email'], 400);
    }
}

function post_office_for_postal_code(string $postalCode): ?string
{
    static $postOffices = null;

    if ($postOffices === null) {
        $postOffices = [];
        $xml = simplexml_load_file(__DIR__ . '/assets/postitoimipaikat.xml');
        foreach ($xml->toimipaikka as $office) {
            $code = trim((string)$office->postinumero);
            $name = implode(' - ', array_filter(array_map(
                fn (string $part): string => preg_replace('/\s+\d+$/', '', trim($part)),
                explode('-', (string)$office->nimi)
            )));
            if ($code !== '' && $name !== '' && !isset($postOffices[$code])) {
                $postOffices[$code] = $name;
            }
        }
    }

    return $postOffices[$postalCode] ?? null;
}

function geocode_address(string $address, string $postalCode, string $city): ?array
{
    $query = http_build_query([
        'format' => 'jsonv2',
        'limit' => 1,
        'countrycodes' => 'fi',
        'q' => "$address, $postalCode $city, Finland",
    ]);
    $request = curl_init("https://nominatim.openstreetmap.org/search?$query");
    curl_setopt_array($request, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_HTTPHEADER => ['User-Agent: Parkitin/1.0 (https://testinikkari.fi/parkitin)'],
    ]);
    $response = curl_exec($request);
    $status = curl_getinfo($request, CURLINFO_RESPONSE_CODE);

    $results = json_decode($response ?: '', true);
    if ($status !== 200 || !isset($results[0]['lat'], $results[0]['lon'])) {
        return null;
    }

    return ['latitude' => (float)$results[0]['lat'], 'longitude' => (float)$results[0]['lon']];
}

// the very first user in the system becomes owner, everyone after is a customer
function role_for_new_user(PDO $db): string
{
    $count = (int)$db->query('SELECT COUNT(*) FROM users')->fetchColumn();
    return $count === 0 ? 'owner' : 'customer';
}
