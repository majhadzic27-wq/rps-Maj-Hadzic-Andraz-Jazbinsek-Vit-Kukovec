-- ============================================================
--  Moji stroški - baza podatkov (MySQL / MariaDB, MAMP)
--  Posodobljeno: dodana tabela "users" + prijava/registracija
--  Posodobljeno (sprint 3): zaklepanje računa po neuspelih prijavah
-- ============================================================

SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS expense_tracker
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE expense_tracker;

-- ------------------------------------------------------------
-- 1) UPORABNIKI (users)
--    Gesla se NIKOLI ne shranjujejo v čisti besedilni obliki -
--    stolpec password_hash hrani samo bcrypt zgoščeno vrednost,
--    ki jo ustvari PHP-jeva funkcija password_hash().
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  username             VARCHAR(50)  NOT NULL UNIQUE,
  email                VARCHAR(150) NOT NULL UNIQUE,
  password_hash        VARCHAR(255) NOT NULL,
  failed_attempts       INT NOT NULL DEFAULT 0,
  locked_until          DATETIME NULL DEFAULT NULL,
  created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Za podatkovne baze, uvožene PRED to posodobitvijo (sprint 3):
-- MariaDB podpira "ADD COLUMN IF NOT EXISTS", zato je ponovni uvoz varen.
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_attempts INT NOT NULL DEFAULT 0 AFTER password_hash;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until DATETIME NULL DEFAULT NULL AFTER failed_attempts;

-- ------------------------------------------------------------
-- 2) TRANSAKCIJE (transactions) - povezane z uporabnikom (FK)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  type        ENUM('income','expense') NOT NULL,
  amount      DECIMAL(10,2) NOT NULL,
  category    VARCHAR(50) NOT NULL,
  date        DATE NOT NULL,
  description VARCHAR(255) NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_transactions_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  INDEX idx_transactions_user (user_id),
  INDEX idx_transactions_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 3) PRORAČUN (budget) - 1 vrstica na uporabnika (1:1)
--    user_id je hkrati primarni IN tuji ključ.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS budget (
  user_id          INT NOT NULL PRIMARY KEY,
  amount           DECIMAL(10,2) NOT NULL DEFAULT 0,
  threshold_percent INT NOT NULL DEFAULT 80,
  CONSTRAINT fk_budget_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 4) CILJ VARČEVANJA (savings_goal) - 1 vrstica na uporabnika (1:1)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS savings_goal (
  user_id INT NOT NULL PRIMARY KEY,
  name    VARCHAR(100) NOT NULL DEFAULT 'Varčevalni cilj',
  target  DECIMAL(10,2) NOT NULL DEFAULT 0,
  current DECIMAL(10,2) NOT NULL DEFAULT 0,
  CONSTRAINT fk_savings_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- DEMO UPORABNIK
--  username: demo   geslo: demo1234
--  (geslo spodaj je že bcrypt zgoščena vrednost - password_hash('demo1234'))
-- ------------------------------------------------------------
INSERT INTO users (id, username, email, password_hash) VALUES
  (1, 'demo', 'demo@example.com', '$2y$10$Qou70k/Hmnt9ywBRqZiKH.b5dgZTt04qmjNibSgGoV2isrXCi8foq')
ON DUPLICATE KEY UPDATE username = username;

-- ------------------------------------------------------------
-- PRORAČUN IN CILJ VARČEVANJA ZA DEMO UPORABNIKA
-- ------------------------------------------------------------
INSERT INTO budget (user_id, amount, threshold_percent) VALUES (1, 900.00, 80)
ON DUPLICATE KEY UPDATE amount = amount;

INSERT INTO savings_goal (user_id, name, target, current) VALUES
  (1, 'Nov prenosni računalnik', 1200.00, 350.00)
ON DUPLICATE KEY UPDATE name = name;

-- ------------------------------------------------------------
-- TESTNI (SEED) PODATKI ZA DEMO UPORABNIKA
--  Datumi so relativni na "danes", da so vedno aktualni.
-- ------------------------------------------------------------
INSERT INTO transactions (user_id, type, amount, category, date, description) VALUES
(1,'income', 1200.00, 'placa',       DATE_SUB(CURDATE(), INTERVAL 27 DAY), 'Plača - november'),
(1,'expense',  18.50,  'hrana',       DATE_SUB(CURDATE(), INTERVAL 26 DAY), 'Sendvič in kava'),
(1,'expense',  64.30,  'hrana',       DATE_SUB(CURDATE(), INTERVAL 25 DAY), 'Tedenska trgovina'),
(1,'expense',  35.00,  'prevoz',      DATE_SUB(CURDATE(), INTERVAL 24 DAY), 'Polnjenje goriva'),
(1,'expense',  12.90,  'zabava',      DATE_SUB(CURDATE(), INTERVAL 23 DAY), 'Kino vstopnica'),
(1,'expense', 450.00,  'stanovanje',  DATE_SUB(CURDATE(), INTERVAL 22 DAY), 'Najemnina'),
(1,'expense',  29.99,  'obleka',      DATE_SUB(CURDATE(), INTERVAL 21 DAY), 'Majica'),
(1,'expense',  15.00,  'zdravje',     DATE_SUB(CURDATE(), INTERVAL 20 DAY), 'Vitamini'),
(1,'expense',   8.40,  'hrana',       DATE_SUB(CURDATE(), INTERVAL 19 DAY), 'Kosilo v mestu'),
(1,'expense',  22.00,  'izobrazevanje', DATE_SUB(CURDATE(), INTERVAL 18 DAY), 'E-knjiga'),
(1,'expense',  40.00,  'prevoz',      DATE_SUB(CURDATE(), INTERVAL 17 DAY), 'Mesečna vozovnica'),
(1,'expense',  65.20,  'hrana',       DATE_SUB(CURDATE(), INTERVAL 16 DAY), 'Tedenska trgovina'),
(1,'expense',  19.90,  'zabava',      DATE_SUB(CURDATE(), INTERVAL 15 DAY), 'Pretočna naročnina'),
(1,'expense',   9.50,  'drugo',       DATE_SUB(CURDATE(), INTERVAL 14 DAY), 'Darilo prijatelju'),
(1,'income',   150.00, 'drugo',       DATE_SUB(CURDATE(), INTERVAL 13 DAY), 'Prodaja rabljenih oblačil'),
(1,'expense',  55.00,  'zdravje',     DATE_SUB(CURDATE(), INTERVAL 12 DAY), 'Zobozdravnik - doplačilo'),
(1,'expense',  13.20,  'hrana',       DATE_SUB(CURDATE(), INTERVAL 11 DAY), 'Kosilo v mestu'),
(1,'expense',  70.00,  'obleka',      DATE_SUB(CURDATE(), INTERVAL 10 DAY), 'Čevlji'),
(1,'expense',  33.40,  'hrana',       DATE_SUB(CURDATE(), INTERVAL  9 DAY), 'Tedenska trgovina'),
(1,'expense',  20.00,  'prevoz',      DATE_SUB(CURDATE(), INTERVAL  8 DAY), 'Parkirnina'),
(1,'expense',  11.00,  'zabava',      DATE_SUB(CURDATE(), INTERVAL  7 DAY), 'Revija'),
(1,'expense',  48.00,  'izobrazevanje', DATE_SUB(CURDATE(), INTERVAL  6 DAY), 'Tečaj - obroki'),
(1,'expense',  26.70,  'hrana',       DATE_SUB(CURDATE(), INTERVAL  5 DAY), 'Tedenska trgovina'),
(1,'expense',  17.50,  'drugo',       DATE_SUB(CURDATE(), INTERVAL  4 DAY), 'Pisarniški material'),
(1,'expense',   9.90,  'zabava',      DATE_SUB(CURDATE(), INTERVAL  3 DAY), 'Mobilna igra'),
(1,'expense',  60.00,  'zdravje',     DATE_SUB(CURDATE(), INTERVAL  2 DAY), 'Fizioterapija'),
(1,'expense',  21.30,  'hrana',       DATE_SUB(CURDATE(), INTERVAL  1 DAY), 'Kosilo v mestu'),
(1,'income',    80.00, 'drugo',       DATE_SUB(CURDATE(), INTERVAL  0 DAY), 'Povračilo od sostanovalca'),
(1,'expense',  14.60,  'hrana',       DATE_SUB(CURDATE(), INTERVAL  0 DAY), 'Kava in žemlja');
