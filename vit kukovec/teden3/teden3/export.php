<?php
/**
 * export.php - izvozi vse transakcije prijavljenega uporabnika kot CSV
 * GET api/export.php -> prenos datoteke transakcije.csv
 *
 * Ne uporablja send_json() iz config.php, ker vrača CSV datoteko, ne JSON.
 */
require __DIR__ . '/config.php';

$userId = require_login();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    send_json(['error' => 'Metoda ni dovoljena.'], 405);
}

$stmt = $pdo->prepare(
    'SELECT type, amount, category, date, description
     FROM transactions WHERE user_id = :uid ORDER BY date ASC, id ASC'
);
$stmt->execute([':uid' => $userId]);
$rows = $stmt->fetchAll();

// Prepišemo HTTP glave, ki jih je config.php že nastavil za JSON odgovore.
header_remove('Content-Type');
header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="transakcije.csv"');
header('Cache-Control: no-cache, no-store, must-revalidate');

// BOM na začetku, da Excel pravilno prepozna UTF-8 (šumniki č/š/ž).
echo "\xEF\xBB\xBF";

$out = fopen('php://output', 'w');
fputcsv($out, ['Vrsta', 'Znesek (EUR)', 'Kategorija', 'Datum', 'Opis'], ';');

$typeLabels = ['income' => 'Prihodek', 'expense' => 'Odhodek'];

foreach ($rows as $row) {
    fputcsv($out, [
        $typeLabels[$row['type']] ?? $row['type'],
        number_format((float)$row['amount'], 2, ',', ''),
        $row['category'],
        $row['date'],
        $row['description'],
    ], ';');
}

fclose($out);
exit;
