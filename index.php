<?php
// Browser UI HTML shell and cache-busting asset versioning.
header('Cache-Control: no-cache');
$cssVersion = filemtime(__DIR__ . '/assets/css/style.css');
$jsVersion = filemtime(__DIR__ . '/assets/js/app.js');
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Parkitin</title>
    <link rel="icon" type="image/svg+xml" href="assets/parkitin.svg">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap">
    <link rel="stylesheet" href="assets/css/style.css?v=<?= $cssVersion ?>">
</head>
<body>
    <header id="user-nav" class="user-nav">
        <div id="nav-actions" class="nav-actions"></div>
        <div id="lang-switcher" class="lang-switcher"></div>
    </header>
    <div id="app" class="app"></div>
    <img id="footer-logo" class="footer-logo" src="assets/parkitin.svg" alt="Parkitin">
    <script src="assets/js/app.js?v=<?= $jsVersion ?>"></script>
</body>
</html>

