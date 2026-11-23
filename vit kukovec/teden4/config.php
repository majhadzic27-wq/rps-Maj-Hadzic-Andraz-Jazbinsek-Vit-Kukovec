<?php
/**
 * config.php
 * Skupne nastavitve: povezava na MySQL (PDO), seje (prijava) in
 * pomožne funkcije, ki jih uporabljajo vsi api/*.php končni točki.
 */

// --- Nastavitve povezave z bazo -------------------------------------
// macOS MAMP: vrata so navadno '8889'
// Windows MAMP: vrata so navadno '3306'
$DB_HOST = '127.0.0.1';
$DB_PORT = '8889';
$DB_NAME = 'expense_tracker';
$DB_USER = 'root';
$DB_PASS = 'root';

// --- Seja (prijava uporabnika) --------------------------------------
// session.cookie_* nastavitve morajo biti podane PRED session_start().
if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'samesite' => 'Lax',
    ]);
    session_start();
}

// --- CORS + JSON glava ------------------------------------------------
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// --- Povezava s podatkovno bazo (PDO) ----------------------------------
try {
    $dsn = "mysql:host={$DB_HOST};port={$DB_PORT};dbname={$DB_NAME};charset=utf8mb4";
    $pdo = new PDO($dsn, $DB_USER, $DB_PASS, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Napaka pri povezavi s podatkovno bazo: ' . $e->getMessage()]);
    exit;
}

// --- Pomožne funkcije ---------------------------------------------------

/** Prebere JSON telo zahteve in ga vrne kot asociativno tabelo. */
function read_json_body(): array {
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

/** Poenoteno pošiljanje JSON odgovora. */
function send_json($data, int $status = 200): void {
    http_response_code($status);
    echo json_encode($data);
    exit;
}

/** Vrne ID trenutno prijavljenega uporabnika ali null, če ni prijavljen. */
function current_user_id(): ?int {
    return $_SESSION['user_id'] ?? null;
}

/**
 * Zahteva, da je uporabnik prijavljen. Če ni, konča zahtevo z 401 in
 * JSON napako - klicati na vrhu vsake "zaščitene" api/*.php datoteke.
 */
function require_login(): int {
    $uid = current_user_id();
    if ($uid === null) {
        send_json(['error' => 'Za to dejanje se morate prijaviti.'], 401);
    }
    return $uid;
}
