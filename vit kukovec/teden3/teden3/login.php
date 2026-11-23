<?php
/**
 * login.php - prijava uporabnika
 * POST { username, password }
 * GET  -> vrne podatke o trenutno prijavljenem uporabniku (ali 401)
 *
 * Osnovna zaščita pred napadi z ugibanjem gesla (brute-force):
 * po 5 zaporednih neuspelih poskusih se račun za 1 minuto zaklene.
 */
require __DIR__ . '/config.php';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 1;

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $uid = current_user_id();
    if ($uid === null) {
        send_json(['error' => 'Ni prijavljen uporabnik.'], 401);
    }
    send_json(['id' => $uid, 'username' => $_SESSION['username'] ?? '']);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    send_json(['error' => 'Metoda ni dovoljena.'], 405);
}

$body     = read_json_body();
$username = trim((string)($body['username'] ?? ''));
$password = (string)($body['password'] ?? '');

if ($username === '' || $password === '') {
    send_json(['error' => 'Vnesite uporabniško ime in geslo.'], 422);
}

// Primerjava časa se izvede v celoti v MySQL (TIMESTAMPDIFF), ne v PHP -
// strežnika PHP in MySQL imata lahko različno nastavljen časovni pas, zato
// bi mešanje PHP-jevega "now" z MySQL-jevim NOW() dalo napačen izračun.
$stmt = $pdo->prepare(
    'SELECT id, username, password_hash, failed_attempts, locked_until,
            TIMESTAMPDIFF(SECOND, NOW(), locked_until) AS seconds_until_unlock
     FROM users WHERE username = :u LIMIT 1'
);
$stmt->execute([':u' => $username]);
$user = $stmt->fetch();

// --- Račun je trenutno zaklenjen zaradi prevečkrat napačnega gesla ------
if ($user && $user['locked_until'] !== null && (int)$user['seconds_until_unlock'] > 0) {
    $secondsLeft = (int)$user['seconds_until_unlock'];
    send_json([
        'error' => "Račun je začasno zaklenjen zaradi več neuspelih poskusov prijave. "
                  . "Poskusite znova čez približno {$secondsLeft} s.",
    ], 429);
}

// Namenoma enako sporočilo za "ni uporabnika" in "napačno geslo" -
// tako morebitni napadalec ne more ugotoviti, ali uporabniško ime obstaja.
if (!$user || !password_verify($password, $user['password_hash'])) {
    if ($user) {
        $attempts = (int)$user['failed_attempts'] + 1;
        if ($attempts >= MAX_FAILED_ATTEMPTS) {
            $stmt = $pdo->prepare(
                'UPDATE users SET failed_attempts = :a,
                 locked_until = DATE_ADD(NOW(), INTERVAL :m MINUTE) WHERE id = :id'
            );
            $stmt->execute([':a' => $attempts, ':m' => LOCKOUT_MINUTES, ':id' => $user['id']]);
            send_json([
                'error' => 'Napačno geslo prevečkrat zapored. Račun je zaklenjen za '
                          . LOCKOUT_MINUTES . ' minuto.',
            ], 429);
        }
        $pdo->prepare('UPDATE users SET failed_attempts = :a WHERE id = :id')
            ->execute([':a' => $attempts, ':id' => $user['id']]);
    }
    send_json(['error' => 'Napačno uporabniško ime ali geslo.'], 401);
}

// Uspešna prijava - počistimo števec neuspelih poskusov.
$pdo->prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = :id')
    ->execute([':id' => $user['id']]);

session_regenerate_id(true);
$_SESSION['user_id']  = (int)$user['id'];
$_SESSION['username'] = $user['username'];

send_json(['id' => (int)$user['id'], 'username' => $user['username']]);
