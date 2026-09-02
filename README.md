# Parkitin

![Parkitin](assets/parkitin.svg)

Parkitin on PHP:n, MySQL:n ja selaimessa ajettavan TypeScript-käyttöliittymän muodostama pysäköintipalvelun prototyyppi. Käyttöliittymä käyttää vain vanillaa TypeScriptiä ja CSS:ää. Erillistä käyttöliittymäkirjastoa tai karttakirjastoa ei käytetä.

Palvelu sijaitsee tuotannossa osoitteessa:

`https://testinikkari.fi/parkitin/`

## Arkkitehtuuri

Sovelluksessa on kolme pääosaa:

1. **MySQL-tietokanta** säilyttää käyttäjät, pysäköintialueet, pysäköintipaikat, pysäköinnit, istunnot, kirjautumislinkit ja maksut.
2. **PHP REST API** käsittelee tietokantatoiminnot, tunnistautumisen, pysäköinnin, maksut ja sähköpostit.
3. **Vanilla TypeScript + CSS -käyttöliittymä** näyttää kirjautumisen, profiilin, kartan, pysäköinnin ja hallintapaneelin.

Selain lataa juuren `index.php`-tiedostosta HTML-kuoren. TypeScriptin lähdekoodi on `src/app.ts`. Käännetty selainkoodi on `assets/js/app.js`. Tyylit ovat tiedostossa `assets/css/style.css`.

## Tietokanta

Tietokantarakenne on tiedostossa `sql/schema.sql`. Rakenne käyttää InnoDB-moottoria, vierasavaimia ja `utf8mb4`-merkistöä.

### `parking_lots`

Pysäköintialueen perustiedot:

- `id`: alueen yksilöivä tunniste
- `name`: alueen nimi
- `address`: katuosoite
- `city`: postinumeroon perustuva paikkakunta
- `postal_code`: viisinumeroinen postinumero
- `latitude`, `longitude`: palvelimella geokoodatut koordinaatit karttaa varten
- `info`: lisätiedot
- `capacity`: paikkojen lukumäärä, joka johdetaan paikkarivien lukumäärästä
- `price_first_3h`: hinta alkavalta minuutilta ensimmäisten kolmen tunnin aikana
- `price_per_extra_hour`: hinta alkavalta minuutilta kolmen tunnin jälkeen
- `parking`: tällä hetkellä varattujen pysäköintien tunnisteet JSON-muodossa
- `created_at`: luontiaika

Nykyiset mock-hinnat ovat `0,50 EUR / alkava minuutti` ensimmäisten 180 minuutin ajan ja `0,30 EUR / alkava minuutti` sen jälkeen.

### `parking_slots`

Jokainen fyysinen pysäköintipaikka on oma rivinsä:

- `lot_id`: pysäköintialue
- `slot_number`: alueen sisäinen juokseva numero
- `name`: vapaaehtoinen nimi
- `is_active`: voiko paikkaa käyttää

Hallintapaneelissa paikat lähetetään alueen `slots`-taulukkona. Paikan poistaminen järjestää jäljelle jääneet paikat uudelleen numeroille 1, 2, 3 jne. Aktiivista pysäköintiä sisältävää paikkaa ei voi muokata, poistaa tai numeroida uudelleen.

### `users`

Sama taulu sisältää sekä kuljettajat että käyttöliittymän käyttäjätilit. Erillistä `accounts`-taulua ei käytetä.

- `email`: kirjautumiseen käytettävä sähköposti, yksilöivä
- `reg_number`: ajoneuvon rekisterinumero
- `first_name`, `last_name`: nimi
- `postal_code`: käyttäjän postinumero
- `role`: `owner`, `admin` tai `customer`
- `status`: `pending` tai `confirmed`
- `parking`: aktiivisen pysäköinnin JSON-tiedot tai `NULL`

Kaupunki ei ole käyttäjän pysyvä syötekenttä. Se johdetaan postinumerosta XML-tiedoston `assets/postitoimipaikat.xml` avulla.

### `parking_sessions`

Jokainen pysäköintikerta jää historiaan:

- käyttäjä ja pysäköintipaikka
- rekisterinumero pysäköintihetken tietona
- alkuaika ja loppuaika
- laskettu hinta
- laskun tila: `open` tai `paid`

Aktiivinen pysäköinti on rivi, jonka `end_time` on `NULL`. Pysäköinnin päätyttyä rivi jää avoimeksi laskuksi, kunnes mock-maksu merkitsee sen maksetuksi.

### `login_tokens` ja `user_sessions`

`login_tokens` sisältää kertakäyttöiset sähköpostilinkit. Linkki vanhenee 15 minuutissa.

`user_sessions` sisältää onnistuneen linkkikirjautumisen jälkeen luodun istunnon. Istunto vanhenee tunnissa. Selain säilyttää istuntotunnisteen `localStorage`-tallennuksessa ja lähettää sen `Authorization: Bearer ...` -otsakkeena.

### `api_keys`

Tämä taulu on ulkoisen tai palvelinpuolen ajoneuvo- ja alue-API:n API-avaimia varten. Kehitysvaiheessa käytössä on lisäksi `config.php`-tiedostossa oleva väliaikainen `DEV_API_KEY`.

## Skeeman asentaminen

1. Kopioi `config.example.php` tiedostoksi `config.php`.
2. Täytä tietokantapalvelimen, tietokannan, käyttäjän ja salasanan tiedot.
3. Aja skeema:

```bash
mysql -h PALVELIN -u KAYTTAJA -p TIETOKANTA < sql/schema.sql
```

Tuotannossa skeemamuutokset kannattaa ajaa hallitusti migraationa. `CREATE TABLE IF NOT EXISTS` ei muuta jo olemassa olevia tauluja.

## PHP API

API:n etureititin on `api/index.php`. Reitti valitaan query-parametrilla:

`/parkitin/api/index.php?resource=RESOURCE`

JSON POST- ja PUT-pyynnöt lähetetään `Content-Type: application/json` -otsakkeella.

### Kirjautuminen ja käyttäjätili

- `POST resource=login_request`: vastaanottaa sähköpostin. Olemassa olevalle käyttäjälle lähetetään kirjautumislinkki. Uudelle sähköpostille palautetaan `needs_registration`.
- `POST resource=register`: luo uuden käyttäjän `pending`-tilaan ja lähettää linkin.
- `GET resource=verify&token=...`: käyttää linkin, vahvistaa käyttäjän ja palauttaa tunnin istuntotunnisteen.
- `GET resource=me`: palauttaa kirjautuneen käyttäjän tiedot ja roolin.
- `POST resource=update_profile`: muuttaa rekisterinumeroa, nimeä ja postinumeroa. Kaupunki johdetaan palvelimella.
- `DELETE resource=delete_profile`: poistaa vain nykyisen kirjautuneen käyttäjän.

### Pysäköintialueet ja paikat

- `GET resource=lots`: listaa alueet tai palauttaa yhden `id`-parametrilla.
- `POST resource=lots`: luo alueen ja sen `slots`-taulukon.
- `PUT resource=lots&id=...`: muuttaa aluetta ja paikkoja. Aktiivisia paikkoja suojataan.
- `DELETE resource=lots&id=...`: poistaa alueen.
- `GET resource=slots&lot_id=...`: listaa alueen paikat.
- `GET resource=free_slot&lot_id=...`: palauttaa ensimmäisen vapaan aktiivisen paikan.

Alueen luonti- tai päivitysdata näyttää periaatteessa tältä:

```json
{
  "name": "P-Ratina",
  "address": "Ratinankatu 2",
  "postal_code": "33100",
  "info": "Lisätiedot",
  "price_first_3h": 0.5,
  "price_per_extra_hour": 0.3,
  "slots": [
    {"name": "Sisäänkäynnin vieressä", "is_active": true},
    {"name": null, "is_active": true}
  ]
}
```

`city`, `latitude`, `longitude` ja `capacity` johdetaan tai lasketaan palvelimella. Niitä ei pidä luottaa selaimen lähettäminä arvoina.

### Pysäköinnin elinkaari

- `POST resource=parking_start`: tarkistaa, ettei käyttäjällä ole aktiivista pysäköintiä, lukitsee alueen ja vapaan paikan, luo session sekä päivittää käyttäjän ja alueen `parking`-kentät.
- `POST resource=parking_cancel`: peruu juuri tehdyn aktiivisen varauksen ja vapauttaa paikan.
- `GET resource=parking_status`: palauttaa käyttäjän aktiivisen pysäköinnin, keston ja tämänhetkisen hinnan.
- `POST resource=parking_stop`: päättää session, laskee loppuhinnan, poistaa aktiivisen tilan ja jättää session avoimeksi laskuksi.

Hinta lasketaan alkavina minuutteina. Yksi sekunti pyöristyy yhdeksi minuutiksi. Ensimmäiset 180 minuuttia käyttävät ensimmäistä hintaa ja ylimenevät minuutit jälkimmäistä hintaa.

### Maksut

- `GET resource=payments&status=open`: käyttäjän avoimet laskut.
- `GET resource=payments&status=paid`: maksu- ja pysäköintihistoria.
- `POST resource=payments_pay`: mock-maksu merkitsee kaikki käyttäjän avoimet laskut maksetuiksi.
- `GET resource=map_lots`: kirjautuneen käyttäjän karttaa varten alueet ja saatavuus.

Laskun sähköpostitoiminto on poistettu käytöstä. Maksut hallitaan tietokannan `parking_sessions.status`-kentällä.

## API-tunnistautuminen

API:ssa on kaksi tunnistautumistapaa:

1. **Kuljettaja- ja integraatio-API**: `X-Api-Key`-otsake. Kehityksen kovakoodattu avain on `DEV_API_KEY`; tuotannossa avaimet voidaan tarkistaa `api_keys`-taulusta.
2. **Selainkäyttöliittymä**: `Authorization: Bearer SESSION_TOKEN`. Token syntyy kertakäyttöisen sähköpostilinkin kautta ja vanhenee tunnissa.

Omistaja- ja ylläpitäjätoiminnot tarkistavat lisäksi käyttäjän roolin. Asiakkaan Bearer-token ei anna pääsyä hallintatoimintoihin.

## Käyttöliittymä

`index.php` tarjoaa vain HTML-kuoren. `src/app.ts` sisältää käyttöliittymälogiikan ja käännetään tiedostoksi `assets/js/app.js`.

Käännä TypeScript:

```bash
./node_modules/.bin/tsc -p tsconfig.json
```

Tarkista selainkoodi:

```bash
node --check assets/js/app.js
```

UI käyttää:

- DOM API:a ilman Reactia, Vuea tai muuta UI-kirjastoa
- vanilla CSS:ää tiedostosta `assets/css/style.css`
- OpenStreetMapin karttatiilejä
- selaimen geolocation-API:a käyttäjän sijainnin kysymiseen
- `pin.svg`-kuvaketta alueiden karttamerkkeihin
- `me.svg`-kuvaketta oman sijainnin keskityspainikkeeseen
- `loading-map.jpg`-kuvaa ja animaatiota kartan lataustilassa

Kartta käyttää tietokantaan valmiiksi tallennettuja koordinaatteja. Selaimessa ei tehdä Nominatim-geokoodausta, joten kartan lataus ei riipu Nominatimin CORS-käytännöistä.

## Roolit

### `owner`

Ensimmäinen järjestelmään luotu käyttäjä saa automaattisesti `owner`-roolin. Omistaja voi:

- avata hallintapaneelin
- lisätä, muuttaa ja poistaa pysäköintialueita
- lisätä, muuttaa ja poistaa `admin`- ja `customer`-käyttäjiä
- nähdä owner-käyttäjät, mutta ei muuttaa tai poistaa heitä
- hallita pysäköintipaikkoja alueiden `slots`-taulukossa

### `admin`

Ylläpitäjä voi:

- avata hallintapaneelin
- hallita pysäköintialueita
- nähdä kaikki käyttäjät
- lisätä, muuttaa ja poistaa vain `customer`-käyttäjiä
- nähdä owner- ja admin-tiedot ilman muokkaus- tai poistomahdollisuutta

### `customer`

Asiakas voi:

- avata pysäköintikartan
- kysyä selaimelta oman sijainnin käyttöoikeutta
- nähdä pysäköintialueet kartalla ja niiden saatavuuden
- aloittaa yhden pysäköinnin kerrallaan
- perua juuri tehdyn varauksen
- lopettaa pysäköinnin
- avata oman profiilin
- muuttaa rekisterinumeroa, nimeä ja postinumeroa
- tarkastella avoimia maksuja ja historiaa
- käyttää mock-maksun liukusäädintä
- poistaa oman profiilinsa

Sähköpostiosoitetta ei voi muuttaa käyttöliittymästä.

## Kirjautumis- ja pysäköintivirta

1. Käyttäjä syöttää sähköpostiosoitteen.
2. API tarkistaa osoitteen muodon palvelimella ja selain tarkistaa sen myös normaalilla HTML-validoinnilla.
3. Olemassa oleva käyttäjä saa kertakäyttöisen kirjautumislinkin.
4. Uusi käyttäjä saa mahdollisuuden luoda `pending`-tilin.
5. Linkin avaaminen vahvistaa tilin ja luo tunnin Bearer-istunnon.
6. Puuttuvat rekisterinumero, nimi tai postinumero kysytään profiilissa.
7. Postinumero haetaan XML-rekisteristä, ja postitoimipaikka näytetään lukittuna.
8. Kartta lataa alueet ja saatavuuden.
9. Start parking lukitsee vapaan aktiivisen paikan tietokantatransaktiossa.
10. Käyttäjä vahvistaa osoitetun paikan valinnalla `I have parked` tai peruu varauksen.
11. Stop parking päättää session ja luo avoimen laskun.
12. Avoin lasku näkyy profiilin maksut-osiossa.
13. Mock-maksu merkitsee laskun `paid`-tilaan ja siirtää sen historiaan.

## Lokalisaatio

Lokalisaatio on toteutettu ilman ulkoista kirjastoa.

`i18n/` sisältää yhden JSON-tiedoston jokaista localea varten. Tiedoston rakenne on:

```json
{
  "locale": "fi-FI",
  "name": "Suomi",
  "default": true,
  "translations": {
    "login": {
      "submit": "Kirjaudu sisään"
    }
  }
}
```

`i18n/index.php` lukee kansiossa olevien JSON-tiedostojen metatiedot. Käyttöliittymän `initI18n()` valitsee sessionStorageen tallennetun kielen tai käyttää `default: true` -kieltä.

Kaikki käyttöliittymän tekstit haetaan `trans()`-funktiolla:

```typescript
trans('login.submit')
trans('welcome.greeting', { email })
```

Avain koostuu kontekstista ja tekstinimestä. Parametrit korvataan `{email}`-tyyppisillä paikoilla. Kielen vaihto ei lataa sivua uudelleen eikä tyhjennä lomakkeita. `retranslateCurrentScreen()` päivittää näkyvän näkymän tekstit, placeholderit ja painikkeet olemassa oleviin DOM-elementteihin.

## Mock-Digitraffic-data

`scripts/digitraffic-mock.json` on Digitrafficin pysäköintidatan muotoa mukaileva GeoJSON-aineisto. Se sisältää mock-kohteita suomalaisissa kaupungeissa.

`expand_digitraffic_mock.php` luo aineistoon lisää leikkimielisesti nimettyjä kohteita. Se poistaa aiemmat `mock-*`-tunnisteiset kohteet ennen uusien luontia, joten komento on toistettavissa.

```bash
php scripts/expand_digitraffic_mock.php
php scripts/import_digitraffic.php
```

Tuontiskripti:

- tarkistaa aineiston
- johtaa kaupungin postinumerosta
- käyttää GeoJSON-koordinaatteja
- lisää alueen ja sen paikat
- käyttää mock-hintoja `0,50` ja `0,30`
- ohittaa nimellä jo tuodut alueet

Aineisto on mock-dataa, ei vahvistettu reaaliaikainen Digitraffic-syöte.

## Sähköpostit

PHPMailer asennetaan Composerilla:

```bash
composer install
```

Sähköpostien lähetys käyttää tällä hetkellä PHP:n `mail()`-toimintoa PHPMailerin `isMail()`-tilassa. Viestit lähetetään UTF-8-merkistöllä. Kirjautumislinkkien sähköposti on toteutettu `mailer.php`-tiedostossa.

## Turvallisuus ja tuotantohuomiot

- Älä julkaise `config.php`-tiedostoa tai sen salasanoja.
- `config.php` on jätetty `.gitignore`-tiedostoon; käytä `config.example.php`-pohjaa.
- Vaihda kehityksen `DEV_API_KEY` ennen oikeaa integraatiokäyttöä.
- Lisää kirjautumispyyntöihin rate limiting ennen tuotantokäyttöä.
- Konfiguroi SMTP tai muu luotettava postipalvelu, jos PHP `mail()` ei riitä.
- Pidä `vendor/` ja `node_modules/` palvelimella vain tarpeen mukaan; ne eivät kuulu lähdekoodin toiminnalliseen dokumentaatioon.
- Admin-rajapinnan roolit tarkistetaan palvelimella. Pelkkää käyttöliittymän piilotusta ei pidä pitää käyttöoikeutena.

## Tiedostot

- `index.php`: selaimen HTML-kuori, header ja assettien välimuistiversiointi
- `src/app.ts`: vanilla TypeScript -käyttöliittymä, kartta, kirjautuminen ja maksut
- `assets/js/app.js`: TypeScriptin käännetty selainversio
- `assets/css/style.css`: responsiivinen CSS
- `api/index.php`: REST-reititin
- `handlers/account.php`: kirjautuminen, profiili, pysäköinti ja maksut
- `handlers/users.php`: käyttäjien hallinta ja roolirajoitukset
- `handlers/lots.php`: alueiden ja paikkojen hallinta
- `handlers/slots.php`: paikkakyselyt
- `handlers/sessions.php`: pysäköintisessioiden vanhempi rajapinta
- `helpers.php`: yhteiset validointi-, JSON-, XML- ja geokoodausfunktiot
- `auth.php`: API-avain- ja session-tunnistautuminen
- `db.php`: PDO-yhteys
- `mailer.php`: PHPMailer-sähköpostit
- `sql/schema.sql`: tietokannan rakenne
- `i18n/*.json`: käyttöliittymän käännökset
- `assets/postitoimipaikat.xml`: postinumeroiden ja postitoimipaikkojen lähde
- `scripts/import_digitraffic.php`: mock-aineiston tuonti
- `scripts/expand_digitraffic_mock.php`: mock-aineiston laajennus

## Tarkistukset

```bash
./node_modules/.bin/tsc -p tsconfig.json
node --check assets/js/app.js
for f in index.php api/index.php config.php db.php auth.php helpers.php mailer.php handlers/*.php i18n/index.php scripts/*.php; do php -l "$f"; done
python3 -m json.tool i18n/fi-FI.json >/dev/null
python3 -m json.tool i18n/en-GB.json >/dev/null
```

Sovellus on tällä hetkellä prototyyppi. Pysäköinnin ja maksun liiketoimintalogiikka toimii tietokannan kautta, mutta maksaminen ja osa ulkoisesta pysäköintidatasta ovat tarkoituksella mock-toteutuksia.
