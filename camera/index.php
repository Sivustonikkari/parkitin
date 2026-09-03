<?php
// Camera simulation UI for starting and stopping parking by registration plate.

header('Cache-Control: no-cache');

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../handlers/camera.php';

$cssVersion = filemtime(__DIR__ . '/../assets/css/style.css');

$action = $_POST['action'] ?? '';
$letters = trim((string)($_POST['letters'] ?? ''));
$numbers = trim((string)($_POST['numbers'] ?? ''));
$lotQuery = trim((string)($_POST['lot'] ?? ''));

$result = null;
$resultType = null;
$candidates = [];

$errorMessages = [
    'invalid_plate' => 'Rekisterinumero on virheellinen. Käytä muotoa 1–3 kirjainta ja 1–3 numeroa.',
    'plate_not_found' => 'Rekisterinumeroa ei löydy järjestelmästä.',
    'already_parking' => 'Tällä rekisterinumerolla on jo käynnissä oleva pysäköinti.',
    'lot_not_found' => 'Pysäköintialuetta ei löytynyt.',
    'lot_ambiguous' => 'Hakuehto vastaa useaa aluetta. Tarkenna hakua tai valitse alue listasta.',
    'lot_full' => 'Pysäköintialue on täynnä.',
    'no_active_parking' => 'Tällä rekisterinumerolla ei ole käynnissä olevaa pysäköintiä.',
];

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($action === 'start' || $action === 'stop')) {
    $plate = camera_normalize_plate($letters . '-' . $numbers);

    if ($action === 'start') {
        $lot = camera_resolve_lot($lotQuery);
        if (!$lot['ok']) {
            $resultType = 'error';
            $result = $errorMessages[$lot['error']] ?? 'Tuntematon virhe.';
            $candidates = $lot['matches'] ?? [];
        } else {
            $response = camera_start_parking($plate, (int)$lot['lot']['id']);
            $resultType = $response['ok'] ? 'start' : 'error';
            $result = $response['ok'] ? $response['data'] : ($errorMessages[$response['error']] ?? 'Tuntematon virhe.');
        }
    } else {
        $response = camera_stop_parking($plate);
        $resultType = $response['ok'] ? 'stop' : 'error';
        $result = $response['ok'] ? $response['data'] : ($errorMessages[$response['error']] ?? 'Tuntematon virhe.');
    }
}

$lots = get_db()->query('SELECT id, name, address, postal_code, city FROM parking_lots ORDER BY name')->fetchAll();
?>
<!DOCTYPE html>
<html lang="fi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Parkitin – kameravalvonta</title>
    <link rel="icon" type="image/svg+xml" href="../assets/parkitin.svg">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap">
    <link rel="stylesheet" href="../assets/css/style.css?v=<?= $cssVersion ?>">
</head>
<body>
    <header class="user-nav">
        <span class="camera-title">Kameravalvonnan simulaatio</span>
    </header>

    <div class="app camera-view">
        <?php if ($resultType === 'error'): ?>
            <p class="camera-result camera-result-error"><?= htmlspecialchars($result, ENT_QUOTES, 'UTF-8') ?></p>
            <?php if ($candidates): ?>
                <ul class="camera-candidates">
                    <?php foreach ($candidates as $candidate): ?>
                        <li><?= htmlspecialchars(
                            $candidate['id'] . ' — ' . $candidate['name'] . ', ' . $candidate['address'] . ', ' . $candidate['city'],
                            ENT_QUOTES,
                            'UTF-8'
                        ) ?></li>
                    <?php endforeach; ?>
                </ul>
            <?php endif; ?>
        <?php elseif ($resultType === 'start'): ?>
            <div class="camera-result camera-result-success">
                <h2>Pysäköinti aloitettu</h2>
                <p><strong>Rekisterinumero:</strong> <?= htmlspecialchars($result['plate'], ENT_QUOTES, 'UTF-8') ?></p>
                <p><strong>Kuljettaja:</strong> <?= htmlspecialchars(trim($result['user']['first_name'] . ' ' . $result['user']['last_name']), ENT_QUOTES, 'UTF-8') ?></p>
                <p><strong>Sähköposti:</strong> <?= htmlspecialchars((string)$result['user']['email'], ENT_QUOTES, 'UTF-8') ?></p>
                <p><strong>Alue:</strong> <?= htmlspecialchars($result['lot_name'] . ', ' . $result['lot_address'] . ', ' . $result['lot_city'], ENT_QUOTES, 'UTF-8') ?></p>
                <p><strong>Paikka:</strong> <?= htmlspecialchars($result['slot'], ENT_QUOTES, 'UTF-8') ?></p>
                <p><strong>Alkoi:</strong> <?= htmlspecialchars($result['start_time'], ENT_QUOTES, 'UTF-8') ?></p>
            </div>
        <?php elseif ($resultType === 'stop'): ?>
            <div class="camera-result camera-result-success">
                <h2>Pysäköinti päättyi</h2>
                <p><strong>Rekisterinumero:</strong> <?= htmlspecialchars($result['plate'], ENT_QUOTES, 'UTF-8') ?></p>
                <p><strong>Kuljettaja:</strong> <?= htmlspecialchars(trim($result['user']['first_name'] . ' ' . $result['user']['last_name']), ENT_QUOTES, 'UTF-8') ?></p>
                <p><strong>Sähköposti:</strong> <?= htmlspecialchars((string)$result['user']['email'], ENT_QUOTES, 'UTF-8') ?></p>
                <p><strong>Alue:</strong> <?= htmlspecialchars($result['lot_name'], ENT_QUOTES, 'UTF-8') ?></p>
                <p><strong>Paikka:</strong> <?= htmlspecialchars($result['slot'], ENT_QUOTES, 'UTF-8') ?></p>
                <p><strong>Kesto:</strong> <?= (int)floor($result['duration_minutes'] / 60) ?> h <?= str_pad((string)($result['duration_minutes'] % 60), 2, '0', STR_PAD_LEFT) ?> min</p>
                <p><strong>Hinta:</strong> <?= number_format((float)$result['price_charged'], 2, ',', ' ') ?> EUR</p>
            </div>
        <?php endif; ?>

        <form class="auth-form camera-form" method="post">
            <h2>Aloita pysäköinti</h2>
            <input type="hidden" name="action" value="start">

            <label class="lot-field">
                <span>Rekisterinumero</span>
                <span class="camera-plate">
                    <input class="text-input camera-plate-letters" type="text" name="letters"
                           maxlength="3" pattern="[A-Za-zÅÄÖåäö]{1,3}" required
                           value="<?= $action === 'start' ? htmlspecialchars($letters, ENT_QUOTES, 'UTF-8') : '' ?>">
                    <span class="camera-plate-separator">–</span>
                    <input class="text-input camera-plate-numbers" type="text" name="numbers"
                           maxlength="3" inputmode="numeric" pattern="[0-9]{1,3}" required
                           value="<?= $action === 'start' ? htmlspecialchars($numbers, ENT_QUOTES, 'UTF-8') : '' ?>">
                </span>
            </label>

            <label class="lot-field">
                <span>Pysäköintialue (nimi, osoite, kaupunki tai tunniste)</span>
                <input class="text-input" type="text" name="lot" list="camera-lots" required
                       value="<?= $action === 'start' ? htmlspecialchars($lotQuery, ENT_QUOTES, 'UTF-8') : '' ?>">
            </label>

            <button class="submit-button" type="submit">Aloita pysäköinti</button>
        </form>

        <form class="auth-form camera-form" method="post">
            <h2>Lopeta pysäköinti</h2>
            <input type="hidden" name="action" value="stop">

            <label class="lot-field">
                <span>Rekisterinumero</span>
                <span class="camera-plate">
                    <input class="text-input camera-plate-letters" type="text" name="letters"
                           maxlength="3" pattern="[A-Za-zÅÄÖåäö]{1,3}" required
                           value="<?= $action === 'stop' ? htmlspecialchars($letters, ENT_QUOTES, 'UTF-8') : '' ?>">
                    <span class="camera-plate-separator">–</span>
                    <input class="text-input camera-plate-numbers" type="text" name="numbers"
                           maxlength="3" inputmode="numeric" pattern="[0-9]{1,3}" required
                           value="<?= $action === 'stop' ? htmlspecialchars($numbers, ENT_QUOTES, 'UTF-8') : '' ?>">
                </span>
            </label>

            <button class="submit-button" type="submit">Lopeta pysäköinti</button>
        </form>

        <datalist id="camera-lots">
            <?php foreach ($lots as $lot): ?>
                <option value="<?= htmlspecialchars(
                    $lot['id'] . ' — ' . $lot['name'] . ', ' . $lot['address'] . ', ' . $lot['postal_code'] . ' ' . $lot['city'],
                    ENT_QUOTES,
                    'UTF-8'
                ) ?>"></option>
            <?php endforeach; ?>
        </datalist>
    </div>
</body>
</html>
