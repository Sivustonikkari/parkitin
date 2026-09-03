---
name: litespeed-server-session
description: "Use when deploying, building, testing, or debugging the Parkitin Node.js server on a LiteSpeed host"
applyTo: "src/server/**,package.json,tsconfig.server.json,.env.example,server/**,deploy/**"
---

# Parkitin Server Session Context

## Project

- Repository: `git@github.com:Sivustonikkari/parkitin.git`
- Active migration branch: `typescriptify`
- This project is being migrated from PHP to native Node.js and TypeScript.
- PHP files, Composer files, and the PHP vendor directory have been removed. Do not recreate them.
- The browser UI remains vanilla TypeScript and CSS. Do not add Express, Fastify, Nest, React, Vue, an ORM, or a map library.

## Production Environment

- The production web server is LiteSpeed.
- LiteSpeed serves static files and reverse-proxies the long-running Node.js process.
- Node should listen on `127.0.0.1`, normally port `3020`.
- The public application routes are `/`, `/camera/`, `/api`, and `/i18n`.
- Configure LiteSpeed to proxy `/api`, `/camera/`, and `/i18n` to Node while serving static assets from the repository.
- Use the hosting provider's Node process manager when available. Otherwise use a suitable process supervisor such as systemd. Do not expose Node directly to the public internet.

## Server Commands

Run these on the LiteSpeed server after cloning or pulling:

```bash
git clone -b typescriptify git@github.com:Sivustonikkari/parkitin.git
cd parkitin
corepack enable
yarn install --frozen-lockfile
yarn build
yarn build-server
cp .env.example .env
chmod 600 .env
```

Edit `.env` with real server values, then test:

```bash
set -a
. ./.env
set +a
node build/server/index.js
```

In another SSH session:

```bash
curl -i http://127.0.0.1:3020/health
curl -i http://127.0.0.1:3020/
curl -i http://127.0.0.1:3020/camera/
curl -i http://127.0.0.1:3020/i18n
```

Expected health response:

```json
{"status":"ok"}
```

## Environment

Required server-side values are in `.env.example`:

```env
HOST=127.0.0.1
PORT=3020
DB_HOST=127.0.0.1
DB_NAME=parkitin
DB_USER=parkitin_user
DB_PASS=change-me
DB_CHARSET=utf8mb4
APP_URL=https://example.com/parkitin
DEV_API_KEY=change-me
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=change-me
SMTP_PASSWORD=change-me
SMTP_FROM=no-reply@example.com
```

- Never commit `.env`.
- Never put SMTP, database, API-key, or session secrets in owner/admin settings or the database.
- SMTP credentials belong only in server environment configuration.
- Never log raw magic-link tokens, Bearer tokens, API keys, passwords, or SMTP credentials.

## Current Node Architecture

- `src/server/index.ts`: native Node HTTP server and resource dispatcher.
- `src/server/config.ts`: environment configuration.
- `src/server/db.ts`: MySQL pool and transaction helper.
- `src/server/http.ts`: JSON responses, body parsing, HTTP errors, and request helpers.
- `src/server/auth.ts`: API-key and Bearer-session verification.
- `src/server/account.ts`: magic links, profiles, parking lifecycle, receipts, and payments.
- `src/server/resources.ts`: lots, slots, free-slot queries, and lot administration.
- `src/server/users.ts`: user administration.
- `src/server/camera.ts`: camera parking API.
- `src/server/legacy.ts`: legacy `sessions` and `sessions_end` API.
- `src/server/mail.ts`: SMTP magic-link delivery.
- `src/server/postal.ts`: postal XML lookup.
- `src/server/static.ts`: safe static-file and locale serving.

## Compatibility Rules

- Keep MySQL schema and column names compatible with `sql/schema.sql`.
- Keep `parking_sessions` authoritative.
- Keep `users.parking` and `parking_lots.parking` synchronized with active sessions.
- Preserve one active parking session per user.
- Preserve row locks and transactions for parking allocation, cancellation, stopping, camera operations, and slot changes.
- Preserve started-minute pricing: first 180 minutes use `price_first_3h`; later minutes use `price_per_extra_hour`.
- Preserve bcrypt compatibility with existing PHP password hashes.
- Magic links expire after 15 minutes and are single-use.
- Bearer sessions expire after 60 minutes.
- Preserve role rules: owners manage admins/customers; admins manage customers only; customers cannot access administration.
- Preserve API-key access for camera and legacy device resources.
- Preserve frontend response field names and status codes.

## Validation

Run from the repository root on the LiteSpeed server:

```bash
yarn build
yarn build-server
node --check assets/js/app.js
node --check build/server/index.js
```

Then test:

- Health, static shell, CSS, camera page, and locale endpoint.
- Register, login-link delivery, token verification, `me`, and session expiry.
- Profile update and self-delete scoping.
- Owner/admin/customer authorization boundaries.
- Lot and slot CRUD, reserved-slot protection, and history protection.
- Parking start/cancel/stop/status, receipt, and payment flows.
- Camera start/stop/search and legacy device sessions.
- Transaction rollback and concurrent slot allocation.
- SMTP delivery and Nominatim failure behavior.

## Git and Cutover

- Do not run `git add`, `git commit`, `git push`, reset, rebase, or merge without explicit user permission.
- The user handles commits and pushes.
- Before pulling, check for local changes with `git status --short`.
- Keep a tested rollback path until Node production smoke tests pass.
- Do not delete or restore PHP files. The intended final state is Node.js/TypeScript only.
