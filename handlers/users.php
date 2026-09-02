<?php
// REST handler for user management and role-based changes.

require_once __DIR__ . '/../helpers.php';

function handle_users(string $method): void
{
    $db = get_db();
    $actor = current_admin_actor();

    if ($method === 'GET') {
        if (isset($_GET['id'])) {
            $stmt = $db->prepare('SELECT * FROM users WHERE id = ?');
            $stmt->execute([$_GET['id']]);
        } elseif (isset($_GET['reg_number'])) {
            $stmt = $db->prepare('SELECT * FROM users WHERE reg_number = ?');
            $stmt->execute([$_GET['reg_number']]);
        } else {
            $rows = $db->query('SELECT * FROM users ORDER BY id')->fetchAll();
            send_json(array_map('add_user_post_office', $rows));
        }

        $user = $stmt->fetch();
        if (!$user) {
            send_json(['error' => 'User not found'], 404);
        }
        send_json(add_user_post_office($user));
    }

    if ($method === 'POST') {
        $data = json_body();
        require_fields($data, ['reg_number', 'email', 'first_name', 'last_name', 'postal_code', 'role', 'status']);
        require_valid_email($data['email']);
        require_user_role_and_status($data);
        require_user_management_permission($actor, $data['role']);

        try {
            $stmt = $db->prepare(
                'INSERT INTO users (reg_number, email, first_name, last_name, postal_code, role, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([
                $data['reg_number'],
                $data['email'],
                $data['first_name'],
                $data['last_name'],
                $data['postal_code'],
                $data['role'],
                $data['status'],
            ]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                send_json(['error' => 'A user with this reg_number already exists'], 409);
            }
            throw $e;
        }

        send_json(['id' => (int)$db->lastInsertId()], 201);
    }

    if ($method === 'PUT') {
        if (!isset($_GET['id'])) {
            send_json(['error' => 'id is required'], 400);
        }

        $data = json_body();
        require_fields($data, ['reg_number', 'email', 'first_name', 'last_name', 'postal_code', 'role', 'status']);
        require_valid_email($data['email']);
        require_user_role_and_status($data);

        $target = find_user_by_id($db, $_GET['id']);
        require_user_management_permission($actor, $target['role']);
        require_user_management_permission($actor, $data['role']);

        try {
            $stmt = $db->prepare(
                'UPDATE users SET reg_number = ?, email = ?, first_name = ?, last_name = ?,
                 postal_code = ?, role = ?, status = ? WHERE id = ?'
            );
            $stmt->execute([
                $data['reg_number'],
                $data['email'],
                $data['first_name'],
                $data['last_name'],
                $data['postal_code'],
                $data['role'],
                $data['status'],
                $_GET['id'],
            ]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                send_json(['error' => 'A user with this reg_number or email already exists'], 409);
            }
            throw $e;
        }

        if ($stmt->rowCount() === 0) {
            send_json(['error' => 'User not found'], 404);
        }

        send_json(['message' => 'User updated']);
    }

    if ($method === 'DELETE') {
        if (!isset($_GET['id'])) {
            send_json(['error' => 'id is required'], 400);
        }

        $target = find_user_by_id($db, $_GET['id']);
        require_user_management_permission($actor, $target['role']);

        $stmt = $db->prepare('DELETE FROM users WHERE id = ?');
        $stmt->execute([$_GET['id']]);

        if ($stmt->rowCount() === 0) {
            send_json(['error' => 'User not found'], 404);
        }

        send_json(['message' => 'User deleted']);
    }

    send_json(['error' => 'Method not allowed'], 405);
}

function current_admin_actor(): ?array
{
    if (($_SERVER['HTTP_X_API_KEY'] ?? '') !== '') {
        return null;
    }

    return require_account_session();
}

function require_user_management_permission(?array $actor, string $targetRole): void
{
    if ($actor === null) {
        return;
    }
    if ($actor['role'] === 'owner' && $targetRole !== 'owner') {
        return;
    }
    if ($actor['role'] === 'admin' && $targetRole === 'customer') {
        return;
    }

    send_json(['error' => 'Forbidden'], 403);
}

function find_user_by_id(PDO $db, int $id): array
{
    $stmt = $db->prepare('SELECT * FROM users WHERE id = ?');
    $stmt->execute([$id]);
    $user = $stmt->fetch();
    if (!$user) {
        send_json(['error' => 'User not found'], 404);
    }
    return $user;
}

function add_user_post_office(array $user): array
{
    $user['city'] = $user['postal_code'] === null ? null : post_office_for_postal_code($user['postal_code']);
    return $user;
}

function require_user_role_and_status(array $data): void
{
    if (!in_array($data['role'], ['owner', 'admin', 'customer'], true)) {
        send_json(['error' => 'Invalid role'], 400);
    }
    if (!in_array($data['status'], ['pending', 'confirmed'], true)) {
        send_json(['error' => 'Invalid status'], 400);
    }
    if (!preg_match('/^\d{5}$/', $data['postal_code'])) {
        send_json(['error' => 'Invalid postal code'], 400);
    }
}

// finds an existing user by reg_number, or creates a minimal one
function find_or_create_user(PDO $db, string $regNumber): array
{
    $stmt = $db->prepare('SELECT * FROM users WHERE reg_number = ?');
    $stmt->execute([$regNumber]);
    $user = $stmt->fetch();
    if ($user) {
        return $user;
    }

    $stmt = $db->prepare(
        'INSERT INTO users (reg_number) VALUES (?)'
    );
    $stmt->execute([$regNumber]);
    $id = (int)$db->lastInsertId();

    $stmt = $db->prepare('SELECT * FROM users WHERE id = ?');
    $stmt->execute([$id]);
    return $stmt->fetch();
}
