# Moji stroški - navodila za zagon (MAMP + VS Code)

Spletna aplikacija za sledenje osebnim stroškom. Frontend je napisan v
HTML/CSS/JavaScript, podatki pa se shranjujejo v **MySQL** podatkovno
bazo preko PHP REST API-ja. Aplikacija zdaj vključuje tudi
**registracijo in prijavo uporabnikov** - vsak uporabnik vidi samo
svoje transakcije, proračun in cilj varčevanja.

## 1. Tehnologije

- HTML5, CSS3, vanilla JavaScript (brez ogrodij)
- PHP 8 (procedurno, PDO za dostop do baze, pripravljeni SQL stavki)
- MySQL / MariaDB (preko MAMP)
- Chart.js (iz CDN; če ni na voljo, se samodejno prikaže rezervni prikaz z vrsticami)
- Gesla so zgoščena z `password_hash()` (bcrypt) - **nikoli shranjena v čisti obliki**

## 2. Namestitev MAMP-a

1. Prenesi in namesti [MAMP](https://www.mamp.info/) (Windows ali macOS).
2. Zaženi MAMP in klikni **Start Servers** (Apache + MySQL morata biti zelena).
3. V MAMP → **Preferences → Ports** preveri, na katerih vratih teče MySQL:
   - macOS (privzeto): `8889`
   - Windows (privzeto): `3306`

## 3. Namestitev datotek projekta

1. Kopiraj celotno mapo `expense-tracker-php/` v MAMP-ovo mapo `htdocs`
   (npr. `C:\MAMP\htdocs\expense-tracker-php` ali `/Applications/MAMP/htdocs/expense-tracker-php`).
2. Preveri, da je ohranjena **natančno ta struktura map**:

   ```
   expense-tracker-php/
   ├── index.html
   ├── login.html
   ├── register.html
   ├── er-diagram.png
   ├── db.sql
   ├── css/
   │   └── style.css
   ├── js/
   │   ├── app.js
   │   └── auth.js
   └── api/
       ├── config.php
       ├── register.php
       ├── login.php
       ├── logout.php
       ├── transactions.php
       ├── budget.php
       ├── savings.php
       └── reset.php
   ```

   (Če datoteke prekopiraš posamično, obvezno ročno ustvari mape
   `css/`, `js/` in `api/` - sicer strani ne bo prikazalo sloga/funkcij.)

3. Odpri mapo v **Visual Studio Code** (`File → Open Folder...`).

## 4. Uvoz podatkovne baze

1. Odpri `http://localhost:8888/phpMyAdmin/` (ali vrata, ki jih uporablja MAMP).
2. V phpMyAdmin klikni zavihek **SQL**.
3. Odpri datoteko `db.sql` (v VS Code), prekopiraj **celotno vsebino** in jo prilepi v SQL okno phpMyAdmin.
4. Klikni **Pojdi / Go**. Ustvarita se baza `expense_tracker` s tabelami
   `users`, `transactions`, `budget`, `savings_goal` ter demo uporabnik
   (glej spodaj).

   Alternativa prek ukazne vrstice (poskrbi za UTF-8 nabor znakov zaradi šumnikov):
   ```
   mysql --default-character-set=utf8mb4 -u root -p < db.sql
   ```

### Demo / testni račun

Po uvozu baze je na voljo že en uporabnik za takojšnje preizkušanje:

| Uporabniško ime | Geslo      |
|------------------|------------|
| `demo`           | `demo1234` |

Ta račun ima že pripravljene testne transakcije, proračun in cilj varčevanja.

## 5. Nastavitev povezave z bazo

Odpri `api/config.php` in po potrebi popravi vrata glede na tvoj MAMP:

```php
$DB_HOST = '127.0.0.1';
$DB_PORT = '8889';   // Windows MAMP: navadno '3306'
$DB_NAME = 'expense_tracker';
$DB_USER = 'root';
$DB_PASS = 'root';
```

## 6. Zagon aplikacije

1. V brskalniku odpri:
   ```
   http://localhost:8888/expense-tracker-php/
   ```
   (vrata `8888` so privzeta MAMP vrata za Apache - preveri v MAMP Preferences → Ports).

   **Pomembno:** stran odpri vedno preko `http://localhost...`, nikoli
   kot lokalno datoteko (`file://...`) - PHP API deluje samo preko
   spletnega strežnika.

2. Ker stran zahteva prijavo, te bo samodejno preusmerilo na
   `login.html`. Prijavi se z demo računom (`demo` / `demo1234`) ali
   ustvari nov račun prek povezave "Registrirajte se".

3. Po prijavi se odpre nadzorna plošča z grafi in testnimi podatki
   (samo za demo račun - nov račun začne brez podatkov).

## 7. Registracija in prijava

- **Registracija** (`register.html`): uporabniško ime (3-50 znakov),
  veljaven e-poštni naslov, geslo (vsaj 8 znakov, vneseno dvakrat).
- Geslo se na strežniku takoj zgosti s PHP funkcijo `password_hash()`
  (algoritem bcrypt) - v bazo gre **samo zgoščena vrednost**, nikoli
  pravo geslo.
- **Prijava** (`login.html`) preveri geslo z `password_verify()` in
  ustvari PHP sejo (`$_SESSION`), ki uporabnika prepozna na vseh
  naslednjih straneh/klicih API-ja.
- **Odjava**: gumb "Odjava" v zgornji vrstici (`api/logout.php` uniči sejo).
- Vsi podatki (transakcije, proračun, cilj varčevanja) so v bazi
  povezani s stolpcem `user_id` - vsak uporabnik vidi samo svoje.
- **Zaščita pred ugibanjem gesla**: po 5 zaporednih napačnih poskusih
  prijave se račun za 1 minuto zaklene (stolpca `failed_attempts` in
  `locked_until` v tabeli `users`).
- Geslo mora imeti vsaj 8 znakov ter vsebovati vsaj eno črko in eno številko.

## 8. Funkcionalnosti

- Nadzorna plošča: prihodki/odhodki/saldo za izbrani mesec, "finančni semafor" proračuna, grafi
- Transakcije: dodajanje, urejanje, brisanje, iskanje, filtriranje, sortiranje
- Proračun: mesečni znesek + nastavljiv opozorilni prag (%)
- Varčevanje: cilj, prispevki, napredek
- **Izvoz podatkov**: gumb "Izvozi CSV" (zavihek Nastavitve) prenese vse
  transakcije prijavljenega uporabnika kot `.csv` datoteko (odpre se v Excelu)
- Nastavitve: ponovna nasemenitev s testnimi podatki ali popoln izbris (samo za prijavljenega uporabnika)

## 9. Shranjevanje podatkov

Vsi podatki so v MySQL bazi `expense_tracker` na lokalnem strežniku
(MAMP). Nič se ne pošilja na splet. Gesla so zgoščena (bcrypt), nikoli
v čisti obliki.

## 10. Omejitve

- Ni obnovitve gesla po e-pošti (pozabljeno geslo trenutno ni mogoče ponastaviti).
- Ni potrditve e-poštnega naslova ob registraciji.
- Seja uporablja privzeti PHP piškotek seje (brez "zapomni si me" / dolgotrajne prijave).
- Aplikacija je namenjena enemu lokalnemu strežniku (MAMP); ni pripravljena za javno produkcijsko postavitev (HTTPS, CSRF žetoni ipd. bi bilo treba dodati).

## 11. Odpravljanje težav

| Težava | Vzrok | Rešitev |
|---|---|---|
| Stran brez sloga (samo navaden tekst) | Manjkajo mape `css/`/`js/`/`api/` ali napačna pot | Preveri strukturo map (glej točko 3) in zavihek Network v DevTools za 404 |
| `SQLSTATE[HY000] [2002] ... actively refused` | Napačna vrata MySQL ali MySQL ni zagnan | Preveri MAMP Preferences → Ports in popravi `$DB_PORT` v `config.php` |
| Šumniki (č,š,ž) izpisani narobe | Uvoz baze brez UTF-8 nabora | Uvozi prek phpMyAdmin ali uporabi `--default-character-set=utf8mb4` |
| Grafi se ne prikažejo | CDN za Chart.js ni dosegljiv | Aplikacija samodejno preklopi na rezervni prikaz z vrsticami |
| Po prijavi takoj preusmeri nazaj na login | PHP seje ne delujejo (piškotki blokirani) | Preveri, da brskalnik dovoljuje piškotke za `localhost` |
| "Uporabniško ime ali e-poštni naslov je že v uporabi" | Račun s tem imenom/e-pošto že obstaja | Uporabi drugo uporabniško ime/e-pošto ali se prijavi |

## 12. Pregled API končnih točk

| Metoda | Pot | Opis | Zahteva prijavo |
|---|---|---|---|
| POST | `api/register.php` | Registracija novega uporabnika | Ne |
| POST | `api/login.php` | Prijava | Ne |
| GET | `api/login.php` | Podatki o prijavljenem uporabniku | Da |
| POST | `api/logout.php` | Odjava | Da |
| GET | `api/transactions.php` | Seznam transakcij | Da |
| POST | `api/transactions.php` | Nova transakcija | Da |
| PUT | `api/transactions.php?id=X` | Popravek transakcije | Da |
| DELETE | `api/transactions.php?id=X` | Brisanje transakcije | Da |
| GET/POST | `api/budget.php` | Branje/nastavitev proračuna | Da |
| GET/POST | `api/savings.php` | Branje/nastavitev cilja varčevanja | Da |
| POST | `api/savings.php?action=contribute` | Dodaj prispevek | Da |
| POST | `api/savings.php?action=reset` | Ponastavi napredek na 0 | Da |
| POST | `api/reset.php?action=reseed` | Ponastavi na testne podatke | Da |
| POST | `api/reset.php?action=wipe` | Izbriši vse podatke uporabnika | Da |
