<?php
/**
 * register.php - registracija novega uporabnika
 * POST { username, email, password }
 *
 * Geslo se NIKOLI ne shrani v čisti besedilni obliki - takoj se
 * zgosti s password_hash() (bcrypt), v bazo gre samo zgoščena vrednost.
 */
require __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    send_json(['error' => 'Metoda ni dovoljena.'], 405);
}

$body     = read_json_body();
$username = trim((string)($body['username'] ?? ''));
$email    = mb_strtolower(trim((string)($body['email'] ?? '')));
$password = (string)($body['password'] ?? '');

// --- Validacija vnosa -------------------------------------------------
$errors = [];

if ($username === '' || mb_strlen($username) < 3 || mb_strlen($username) > 50) {
    $errors[] = 'Uporabniško ime mora imeti med 3 in 50 znakov.';
} elseif (!preg_match('/^[a-zA-Z0-9_.-]+$/', $username)) {
    $errors[] = 'Uporabniško ime lahko vsebuje le črke, številke, "_", "." in "-".';
}

if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $errors[] = 'Vnesite veljaven e-poštni naslov.';
}

if (mb_strlen($password) < 8) {
    $errors[] = 'Geslo mora imeti vsaj 8 znakov.';
} elseif (!preg_match('/[A-Za-z]/', $password) || !preg_match('/[0-9]/', $password)) {
    $errors[] = 'Geslo mora vsebovati vsaj eno črko in vsaj eno številko.';
}

if ($errors) {
    send_json(['error' => implode(' ', $errors)], 422);
}

// --- Preveri, da uporabniško ime / e-poštni naslov še ni zaseden --------
$stmt = $pdo->prepare('SELECT id FROM users WHERE username = :u OR email = :e LIMIT 1');
$stmt->execute([':u' => $username, ':e' => $email]);
if ($stmt->fetch()) {
    send_json(['error' => 'Uporabniško ime ali e-poštni naslov je že v uporabi.'], 409);
}

// --- Zgoščevanje gesla (bcrypt prek password_hash) ------------------
$passwordHash = password_hash($password, PASSWORD_DEFAULT);

try {
    $pdo->beginTransaction();

    $stmt = $pdo->prepare(
        'INSERT INTO users (username, email, password_hash) VALUES (:u, :e, :p)'
    );
    $stmt->execute([':u' => $username, ':e' => $email, ':p' => $passwordHash]);
    $userId = (int)$pdo->lastInsertId();

    // vsak nov uporabnik dobi privzet proračun in cilj varčevanja
    $pdo->prepare(
        'INSERT INTO budget (user_id, amount, threshold_percent) VALUES (:uid, 0, 80)'
    )->execute([':uid' => $userId]);

    $pdo->prepare(
        'INSERT INTO savings_goal (user_id, name, target, current) VALUES (:uid, :n, 0, 0)'
    )->execute([':uid' => $userId, ':n' => 'Varčevalni cilj']);

    $pdo->commit();
} catch (Exception $e) {
    $pdo->rollBack();
    send_json(['error' => 'Registracija ni uspela: ' . $e->getMessage()], 500);
}

// Po uspešni registraciji uporabnika takoj prijavimo (nova seja).
session_regenerate_id(true);
$_SESSION['user_id']  = $userId;
$_SESSION['username'] = $username;

send_json([
    'id'       => $userId,
    'username' => $username,
    'email'    => $email,
], 201);
