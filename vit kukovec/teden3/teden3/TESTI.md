# Seznam izvedenih testov

Testi so bili izvedeni avtomatizirano (Playwright, brskalnik Chromium)
proti pravemu PHP strežniku in pravi MySQL bazi (ne proti simulaciji),
ter ročno prek `curl` neposredno na API.

## Sprint 3: zaklepanje računa, izvoz CSV, okrepljena validacija - 11/11 uspešnih

1. Prijava z obstoječim (demo) računom uspe in prikaže nadzorno ploščo.
2. Registracija s šibkim geslom (brez številke) je zavrnjena na strani odjemalca, s pravilnim sporočilom.
3. Registracija z veljavnim geslom (črke + številke, ujemanje obeh polj) uspe.
4. Po 5 zaporednih napačnih geslih se račun zaklene za 1 minuto, s sporočilom o preostalem času.
5. Med zaklepom je zavrnjen tudi POSKUS S PRAVILNIM geslom (ne le napačnim).
6. Gumb "Izvozi CSV" sproži prenos datoteke `transakcije.csv`.
7. Izvožena CSV datoteka ima pravilno glavo stolpcev (Vrsta;Znesek;Kategorija;Datum;Opis).
8. Izvožena CSV datoteka vsebuje prave podatke uporabnika (npr. "Plača").
9. Strežnik (API) zavrne transakcijo z neveljavno kategorijo za izbrano vrsto (npr. "placa" pri odhodku) s kodo 422.
10. Dodajanje nove transakcije še vedno deluje brez regresij po vseh spremembah.
11. Med celotnim potekom ni nepričakovanih napak v konzoli brskalnika.

**Opomba o odkriti in popravljeni napaki:** med razvojem zaklepanja računa
je prvotna različica (ki je čas računala v PHP-ju s `new DateTime()`)
zaradi razlike med časovnim pasom PHP strežnika (UTC) in MySQL strežnika
(CET) napačno prikazala preostali čas zaklepa (~61 minut namesto 1 minute).
Napaka je bila odpravljena tako, da se celoten izračun preostalega časa
(`TIMESTAMPDIFF`) izvede znotraj same MySQL poizvedbe, kar odpravi
odvisnost od ujemanja časovnih pasov med strežnikoma. Po popravku je bil
test ponovljen in čas je bil pravilen (~60 s).

## Sprint 2: ER-diagram in prijava uporabnikov - 13/13 uspešnih

## A) Avtomatizirani UI testi (Playwright) - 13/13 uspešnih

1. Neprijavljen uporabnik, ki odpre `index.html`, je samodejno preusmerjen na `login.html`.
2. Registracija novega uporabnika prek obrazca uspe in preusmeri na `index.html`.
3. Po registraciji je v zgornji vrstici prikazano pravilno uporabniško ime.
4. Nov uporabnik ob prvi prijavi vidi prazno nadzorno ploščo (0,00 € - izolacija podatkov med računi).
5. Ob neujemanju gesla in ponovljenega gesla se prikaže napaka na strani odjemalca ("Gesli se ne ujemata").
6. Prijava z obstoječim (demo) računom uspe in prikaže seznam testnih transakcij.
7. Napačno geslo ob prijavi vrne jasno sporočilo o napaki ("Napačno uporabniško ime ali geslo").
8. Po prijavi se grafi (Chart.js) pravilno izrišejo.
9. Dodajanje nove transakcije prek modalnega obrazca se takoj prikaže v seznamu.
10. Po osvežitvi strani (reload) dodana transakcija ostane (podatek je v MySQL, ne v localStorage).
11. Brisanje transakcije (prek gumba 🗑️, s potrditvenim oknom) deluje in se takoj odrazi v seznamu.
12. Med celotnim potekom ni nepričakovanih napak v konzoli brskalnika.
13. Po odjavi API za transakcije pravilno vrne `401 Unauthorized` (seja je resnično uničena, ne le skrita v vmesniku).

## B) Ročni testi API-ja (curl) - vsi uspešni

- `POST api/register.php` z veljavnimi podatki ustvari uporabnika, privzeti proračun (0 €) in cilj varčevanja.
- Novoregistriran uporabnik ob `GET api/transactions.php` dobi prazen seznam (ne vidi tujih podatkov).
- V bazi (`SELECT password_hash FROM users`) je geslo shranjeno kot bcrypt zgoščena vrednost (`$2y$10$...`), **ne** v čisti obliki.
- `POST api/login.php` z napačnim geslom vrne `401` in splošno sporočilo o napaki.
- `POST api/register.php` z že zasedenim uporabniškim imenom vrne `409` ("že v uporabi").
- `POST api/logout.php` uniči sejo; naslednji klic na zaščiten endpoint vrne `401`.
- `POST api/budget.php` za enega uporabnika ne vpliva na proračun drugega uporabnika (preverjeno z dvema vzporednima sejama/piškotkoma).
- `POST api/reset.php?action=reseed` za novega uporabnika doda 29 testnih transakcij, ne da bi se dotaknil podatkov demo računa.
- `GET api/login.php` (preverjanje trenutne seje) brez prijave vrne `401`.

## C) Pregled podatkovne baze

- Uvoz `db.sql` prek phpMyAdmin ustvari vse 4 tabele (`users`, `transactions`, `budget`, `savings_goal`) s pravilnimi tujimi ključi (preverjeno s `SHOW CREATE TABLE`).
- Šumniki (č, š, ž) se po uvozu s `SET NAMES utf8mb4;` pravilno prikažejo (ni podvojenega UTF-8 kodiranja).
- `ON DELETE CASCADE` na tujih ključih je bil pregledan v shemi (zagotavlja čiščenje podatkov ob morebitnem brisanju uporabnika).

## D) Vizualna preveritev

- `er-diagram.png`/`.svg` pregledan - entitete, atributi, označeni primarni/tuji ključi in kardinalnost (1:N, 1:1) so čitljivi in skladni s shemo v `db.sql`.
- Prijavna in registracijska stran preverjeni v brskalniku - obrazci so poravnani, sporočila o napakah so vidna in berljiva.

## Opombe

- Testno okolje je uporabljalo lokalno MariaDB na vratih `3306` (ker testni vsebnik nima MAMP-a); pred dostavo je bila vrednost `$DB_PORT` v `api/config.php` vrnjena na privzeto macOS MAMP vrednost `'8889'` (preverjeno z `grep`).
- Testni uporabniki in testne transakcije, ustvarjeni med avtomatiziranimi testi, so bili po testiranju izbrisani iz baze - demo račun je ostal nedotaknjen (29 testnih transakcij).
