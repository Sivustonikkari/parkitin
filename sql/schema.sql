-- Parkitin database schema
-- Run this against dbttx_parkitin
-- Kaikkien pysäköinti-, käyttäjä-, istunto- ja maksutaulujen rakenne.

CREATE TABLE IF NOT EXISTS parking_lots (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(150) NOT NULL,
    address VARCHAR(200) NOT NULL,
    city VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    latitude DECIMAL(10,7) NULL,
    longitude DECIMAL(10,7) NULL,
    info TEXT NULL,
    capacity INT UNSIGNED NOT NULL,
    price_first_3h DECIMAL(8,2) NOT NULL,
    price_per_extra_hour DECIMAL(8,2) NOT NULL,
    parking TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS parking_slots (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    lot_id INT UNSIGNED NOT NULL,
    slot_number INT UNSIGNED NOT NULL,
    name VARCHAR(100) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    UNIQUE KEY uq_lot_slot_number (lot_id, slot_number),
    CONSTRAINT fk_slots_lot FOREIGN KEY (lot_id) REFERENCES parking_lots (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Single table for both driver records and email-login portal accounts
CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    email VARCHAR(150) NULL,
    reg_number VARCHAR(20) NULL,
    first_name VARCHAR(100) NULL,
    last_name VARCHAR(100) NULL,
    postal_code VARCHAR(20) NULL,
    parking TEXT NULL,
    role ENUM('owner', 'admin', 'customer') NOT NULL DEFAULT 'customer',
    status ENUM('pending', 'confirmed') NOT NULL DEFAULT 'confirmed',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email (email),
    UNIQUE KEY uq_users_reg_number (reg_number),
    CONSTRAINT chk_users_email CHECK (email REGEXP '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS parking_sessions (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    slot_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    reg_number VARCHAR(20) NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME NULL,
    price_charged DECIMAL(8,2) NULL,
    status ENUM('open', 'paid') NOT NULL DEFAULT 'open',
    PRIMARY KEY (id),
    KEY idx_sessions_slot (slot_id),
    KEY idx_sessions_user (user_id),
    KEY idx_sessions_open (slot_id, end_time),
    CONSTRAINT fk_sessions_slot FOREIGN KEY (slot_id) REFERENCES parking_slots (id) ON DELETE CASCADE,
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS api_keys (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    key_hash VARCHAR(255) NOT NULL,
    label VARCHAR(100) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- single-use magic-link tokens emailed to users
CREATE TABLE IF NOT EXISTS login_tokens (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_login_tokens_user (user_id),
    CONSTRAINT fk_login_tokens_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- active 1-hour app sessions issued after a successful magic-link click
CREATE TABLE IF NOT EXISTS user_sessions (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_user_sessions_user (user_id),
    CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

