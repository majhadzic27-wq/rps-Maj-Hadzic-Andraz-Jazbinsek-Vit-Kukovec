<?php
/**
 * category_budgets.php - proračun po posameznih kategorijah
 * (dopolnilo k skupnemu mesečnemu proračunu v budget.php)
 *
 * GET    api/category_budgets.php             -> seznam {category, amount}
 * POST   api/category_budgets.php             -> nastavi/posodobi limit {category, amount}
 * DELETE api/category_budgets.php?category=X  -> odstrani limit za kategorijo
 */
require __DIR__ . '/config.php';

const EXPENSE_CATEGORIES = ['hrana', 'prevoz', 'stanovanje', 'zabava', 'zdravje', 'obleka', 'izobrazevanje', 'drugo'];

$userId = require_login();
$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {

    case 'GET':
        $stmt = $pdo->prepare('SELECT category, amount FROM category_budgets WHERE user_id = :uid ORDER BY category');
        $stmt->execute([':uid' => $userId]);
        send_json($stmt->fetchAll());
        break;

    case 'POST':
        $body     = read_json_body();
        $category = trim((string)($body['category'] ?? ''));
        $amount   = $body['amount'] ?? null;

        if (!in_array($category, EXPENSE_CATEGORIES, true)) {
            send_json(['error' => 'Neveljavna kategorija.'], 422);
        }
        if (!is_numeric($amount) || (float)$amount <= 0) {
            send_json(['error' => 'Znesek mora biti število, večje od 0.'], 422);
        }
        if ((float)$amount > 1000000) {
            send_json(['error' => 'Znesek je nerealno visok.'], 422);
        }

        $stmt = $pdo->prepare(
            'INSERT INTO category_budgets (user_id, category, amount) VALUES (:uid, :cat, :amt)
             ON DUPLICATE KEY UPDATE amount = :amt2'
        );
        $stmt->execute([':uid' => $userId, ':cat' => $category, ':amt' => $amount, ':amt2' => $amount]);

        send_json(['ok' => true]);
        break;

    case 'DELETE':
        $category = trim((string)($_GET['category'] ?? ''));
        if ($category === '') {
            send_json(['error' => 'Manjka kategorija.'], 422);
        }

        $stmt = $pdo->prepare('DELETE FROM category_budgets WHERE user_id = :uid AND category = :cat');
        $stmt->execute([':uid' => $userId, ':cat' => $category]);

        if ($stmt->rowCount() === 0) {
            send_json(['error' => 'Limit za to kategorijo ne obstaja.'], 404);
        }
        send_json(['ok' => true]);
        break;

    default:
        send_json(['error' => 'Metoda ni dovoljena.'], 405);
}
