<?php
// API key and logged-in user session verification.

require_once __DIR__ . '/db.php';

function require_api_key(): void
{
    $key = $_SERVER['HTTP_X_API_KEY'] ?? '';
    if ($key === '') {
        send_json(['error' => 'Missing X-Api-Key header'], 401);
    }

    if (hash_equals(DEV_API_KEY, $key)) {
        return;
    }

    $stmt = get_db()->query('SELECT key_hash FROM api_keys');
    foreach ($stmt->fetchAll() as $row) {
        if (password_verify($key, $row['key_hash'])) {
            return;
        }
    }

    send_json(['error' => 'Invalid API key'], 401);
}

// allows either the driver X-Api-Key header, or an owner/admin account session
function require_api_key_or_admin_session(): void
{
    if (($_SERVER['HTTP_X_API_KEY'] ?? '') !== '') {
        require_api_key();
        return;
    }

    $session = require_account_session();
    if (!in_array($session['role'], ['owner', 'admin'], true)) {
        send_json(['error' => 'Forbidden'], 403);
    }
}
