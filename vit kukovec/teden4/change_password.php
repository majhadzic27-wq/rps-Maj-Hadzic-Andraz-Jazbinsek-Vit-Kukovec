<?php
/**
 * change_password.php - sprememba gesla prijavljenega uporabnika
 * POST { currentPassword, newPassword }
 *
 * Zahteva pravilno trenutno geslo, preden dovoli spremembo - tako kot
 * pri registraciji se novo geslo takoj zgosti s password_hash() (bcrypt).
 */
require __DIR__ . '/config.php';

$userId = require_login();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    send_json(['error' => 'Metoda ni dovoljena.'], 405);
}

$body            = read_json_body();
$currentPassword = (string)($body['currentPassword'] ?? '');
$newPassword     = (string)($body['newPassword'] ?? '');

if ($currentPassword === '' || $newPassword === '') {
    send_json(['error' => 'Izpolnite obe polji za geslo.'], 422);
}

if (mb_strlen($newPassword) < 8) {
    send_json(['error' => 'Novo geslo mora imeti vsaj 8 znakov.'], 422);
}
if (!preg_match('/[A-Za-z]/', $newPassword) || !preg_match('/[0-9]/', $newPassword)) {
    send_json(['error' => 'Novo geslo mora vsebovati vsaj eno črko in vsaj eno številko.'], 422);
}

$stmt = $pdo->prepare('SELECT password_hash FROM users WHERE id = :id');
$stmt->execute([':id' => $userId]);
$user = $stmt->fetch();

// Pozor: tu NE uporabimo kode 401 - app.js jo za vse API klice iz prijavljene
// aplikacije jemlje kot "seja je potekla" in uporabnika takoj preusmeri na
// login.html, še preden bi lahko prebral sporočilo o napaki. Napačno trenutno
// geslo prijavljenega uporabnika ni enako "ni prijavljen", zato uporabimo 403.
if (!$user || !password_verify($currentPassword, $user['password_hash'])) {
    send_json(['error' => 'Trenutno geslo ni pravilno.'], 403);
}

if (password_verify($newPassword, $user['password_hash'])) {
    send_json(['error' => 'Novo geslo mora biti drugačno od trenutnega.'], 422);
}

$newHash = password_hash($newPassword, PASSWORD_DEFAULT);
$pdo->prepare('UPDATE users SET password_hash = :h WHERE id = :id')
    ->execute([':h' => $newHash, ':id' => $userId]);

send_json(['ok' => true]);
