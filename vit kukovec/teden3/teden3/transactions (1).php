<?php
/**
 * transactions.php - CRUD za transakcije (prihodki/odhodki)
 * Vse poizvedbe so omejene na trenutno prijavljenega uporabnika (user_id).
 *
 * GET    api/transactions.php           -> seznam transakcij
 * POST   api/transactions.php           -> nova transakcija
 * PUT    api/transactions.php?id=X      -> popravek transakcije
 * DELETE api/transactions.php?id=X      -> brisanje transakcije
 */
require __DIR__ . '/config.php';

$userId = require_login();
$method = $_SERVER['REQUEST_METHOD'];

// Dovoljene kategorije (morajo ustrezati seznamu v js/app.js) - strežnik
// nikoli ne zaupa vrednosti, ki jih odjemalec pošlje brez preverjanja.
const EXPENSE_CATEGORIES = ['hrana', 'prevoz', 'stanovanje', 'zabava', 'zdravje', 'obleka', 'izobrazevanje', 'drugo'];
const INCOME_CATEGORIES  = ['placa', 'drugo'];
const MAX_AMOUNT = 1000000; // razumna zgornja meja, da prepreči očitno napačen/zlonameren vnos

function validate_transaction(array $data): array {
    $errors = [];

    $type = $data['type'] ?? '';
    if (!in_array($type, ['income', 'expense'], true)) {
        $errors[] = 'Vrsta mora biti "income" ali "expense".';
    }

    $amount = $data['amount'] ?? null;
    if (!is_numeric($amount) || (float)$amount <= 0) {
        $errors[] = 'Znesek mora biti število, večje od 0.';
    } elseif ((float)$amount > MAX_AMOUNT) {
        $errors[] = 'Znesek je nerealno visok (največ ' . number_format(MAX_AMOUNT, 0, ',', '.') . ' €).';
    }

    $category = trim((string)($data['category'] ?? ''));
    $allowedCategories = $type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    if ($category === '') {
        $errors[] = 'Kategorija je obvezna.';
    } elseif (in_array($type, ['income', 'expense'], true) && !in_array($category, $allowedCategories, true)) {
        $errors[] = 'Neveljavna kategorija za izbrano vrsto transakcije.';
    }

    $date = (string)($data['date'] ?? '');
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $date, $m)) {
        $errors[] = 'Datum mora biti v obliki LLLL-MM-DD.';
    } elseif (!checkdate((int)$m[2], (int)$m[3], (int)$m[1])) {
        $errors[] = 'Vnesen datum ne obstaja (preveri dan/mesec).';
    } elseif ((int)$m[1] < 2000) {
        $errors[] = 'Datum je nerealno star (pred letom 2000).';
    } elseif (strtotime($date) > strtotime('+1 day')) {
        $errors[] = 'Datum ne more biti v prihodnosti.';
    }

    $description = trim((string)($data['description'] ?? ''));
    if ($description === '') {
        $errors[] = 'Opis je obvezen.';
    } elseif (mb_strlen($description) > 255) {
        $errors[] = 'Opis je predolg (največ 255 znakov).';
    }

    return $errors;
}

switch ($method) {

    case 'GET':
        $stmt = $pdo->prepare(
            'SELECT id, type, amount, category, date, description, created_at
             FROM transactions WHERE user_id = :uid ORDER BY date DESC, id DESC'
        );
        $stmt->execute([':uid' => $userId]);
        send_json($stmt->fetchAll());
        break;

    case 'POST':
        $body   = read_json_body();
        $errors = validate_transaction($body);
        if ($errors) {
            send_json(['error' => implode(' ', $errors)], 422);
        }

        $stmt = $pdo->prepare(
            'INSERT INTO transactions (user_id, type, amount, category, date, description)
             VALUES (:uid, :type, :amount, :category, :date, :description)'
        );
        $stmt->execute([
            ':uid'         => $userId,
            ':type'        => $body['type'],
            ':amount'      => $body['amount'],
            ':category'    => trim($body['category']),
            ':date'        => $body['date'],
            ':description' => trim($body['description']),
        ]);

        send_json(['id' => (int)$pdo->lastInsertId()], 201);
        break;

    case 'PUT':
        $id = (int)($_GET['id'] ?? 0);
        if ($id <= 0) {
            send_json(['error' => 'Manjka ID transakcije.'], 422);
        }

        $body   = read_json_body();
        $errors = validate_transaction($body);
        if ($errors) {
            send_json(['error' => implode(' ', $errors)], 422);
        }

        $stmt = $pdo->prepare(
            'UPDATE transactions
             SET type = :type, amount = :amount, category = :category,
                 date = :date, description = :description
             WHERE id = :id AND user_id = :uid'
        );
        $stmt->execute([
            ':type'        => $body['type'],
            ':amount'      => $body['amount'],
            ':category'    => trim($body['category']),
            ':date'        => $body['date'],
            ':description' => trim($body['description']),
            ':id'          => $id,
            ':uid'         => $userId,
        ]);

        if ($stmt->rowCount() === 0) {
            send_json(['error' => 'Transakcija ne obstaja.'], 404);
        }
        send_json(['ok' => true]);
        break;

    case 'DELETE':
        $id = (int)($_GET['id'] ?? 0);
        if ($id <= 0) {
            send_json(['error' => 'Manjka ID transakcije.'], 422);
        }

        $stmt = $pdo->prepare('DELETE FROM transactions WHERE id = :id AND user_id = :uid');
        $stmt->execute([':id' => $id, ':uid' => $userId]);

        if ($stmt->rowCount() === 0) {
            send_json(['error' => 'Transakcija ne obstaja.'], 404);
        }
        send_json(['ok' => true]);
        break;

    default:
        send_json(['error' => 'Metoda ni dovoljena.'], 405);
}
