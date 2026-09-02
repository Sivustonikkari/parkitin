<?php
// REST API router and entry point for resource authorization.

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../handlers/lots.php';
require_once __DIR__ . '/../handlers/slots.php';
require_once __DIR__ . '/../handlers/users.php';
require_once __DIR__ . '/../handlers/sessions.php';
require_once __DIR__ . '/../handlers/account.php';

set_exception_handler(function (Throwable $e) {
    error_log($e->getMessage());
    send_json(['error' => 'Internal server error'], 500);
});

$resource = $_GET['resource'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

// account endpoints have their own session-token auth, not the driver-API key
$accountResources = ['login_request', 'register', 'verify', 'me', 'update_profile', 'delete_profile', 'map_lots', 'parking_start', 'parking_cancel', 'parking_stop', 'parking_status', 'payments', 'payments_pay'];
// admin resources also accept an owner/admin session, for the in-browser admin panel
$dualAuthResources = ['lots', 'slots', 'users'];

if (in_array($resource, $dualAuthResources, true)) {
    require_api_key_or_admin_session();
} elseif (!in_array($resource, $accountResources, true)) {
    require_api_key();
}

switch ($resource) {
    case 'lots':
        handle_lots($method);
        break;
    case 'slots':
        handle_slots($method);
        break;
    case 'free_slot':
        handle_free_slot($method);
        break;
    case 'users':
        handle_users($method);
        break;
    case 'sessions':
        handle_sessions($method);
        break;
    case 'sessions_end':
        handle_session_end($method);
        break;
    case 'login_request':
        handle_login_request($method);
        break;
    case 'register':
        handle_register($method);
        break;
    case 'verify':
        handle_verify($method);
        break;
    case 'me':
        handle_me($method);
        break;
    case 'update_profile':
        handle_update_profile($method);
        break;
    case 'delete_profile':
        handle_delete_profile($method);
        break;
    case 'map_lots':
        handle_map_lots($method);
        break;
    case 'parking_start':
        handle_parking_start($method);
        break;
    case 'parking_cancel':
        handle_parking_cancel($method);
        break;
    case 'parking_stop':
        handle_parking_stop($method);
        break;
    case 'parking_status':
        handle_parking_status($method);
        break;
    case 'payments':
        handle_payments($method);
        break;
    case 'payments_pay':
        handle_payments_pay($method);
        break;
    default:
        send_json(['error' => 'Unknown resource'], 404);
}
