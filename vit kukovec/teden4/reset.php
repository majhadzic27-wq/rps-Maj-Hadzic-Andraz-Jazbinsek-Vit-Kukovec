<?php
/**
 * reset.php - ponovno nasemenitev ali popolna izbrisanje podatkov
 * POST ?action=reseed  -> izbriše vse in vstavi testne (seed) podatke
 * POST ?action=wipe    -> izbriše VSE transakcije, proračun in cilj na 0
 * Vse velja samo za trenutno prijavljenega uporabnika.
 */
require __DIR__ . '/config.php';

$userId = require_login();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    send_json(['error' => 'Metoda ni dovoljena.'], 405);
}

$action = $_GET['action'] ?? '';

if (!in_array($action, ['reseed', 'wipe'], true)) {
    send_json(['error' => 'Neznano dejanje. Uporabite ?action=reseed ali ?action=wipe.'], 422);
}

// Testni (seed) podatki - enaki kot v db.sql, a z relativnimi dnevi.
function seed_transactions(): array {
    return [
        ['income',  1200.00, 'placa',         27, 'Plača - november'],
        ['expense',   18.50, 'hrana',         26, 'Sendvič in kava'],
        ['expense',   64.30, 'hrana',         25, 'Tedenska trgovina'],
        ['expense',   35.00, 'prevoz',        24, 'Polnjenje goriva'],
        ['expense',   12.90, 'zabava',        23, 'Kino vstopnica'],
        ['expense',  450.00, 'stanovanje',    22, 'Najemnina'],
        ['expense',   29.99, 'obleka',        21, 'Majica'],
        ['expense',   15.00, 'zdravje',       20, 'Vitamini'],
        ['expense',    8.40, 'hrana',         19, 'Kosilo v mestu'],
        ['expense',   22.00, 'izobrazevanje', 18, 'E-knjiga'],
        ['expense',   40.00, 'prevoz',        17, 'Mesečna vozovnica'],
        ['expense',   65.20, 'hrana',         16, 'Tedenska trgovina'],
        ['expense',   19.90, 'zabava',        15, 'Pretočna naročnina'],
        ['expense',    9.50, 'drugo',         14, 'Darilo prijatelju'],
        ['income',   150.00, 'drugo',         13, 'Prodaja rabljenih oblačil'],
        ['expense',   55.00, 'zdravje',       12, 'Zobozdravnik - doplačilo'],
        ['expense',   13.20, 'hrana',         11, 'Kosilo v mestu'],
        ['expense',   70.00, 'obleka',        10, 'Čevlji'],
        ['expense',   33.40, 'hrana',          9, 'Tedenska trgovina'],
        ['expense',   20.00, 'prevoz',         8, 'Parkirnina'],
        ['expense',   11.00, 'zabava',         7, 'Revija'],
        ['expense',   48.00, 'izobrazevanje',  6, 'Tečaj - obroki'],
        ['expense',   26.70, 'hrana',          5, 'Tedenska trgovina'],
        ['expense',   17.50, 'drugo',          4, 'Pisarniški material'],
        ['expense',    9.90, 'zabava',         3, 'Mobilna igra'],
        ['expense',   60.00, 'zdravje',        2, 'Fizioterapija'],
        ['expense',   21.30, 'hrana',          1, 'Kosilo v mestu'],
        ['income',    80.00, 'drugo',          0, 'Povračilo od sostanovalca'],
        ['expense',   14.60, 'hrana',          0, 'Kava in žemlja'],
    ];
}

try {
    $pdo->beginTransaction();

    // v obeh primerih najprej izbrišemo obstoječe transakcije uporabnika
    $pdo->prepare('DELETE FROM transactions WHERE user_id = :uid')
        ->execute([':uid' => $userId]);

    // v obeh primerih počistimo tudi proračune po kategorijah
    $pdo->prepare('DELETE FROM category_budgets WHERE user_id = :uid')
        ->execute([':uid' => $userId]);

    if ($action === 'wipe') {
        $pdo->prepare('UPDATE budget SET amount = 0, threshold_percent = 80 WHERE user_id = :uid')
            ->execute([':uid' => $userId]);
        $pdo->prepare('UPDATE savings_goal SET name = :n, target = 0, current = 0 WHERE user_id = :uid')
            ->execute([':uid' => $userId, ':n' => 'Varčevalni cilj']);
    } else { // reseed
        $pdo->prepare(
            'INSERT INTO budget (user_id, amount, threshold_percent) VALUES (:uid, 900, 80)
             ON DUPLICATE KEY UPDATE amount = 900, threshold_percent = 80'
        )->execute([':uid' => $userId]);

        $pdo->prepare(
            'INSERT INTO savings_goal (user_id, name, target, current) VALUES (:uid, :n, 1200, 350)
             ON DUPLICATE KEY UPDATE name = :n2, target = 1200, current = 350'
        )->execute([':uid' => $userId, ':n' => 'Nov prenosni računalnik', ':n2' => 'Nov prenosni računalnik']);

        $catBudgetStmt = $pdo->prepare(
            'INSERT INTO category_budgets (user_id, category, amount) VALUES (:uid, :cat, :amt)'
        );
        foreach ([['hrana', 180.00], ['prevoz', 80.00]] as [$cat, $amt]) {
            $catBudgetStmt->execute([':uid' => $userId, ':cat' => $cat, ':amt' => $amt]);
        }

        $stmt = $pdo->prepare(
            'INSERT INTO transactions (user_id, type, amount, category, date, description)
             VALUES (:uid, :type, :amount, :category, DATE_SUB(CURDATE(), INTERVAL :days DAY), :description)'
        );
        foreach (seed_transactions() as [$type, $amount, $category, $days, $description]) {
            $stmt->execute([
                ':uid'         => $userId,
                ':type'        => $type,
                ':amount'      => $amount,
                ':category'    => $category,
                ':days'        => $days,
                ':description' => $description,
            ]);
        }
    }

    $pdo->commit();
    send_json(['ok' => true, 'action' => $action]);
} catch (Exception $e) {
    $pdo->rollBack();
    send_json(['error' => 'Ponastavitev ni uspela: ' . $e->getMessage()], 500);
}
