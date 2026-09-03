# Parkitin Development Instructions

## Project Purpose

Parkitin is a PHP/MySQL parking application with a browser UI written in vanilla TypeScript and CSS. Keep the implementation simple: do not add frontend frameworks, map libraries, ORMs, or unnecessary dependencies.

## Project Structure

- `index.php` is the browser HTML shell. It serves the shared header, loads Google Ubuntu, and cache-busts CSS/JS using file modification times.
- `src/app.ts` is the only TypeScript source for the browser UI.
- `assets/js/app.js` is generated and obfuscated output. Never edit it manually.
- `assets/css/style.css` is the single vanilla stylesheet.
- `api/index.php` routes REST API resources.
- `handlers/` contains PHP resource handlers. Keep each handler focused on its resource.
- `camera/index.php` is the server-rendered camera/plate-reader simulator.
- `sql/schema.sql` describes the complete database schema for new installations.
- `i18n/<locale>.json` holds frontend translations; `i18n/index.php` lists available locales.
- `scripts/` contains mock-data generation and import scripts.

## Build Rules

- Edit `src/app.ts`, not `assets/js/app.js`.
- Run `yarn build` after every TypeScript change. It compiles to `build/js/app.js` and obfuscates the served `assets/js/app.js`.
- Keep TypeScript strict and compatible with the configured ES2019 target.
- Validate frontend changes with `yarn build` and `node --check assets/js/app.js`.
- Validate PHP changes with `php -l` on every touched PHP file.
- Validate changed locale files with `python3 -m json.tool i18n/<locale>.json`.

## PHP and Database Conventions

- Use PDO and prepared statements for every SQL query with external values.
- Return API responses through `send_json()` with appropriate HTTP status codes.
- Validate all input server-side, even if the UI already validates it.
- Keep business rules authoritative on the server. UI visibility is not authorization.
- Schema changes require two actions: update `sql/schema.sql` and apply a safe migration to the existing live database. `CREATE TABLE IF NOT EXISTS` does not modify existing tables.
- Use `utf8mb4`/UTF-8 for database and email data.
- Do not expose database passwords, API keys, session tokens, or SMTP credentials. `config.php` is ignored; use `config.example.php` for safe examples.

## Authentication and Authorization

- Browser sessions use `Authorization: Bearer <session token>` and are stored in `localStorage` for one hour.
- Login links are one-time, hashed tokens with a 15-minute expiry.
- Device/integration API calls use `X-Api-Key`; the temporary `DEV_API_KEY` is development-only.
- Roles are `owner`, `admin`, and `customer`.
- Owners manage admins and customers. Admins manage only customers. Neither role may edit or delete owners.
- Owners and admins manage parking lots and slots. Customers manage only their own profile and payments.
- Customer self-delete must be scoped to the authenticated session, never a caller-supplied user ID.

## Parking Rules

- `parking_sessions` is the durable parking and invoice history.
- An active parking has `end_time IS NULL`; finished parking invoices use status `open` or `paid`.
- A user may have only one active parking at a time.
- Use database transactions and row locks when allocating, stopping, or cancelling parking.
- Keep `users.parking` and `parking_lots.parking` synchronized with active sessions; these are active-state summaries, not replacements for `parking_sessions` history.
- Parking pricing is per started minute: `price_first_3h` for the first 180 minutes and `price_per_extra_hour` after that. Preserve the column names for compatibility even though both values are minute rates.
- Never edit, delete, deactivate, or renumber a currently reserved slot.
- Slot names are optional; slot numbers are recalculated sequentially after deletion.

## UI and CSS Conventions

- Use vanilla DOM APIs. Do not add React, Vue, Leaflet, or other UI/map libraries.
- Use semantic, lowercase hyphenated class names: `.map-center-button`, `.payment-success-toast`.
- Use a base component class plus a state modifier: `.map-pin.full`, `.admin-tab.active`.
- Reserve IDs for unique elements TypeScript must find or control. Do not use IDs as reusable styling hooks.
- Header navigation remains a sticky, full-width, single-row bar. Keep controls compact and usable at narrow widths.
- Map view fills the viewport below the header, with no inherited page-card padding or margin.
- Maintain mobile accessibility: readable font sizes, minimum 44px touch targets where practical, and responsive slot grids.
- Buttons that contain familiar actions may use supplied icon assets. Keep `title` and `aria-label` on icon-only controls.

## Map and Geocoding

- Render maps with OpenStreetMap public tiles and the existing custom pointer/tile logic in `src/app.ts`.
- Use `assets/pin.svg` for lot pins and `assets/me.svg` for the center-location control.
- Do not browser-geocode addresses. Nominatim does not allow this app's cross-origin client requests.
- Geocode lots server-side using `geocode_address()` when manually creating or editing a lot; persist `latitude` and `longitude`.
- The map API should return stored coordinates. Mock imports use their GeoJSON coordinates directly.

## Localization

- All visible UI strings belong in `i18n/<locale>.json`; do not hardcode user-facing text in TypeScript.
- Locale JSON structure is `locale`, `name`, `default`, and grouped `translations` contexts.
- Use `trans('context.key', params?)` for user-facing text.
- Add a matching key to every supported locale when adding UI text.
- Language selection is held in `sessionStorage`. Switching language must update text in place and preserve visible forms and input values.
- JSON does not support comments; do not add comments to locale files.

## Comments and Documentation

- Code comments must be English. README content is Finnish.
- Add comments only where the code cannot make the reason clear. Keep them short and specific.
- Do not add comments to JSON files.
- Keep `README.md` explanatory only: architecture, data model, API behavior, roles, parking flow, map behavior, and localization. Do not add installation or deployment instructions unless explicitly requested.

## Mock Data

- `scripts/digitraffic-mock.json` is mock data shaped like Digitraffic GeoJSON, not a verified live feed.
- Keep mock facility names playful and coordinates inside the named Finnish city.
- `expand_digitraffic_mock.php` must remain idempotent.
- `import_digitraffic.php` must skip previously imported facilities safely and preserve stored mock coordinates.