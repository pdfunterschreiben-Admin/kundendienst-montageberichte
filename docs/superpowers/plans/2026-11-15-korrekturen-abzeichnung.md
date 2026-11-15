# Korrekturen, Rückfragen und Abzeichnen – Umsetzungsplan

> **Für ausführende Agenten:** Benötigter Skill: superpowers:subagent-driven-development (empfohlen) oder superpowers:executing-plans. Schritte mit Checkboxen (`- [ ]`).

**Ziel:** Im Büro-Programm lassen sich Berichte je Auftrag korrigieren, mit Rückfrage markieren und mit Unterschrift abzeichnen; alles steht auf einer angehängten Prüfseite der PDF.

**Architektur:** Vermerke liegen als Verlauf (nur anhängen) in einem neuen Blatt auf dem Apps-Script-Server; der Stand je Auftrag wird daraus berechnet. Das Programm baut beim Erstellen der PDF die Prüfseite mit pdf-lib hinten an. Die Unterschrift kommt per QR-Code und Handy-Foto (Handy-Seite auf GitHub Pages) und wird beim Abzeichnen mit auf den Server gelegt.

**Technik:** Go 1.24 (nur Standardbibliothek), Web-Oberfläche in `web/index.html`, pdf-lib 1.17.1 (schon im Programm), Apps Script (`server/Montageberichte.js`), Node 22 (`node --test`) für Tests.

**Design:** `docs/superpowers/specs/2026-11-15-korrekturen-abzeichnung-design.md` (vorher lesen)

## Globale Vorgaben
- Nur dieses Repository ändern. Das Repository der Service-Mappe wird nur gelesen. `admin/Code.gs` dort nicht ändern; die nötigen Zeilen stehen in `docs/server-einspielen.md`.
- Bereiche der Korrektur genau: `Text`, `Ersatzteile`, `Arbeitszeit`, `Sonstiges`.
- Blatt: `Korrekturen Montageberichte`. Ereignisse: `korrektur`, `klaerung_setzen`, `klaerung_erledigt`, `abzeichnung`.
- Der Auftrag wird überall über denselben Text erkannt wie im Programm (`g.datei` in `web/index.html`).
- Code der Handy-Seite: 24 Zeichen aus 0-9a-f, gilt 600 Sekunden. Foto höchstens 90000 Zeichen Base64.
- Unterschrift lokal: `unterschrift.png` in `dataDir()`. Auf dem Server: Drive-Ordner `Kundendienst Montageberichte/Unterschriften`.
- Prüfseite nur, wenn es Vermerke gibt. Schrift: Helvetica (WinAnsi). Alle Oberflächentexte deutsch.
- Keine neuen Go-Abhängigkeiten, keine neue QR-Bibliothek (QR kommt vom Server).
- Herausgabe nur über `TESTVERSION` (auf `1.1.0`). `VERSION` bleibt `1.0.1`.
- Die Server-Datei darf nur Funktionen und Konstanten enthalten, die in Apps Script laufen (kein `import`); die letzte Zeile `module.exports` bleibt für die Tests.
- Commit-Nachrichten enden mit den Zeilen `Co-Authored-By` und `Claude-Session` wie in den bisherigen Commits.
- Tests: `node --test "test/*.test.js"` (Prüfseite braucht pdf-lib: `NODE_PATH=/opt/npm-tools/node_modules node --test "test/*.test.js"`), `go test ./...`, `go vet ./...`.

## Review Focus
1. Text mit Zeichen außerhalb WinAnsi (Emoji, „→“), Zeilenumbrüchen und 300 Zeichen ohne Leerzeichen darf die Prüfseite nicht zum Absturz bringen (Task 6).
2. Nach einer Abzeichnung noch korrigieren oder Rückfrage setzen: Abzeichnung entfällt; Abzeichnen bei offener Rückfrage wird abgelehnt (Task 1, 2).
3. Code vom Handy: fremder Nutzer, abgelaufen, zweiter Upload, zu großes Foto, Sonderzeichen im Code (Task 3).
4. Foto der Unterschrift: Papier im Schatten, leeres Blatt, sehr kleines Foto (Task 5).
5. Server noch nicht aktualisiert („Unbekannte Anfrage.“) oder offline: klare Meldung statt Fehler, PDF wird trotzdem ohne Prüfseite erstellt (Task 6, 9).

---

### Task 1: Stand aus dem Verlauf berechnen und Eingaben prüfen

**Files:** Modify `server/Montageberichte.js` (am Ende vor `module.exports`, Export erweitern); Create `test/server.test.js`

**Interfaces:**
- Produces: `const MB_BEREICHE`, `mbStand(ereignisse) -> {korrekturen:[{t,bereich,vorher,nachher,name}], klaerung:null|{offen:boolean,text,name,t}, abzeichnung:null|{name,t,unterschriftId}, schluessel:string}`, `mbVermerkPruefen(ereignis, daten, stand) -> string|null`. Ein Ereignis ist `{t:number, ereignis, bereich, vorher, nachher, text, name, mail, unterschriftId}` in Zeilenreihenfolge. `daten` ist `{bereich, vorher, nachher, text}`. `schluessel` ist `"<Anzahl>:<t des letzten>"`, `"0:0"` bei leerem Verlauf.

- [ ] **Schritt 1: Tests schreiben** (`test/server.test.js`, lädt `require('../server/Montageberichte.js')`):
  - `mbStand([])` ist `{korrekturen:[], klaerung:null, abzeichnung:null, schluessel:'0:0'}`.
  - Zwei Korrekturen bleiben in Reihenfolge; `schluessel` ist `'2:<t der zweiten>'`.
  - `[korrektur, abzeichnung('Anna','U1')]` gibt `abzeichnung` `{name:'Anna', t, unterschriftId:'U1'}`. Danach `korrektur` oder `klaerung_setzen` angehängt: `abzeichnung` ist `null`. Danach `klaerung_erledigt` angehängt (nach vorherigem `klaerung_setzen` vor der Abzeichnung): `abzeichnung` bleibt.
  - Rückfrage: `[setzen('Zeit?'), erledigt('Bob')]` gibt `klaerung.offen === false`; danach `setzen('neu')` gibt `{offen:true, text:'neu'}`.
  - `mbVermerkPruefen` gibt genau diese Texte zurück: unbekannter Bereich `'Unbekannter Bereich.'`; leeres `nachher` `'Bitte angeben, was richtig ist.'`; `vorher`/`nachher` über 500 oder `text` über 1000 Zeichen `'Text zu lang.'`; `klaerung_setzen` ohne Text `'Bitte die Rückfrage beschreiben.'`; `klaerung_erledigt` ohne offene Rückfrage `'Es ist keine Rückfrage offen.'`; `abzeichnung` bei offener Rückfrage `'Rückfrage noch offen – erst als geklärt markieren.'`; `abzeichnung` bei schon gültiger Abzeichnung `'Schon abgezeichnet.'`; gültige Eingaben `null`.
- [ ] **Schritt 2:** `node --test test/server.test.js` → FAIL (`mbStand is not a function`).
- [ ] **Schritt 3: Implementieren** wie in Interfaces. Eine Abzeichnung gilt, wenn nach ihr (Zeilenreihenfolge, nicht Zeit) kein `korrektur` und kein `klaerung_setzen` folgt. Die letzte Rückfrage-Meldung (`setzen`/`erledigt`) bestimmt `klaerung`.
- [ ] **Schritt 4:** gleicher Befehl → PASS.
- [ ] **Schritt 5: Commit** `feat(server): Stand der Vermerke berechnen und prüfen`

### Task 2: Server-Anfragen für Vermerke und Unterschrift-Datei

**Files:** Modify `server/Montageberichte.js` (`mbNutzer`, `montageberichteAnfrage`, neue Funktionen); Test `test/server.test.js`

**Interfaces:**
- Consumes: `mbStand`, `mbVermerkPruefen` aus Task 1.
- Produces: `mbVermerkAnfrage(ev, d, nutzer, ablage, jetzt) -> {ok:true, vermerke:{[auftrag]:stand}} | {ok:true, stand} | {ok:true, b64} | {ok:false, error}`. `ev` ist `mb_vermerke`, `mb_korrektur`, `mb_klaerung` (`d.aktion` `'setzen'` oder `'erledigt'`), `mb_abzeichnen` (`d.unterschrift` = PNG als Base64) oder `mb_unterschrift_datei` (`d.id`). `d` hat `monteur` (E-Mail), `jahr`, `kw`, `auftrag`, `bereich`, `vorher`, `nachher`, `text`. `nutzer` ist `{mail, name}`. `ablage` ist `{zeilen(): Ereignis-Zeilen mit monteur, jahr, kw, auftrag zusätzlich zu den Feldern aus Task 1 und pruefsumme, anhaengen(zeile), unterschriftSpeichern(mail, b64) -> {id, pruefsumme}, unterschriftLesen(id) -> b64}`. `mbNutzer(ss, d)` gibt jetzt `{mail, name}` zurück (Name aus Spalte „Name“ des Blatts „Nutzer Montageberichte“).

- [ ] **Schritt 1: Tests schreiben** (Fake-`ablage` im Test, in Arrays):
  - `mb_korrektur` hängt eine Zeile mit `name:'Berta'`, `mail`, `t === jetzt` an und gibt `stand.korrekturen[0]` mit Bereich `Arbeitszeit`, vorher `1,5 h`, nachher `2,0 h`.
  - `mb_vermerke` liefert nur Aufträge des angefragten Monteurs, Jahrs und der KW (Fremde Zeilen anderer Monteur und anderer KW kommen nicht vor).
  - Zwei Nutzer nacheinander am selben Auftrag: beide Zeilen vorhanden, in Reihenfolge der Aufrufe.
  - Auftrag `ohne Auftragsnummer Ä-12 ö` kommt unverändert als Schlüssel zurück.
  - `mb_abzeichnen`: leere `unterschrift` gibt `'Bitte zuerst die Unterschrift hinterlegen.'`; `'AAAA'` oder eine PNG-Unterschrift mit mehr als 200000 Zeichen gibt `'Unterschrift ungültig.'`; mit `'iVBORw0KGgo='` plus Auffüllung bis 20 Zeichen wird gespeichert und `stand.abzeichnung.unterschriftId` ist die von `unterschriftSpeichern` gelieferte ID. Danach `mb_korrektur` → `abzeichnung` ist `null`.
  - `mb_unterschrift_datei`: unbekannte ID `{ok:false, error:'Unterschrift nicht gefunden.'}`; bekannte (aus einer Abzeichnungszeile) `{ok:true, b64}`.
  - Unbekanntes `ev` gibt `{ok:false, error:'Unbekannte Anfrage.'}`.
- [ ] **Schritt 2:** Test → FAIL.
- [ ] **Schritt 3: `mbVermerkAnfrage` implementieren** (Prüfungen über `mbVermerkPruefen`; Texte mit `clean`-ähnlicher Kürzung; Monteur-E-Mail kleingeschrieben).
- [ ] **Schritt 4: Anbindung (nicht automatisch testbar):** `mbAblage(ss)` über `sheet(ss, 'Korrekturen Montageberichte', Kopf)` mit Kopf `Zeitpunkt, Ereignis, Monteur-E-Mail, Jahr, KW, Auftrag, Bereich, Vorher, Nachher, Text, Name, E-Mail, Unterschrift-ID, Prüfsumme`; Auftrag, Vorher, Nachher mit führendem `'` schreiben wie `mbHoch` es für `nr` tut. `unterschriftSpeichern` legt PNG in `mbOrdner('Unterschriften')` ab und nimmt eine vorhandene ID derselben E-Mail mit gleicher Prüfsumme wieder. In `montageberichteAnfrage`: `const nutzer = mbNutzer(ss, d)`; die vier schreibenden und lesenden Ereignisse an `mbVermerkAnfrage(...)` weiterreichen, schreibende unter `LockService.getScriptLock()` (`waitLock(20000)`, `finally` freigeben).
- [ ] **Schritt 5:** `node --test test/server.test.js` → PASS; `node --check server/Montageberichte.js` → keine Ausgabe.
- [ ] **Schritt 6: Commit** `feat(server): Anfragen für Korrekturen, Rückfragen, Abzeichnung`

### Task 3: Server – Unterschrift vom Handy

**Files:** Modify `server/Montageberichte.js`; Create `test/handy.test.js`

**Interfaces:**
- Produces: `const MB_HANDY_URL = 'https://pdfunterschreiben-admin.github.io/kundendienst-montageberichte/handy/'`, `mbSigCode(nutzer, cache, zufall, handyUrl, qr) -> {ok:true, token, link, qr}`, `mbSigHandy(d, cache) -> '1'|'0'` (wirft `Error` bei Fehlern; `d.aktion` `'pruefen'` oder `'hochladen'`, `d.token`, `d.b64`), `mbSigAbholen(token, nutzer, cache) -> {ok:true, wartet:true} | {ok:true, b64} | {ok:false, error:'Code ungültig oder abgelaufen.'}`. `cache` hat `get(k)`, `put(k, v, sekunden)`, `remove(k)`; `zufall()` gibt 24 Zeichen 0-9a-f; `qr(link)` gibt den QR-Code als Base64-Bild.

- [ ] **Schritt 1: Tests** (Fake-Cache mit eigener Uhr `tick(sekunden)` in `test/handy.test.js`):
  - `mbSigCode`: `token` passt auf `/^[0-9a-f]{24}$/`, `link === MB_HANDY_URL + '?sig=' + token`, `qr === Fake-qr(link)`.
  - Hochladen mit `'/9j/' + 'A'.repeat(100)` gibt `'1'`; `mbSigAbholen` durch den Eigentümer gibt `{ok:true, b64}`, ein zweites Mal `{ok:false, error:'Code ungültig oder abgelaufen.'}`.
  - Abholen vor dem Hochladen: `{ok:true, wartet:true}`.
  - Anderer Nutzer holt ab: `ok:false`; der Eigentümer bekommt das Foto danach trotzdem.
  - Nach `tick(601)`: `mbSigHandy` `hochladen` wirft `/abgelaufen/`, `pruefen` gibt `'0'`.
  - Zweiter Upload wirft `/schon ein Foto/`; 90001 Zeichen werfen `/zu groß/`; Base64 ohne JPEG-/PNG-Anfang (`/9j/` oder `iVBOR`) wirft `/Kein Foto/`; Token `'../x'` wirft `/abgelaufen/`.
- [ ] **Schritt 2:** `node --test test/handy.test.js` → FAIL.
- [ ] **Schritt 3: Implementieren.** Cache-Schlüssel `sig_<token>`, Wert JSON `{mail, b64}` (`b64:null` bis zum Upload), Ablauf 600 Sekunden, Token vor Gebrauch auf `[a-f0-9]` reinigen. `mbSigAbholen` löscht den Eintrag nach der Ausgabe.
- [ ] **Schritt 4: Anbindung:** in `montageberichteAnfrage` `mb_unterschrift_code` (Zufall `Utilities.getUuid().replace(/-/g,'').slice(0,24)`, `qr` = `qrBmpBase64(link, 6)` aus `QrCode.js` im Projekt) und `mb_unterschrift_abholen` verdrahten; global `function mbHandySig(d){ return mbSigHandy(d, CacheService.getScriptCache()); }` für `Code.gs`.
- [ ] **Schritt 5:** `node --test "test/*.test.js"` → PASS. **Schritt 6: Commit** `feat(server): Unterschrift vom Handy abholen`

### Task 4: Handy-Seite und Anleitung zum Einspielen

**Files:** Create `docs/handy/index.html`, `docs/server-einspielen.md`, `test/handy-seite.test.js`

- [ ] **Schritt 1: Test** `test/handy-seite.test.js`: Datei `docs/handy/index.html` enthält `event: "h_sig"`, `aktion: "hochladen"`, `capture="environment"`, `text/plain`, `credentials: "omit"` und die Adresse des Anmeldeservers aus `docs/handy/index.html` des Service-Mappe-Repositorys (Konstante `SERVER`, nur gelesen: `https://script.google.com/macros/s/AKfycbwj7l1K2RcGtPUu4wdRFjI7NLayzAtqjx0_XorzQmMNEqh-JyuEaOrUlOEN1BT9HVSC/exec`). → FAIL.
- [ ] **Schritt 2: Seite schreiben** (eine Datei, kein Framework, Bauweise wie die vorhandene Handy-Seite: `fetch` mit `text/plain`, Antwort `OK\n…` oder `FEHLER\n…`): Code aus `?sig=` lesen und mit `aktion: "pruefen"` prüfen (`'1'` sonst Hinweis „Bitte im Programm erneut auf Unterschrift hinterlegen klicken“); Knopf „Unterschrift fotografieren“; Foto verkleinern (Breite 900 px, JPEG-Qualität 0,7, bis Base64 höchstens 90000 Zeichen, sonst Breite um 15 % und Qualität um 0,1 senken, Mindestbreite 300); Vorschau; „Senden“; Erfolg „Fertig – du kannst die Seite schließen.“; Fehler sichtbar.
- [ ] **Schritt 3: `docs/server-einspielen.md`** (Schritt für Schritt für Benjamin): (a) `server/Montageberichte.js` ohne die letzte Zeile als Datei ins Apps-Script-Projekt „PDF Unterschreiben Anmeldung“ kopieren (vorhandene ersetzen); (b) in `Code.gs` die Zeile mit `/^mb_(monteure|liste|datei)$/` ersetzen durch `/^mb_(monteure|liste|datei|vermerke|korrektur|klaerung|abzeichnen|unterschrift_datei|unterschrift_code|unterschrift_abholen)$/`; (c) in `Code.gs` `/^h_(check|foto|ts|vk|vorschau|vorschaubild)$/` ersetzen durch `/^h_(check|foto|ts|vk|vorschau|vorschaubild|sig)$/`; (d) in `handyAnfrage` vor `throw new Error('Unbekannte Anfrage.')` einfügen `if (d.event === 'h_sig') return mbHandySig(d);`; (e) Bereitstellung bearbeiten und neue Version veröffentlichen; (f) GitHub Pages für dieses Repository einschalten (Quelle: Branch `main`, Ordner `/docs`). Jeweils mit Hinweis, woran man sieht, dass es klappt.
- [ ] **Schritt 4:** `node --test "test/*.test.js"` → PASS. **Schritt 5: Commit** `feat: Handy-Seite für die Unterschrift und Anleitung zum Einspielen`

### Task 5: Unterschrift-Foto freistellen

**Files:** Create `web/signatur.js`, `test/signatur.test.js`

**Interfaces:** Produces `freistellen(pixel: Uint8ClampedArray /*RGBA*/, breite: number, hoehe: number) -> {pixel, breite, hoehe} | null` (global im Browser, `module.exports` in Node). Rand 6 Pixel. `null`, wenn weniger als 30 Strichpixel (Alpha über 128) gefunden werden.

- [ ] **Schritt 1: Tests** (selbst gebaute Bilder): (a) 120×80, Papier 230, Strich 40 Pixel breit und 4 Zeilen hoch (Helligkeit 40) → Ergebnis 52×16, Alpha der Ecke 0, Alpha im Strich ≥ 200, RGB des Strichs unverändert 40; (b) Papier mit Schatten (Helligkeit links 150, rechts 230, Strich 30) → nicht `null`, beide Ecken Alpha 0; (c) ganz weißes Blatt → `null`; (d) 10 dunkle Pixel → `null`; (e) 30×20-Foto mit 40 Strichpixeln → nicht `null`.
- [ ] **Schritt 2:** `node --test test/signatur.test.js` → FAIL.
- [ ] **Schritt 3: Implementieren.** Helligkeit `0.299R+0.587G+0.114B`; Papierhelligkeit je Block 32×32 als 90.-Perzentil; `alpha = clamp((0.8*papier − hell)/(0.35*papier), 0, 1)*255`; zuschneiden auf alles mit Alpha über 40, plus Rand.
- [ ] **Schritt 4:** PASS. **Schritt 5: Commit** `feat: Unterschrift aus Foto freistellen`

### Task 6: Prüfseite in die PDF einbauen

**Files:** Create `web/pruefseite.js`, `test/pruefseite.test.js`

**Interfaces:** Produces (global/`module.exports`): `pruefseiteAnhaengen(ziel /*PDFDocument*/, PDFLib, daten) -> Promise<number>` (Anzahl neuer Seiten; 0 und nichts angehängt, wenn `korrekturen` leer, `klaerung` und `abzeichnung` `null`); `daten = {auftrag, monteur, kw /*„KW 46 / 2026“*/, korrekturen, klaerung, abzeichnung, unterschrift /*Uint8Array PNG oder null*/}`; `winAnsiSauber(text, schrift) -> string`; `umbrechen(text, schrift, groesse, breite) -> string[]` (bricht auch zu lange Wörter); `statusChips(stand) -> [{text, klasse}]`; `serverHinweis(antwort) -> string`.

- [ ] **Schritt 1: Tests** (pdf-lib per `require('pdf-lib')`, Test wird übersprungen, wenn es fehlt):
  - Ohne Vermerke: Rückgabe 0, Seitenzahl unverändert.
  - Eine Korrektur: Rückgabe 1; gespeichertes PDF lädt wieder mit Seitenzahl +1.
  - 60 Korrekturen: Rückgabe größer als 1.
  - Text `'😀 → Ä ö ß'` plus 300 mal `x` plus Zeilenumbruch und `'Zeile'` in `vorher`, `nachher` und Rückfrage: kein Fehler, PDF lädt wieder.
  - Abzeichnung mit einem 2×2-PNG (im Test per `zlib` erzeugt): kein Fehler, PDF lädt wieder.
  - `winAnsiSauber('Ä😀→ö', helvetica) === 'Ä??ö'`; alle Zeilen aus `umbrechen('a'.repeat(300), helvetica, 10, 200)` sind höchstens 200 breit.
  - `statusChips`: 2 Korrekturen und offene Rückfrage → `[{text:'korrigiert (2)', klasse:'warn'}, {text:'Rückfrage offen', klasse:'bad'}]`; Abzeichnung → enthält `{text:'✓ abgezeichnet', klasse:'ok'}`; leerer Stand → `[]`.
  - `serverHinweis({ok:false, error:'Unbekannte Anfrage.'})` enthält `noch nicht aktualisiert`; `{ok:false, error:'X'}` gibt `'X'`; `{ok:true}` gibt `''`.
- [ ] **Schritt 2:** `NODE_PATH=/opt/npm-tools/node_modules node --test test/pruefseite.test.js` → FAIL.
- [ ] **Schritt 3: Implementieren.** A4, Rand 50, Überschrift „Korrekturen und Prüfung“ (16 pt), darunter Auftrag, Monteur, Kalenderwoche; je Korrektur Datum (Europe/Berlin, `TT.MM.JJJJ HH:MM`), Name, Bereich, „Im Bericht: …“, „Richtig ist: …“; Rückfrage („Rückfrage offen: …“ oder „Rückfrage geklärt“ mit Name und Datum); Abzeichnung „Kontrolliert und abgezeichnet von NAME am DATUM“ mit Unterschrift (höchstens 160×60). Neue Seite, wenn der Platz fehlt.
- [ ] **Schritt 4:** PASS. **Schritt 5: Commit** `feat: Prüfseite für die PDF`

### Task 7: Go – Anfragen des Büro-Programms weiterreichen

**Files:** Modify `berichte.go` (`handleMb`); Create `berichte_test.go`

**Interfaces:** `handleMb` erlaubt zusätzlich `mb_vermerke`, `mb_korrektur`, `mb_klaerung`, `mb_abzeichnen`, `mb_unterschrift_datei`, `mb_unterschrift_code`, `mb_unterschrift_abholen` und reicht diese Felder an den Server weiter: `auftrag`, `aktion`, `bereich`, `vorher`, `nachher`, `text`, `unterschrift`, `token`, `id`. Der Body darf bis `1<<20` Bytes groß sein (bisher `1<<16`).

- [ ] **Schritt 1: Tests** (`httptest`-Server als Anmeldeserver; `ReportURL`, `ReportKey`, `serverPrefix` setzen und am Ende zurücksetzen; `t.Setenv("APPDATA", t.TempDir())` und `einstellungen.json` mit `{"user":{"id":"ID1","name":"Berta","email":"b@x"}}`): (a) `mb_korrektur` mit Auftrag `4711`, Bereich `Arbeitszeit`, vorher `1,5 h`, nachher `2,0 h` kommt mit `app:"montageberichte"`, `id:"ID1"` und genau diesen Feldern an; (b) `mb_abzeichnen` mit `unterschrift` aus 100000 Zeichen kommt vollständig an; (c) `mb_loeschen` gibt `{"ok":false,"error":"Unbekannte Anfrage."}` und der Server wird nicht aufgerufen.
- [ ] **Schritt 2:** `go test ./... -run HandleMb` → FAIL. **Schritt 3:** `handleMb` erweitern (Ereignisliste und Felder, Grenze auf `1<<20`). **Schritt 4:** `go test ./... && go vet ./...` → PASS. **Schritt 5: Commit** `feat: neue Anfragen des Büro-Programms an den Server weiterreichen`

### Task 8: Go – Unterschrift lokal speichern

**Files:** Create `unterschrift.go`, `unterschrift_test.go`; Modify `app.go` (Zeile in `routes()` nach `/api/mb`)

**Interfaces:** `func (a *app) handleUnterschrift(w http.ResponseWriter, r *http.Request)` unter `/api/unterschrift`: GET gibt `{"ok":true,"vorhanden":bool,"b64":string}`; PUT mit `{"b64"}` schreibt `filepath.Join(dataDir(), "unterschrift.png")` atomar (Fehler `Keine gültige PNG-Datei.` ohne PNG-Anfang `89 50 4E 47`, `Unterschrift zu groß.` über 150 KB); DELETE löscht.

- [ ] **Schritt 1: Tests** (`APPDATA` auf Temp): GET ohne Datei `vorhanden:false`; PUT eines kleinen PNG → `ok:true`, GET gibt dasselbe `b64`; PUT `AAAA` → `Keine gültige PNG-Datei.`; PUT mit 200 KB und PNG-Anfang → `Unterschrift zu groß.`; DELETE → danach `vorhanden:false`. → FAIL.
- [ ] **Schritt 2: Implementieren, Route eintragen.** **Schritt 3:** `go test ./... && go vet ./... && go build -o /tmp/mb .` → PASS. **Schritt 4: Commit** `feat: Unterschrift lokal speichern`

### Task 9: Oberfläche – Stand laden, Status zeigen, Prüfseite beim Erstellen

**Files:** Modify `web/index.html`

**Interfaces:** Consumes `statusChips`, `serverHinweis`, `pruefseiteAnhaengen` (Task 6). Produces in der Oberfläche: `mb.vermerke` (Auftrag → Stand), `standVon(g)`, `merkWert(g) = g.ids + "|" + standVon(g).schluessel`, `unterschriftFuer(stand) -> Promise<Uint8Array|null>`.

- [ ] **Schritt 1:** `<script src="/signatur.js"></script>` und `<script src="/pruefseite.js"></script>` vor das Hauptskript setzen.
- [ ] **Schritt 2:** In `kwOeffnen` nach `mb_liste` den Stand mit `mbCall("mb_vermerke", {monteur: m.email, jahr: k.jahr, kw: k.kw})` laden. Bei `!r.ok` Hinweis `serverHinweis(r)` im `#kwInfo` anzeigen und ohne Vermerke weitermachen.
- [ ] **Schritt 3:** `abgelegt`, `erstellen` und `kwNeu` nutzen `merkWert(g)` statt `g.ids`. In `erstellen` vor `ziel.save()` die Prüfseite mit `pruefseiteAnhaengen(ziel, PDFLib, {...})` anhängen; die Unterschrift über `mb_unterschrift_datei` holen und je ID zwischenspeichern.
- [ ] **Schritt 4:** In `renderWoche` hinter dem Status die Chips aus `statusChips(standVon(g))` zeigen.
- [ ] **Schritt 5: Prüfen:** `node -e "const s=require('fs').readFileSync('web/index.html','utf8');[...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(x=>new Function(x[1]))"` → keine Ausgabe; `go build -o /tmp/mb .` → ohne Fehler.
- [ ] **Schritt 6: Commit** `feat: Vermerke in der Liste zeigen und Prüfseite in die PDF`

### Task 10: Oberfläche – Prüfen-Fenster

**Files:** Modify `web/index.html`

**Interfaces:** Produces `pruefenOeffnen(g)`, `vermerkSenden(ereignis, extra) -> Promise<boolean>`. Consumes `unterschriftHinterlegen()` aus Task 11 (`Promise<boolean>`).

- [ ] **Schritt 1:** Neben „📄 Öffnen“ den Knopf „✎ Prüfen“; `<dialog id="pruefDlg">` im Stil der vorhandenen Fenster (`dlg`, `dlg-head`, `dlg-body`) mit drei Teilen: Korrekturen (Liste mit Datum, Name, Bereich, „Im Bericht“, „Richtig ist“; Formular mit Auswahl der vier Bereiche, zwei Textfeldern und „Korrektur eintragen“), Rückfrage (Textfeld, „Rückfrage setzen“; bei offener Rückfrage Text mit Name und Datum und „Als geklärt markieren“), Abzeichnen („Kontrolliert – abzeichnen“, zeigt bestehende Abzeichnung mit Name und Datum).
- [ ] **Schritt 2:** `vermerkSenden` ruft `mbCall` mit `monteur`, `jahr`, `kw`, `auftrag: g.datei` und den Feldern; bei Erfolg `mb.vermerke[g.datei] = r.stand`, Liste und Fenster neu zeichnen, `erstellen()` aufrufen (der geänderte `schluessel` erzwingt die neue PDF); bei Fehler `serverHinweis(r)` im Fenster zeigen. Knöpfe sind während der Anfrage gesperrt.
- [ ] **Schritt 3:** Abzeichnen holt `/api/unterschrift`; fehlt sie, zuerst `unterschriftHinterlegen()`; bricht der Nutzer ab, wird nichts gesendet. Dann `mb_abzeichnen` mit `unterschrift` (Base64).
- [ ] **Schritt 4: Prüfen:** Syntaxprüfung wie in Task 9, `go build -o /tmp/mb .`. **Schritt 5: Commit** `feat: Prüfen-Fenster für Korrekturen, Rückfrage und Abzeichnung`

### Task 11: Oberfläche – Unterschrift hinterlegen (QR, Foto, Zeichnen)

**Files:** Modify `web/index.html`

**Interfaces:** Produces `unterschriftHinterlegen() -> Promise<boolean>` (`true`, wenn `/api/unterschrift` gespeichert wurde). Consumes `freistellen` (Task 5), `mb_unterschrift_code`, `mb_unterschrift_abholen`.

- [ ] **Schritt 1:** `<dialog id="sigDlg">`: Überschrift „Unterschrift hinterlegen“, QR-Code als `<img src="data:image/bmp;base64,…">`, Text „Unterschrift auf ein weißes Blatt schreiben, QR-Code mit dem Handy scannen und das Blatt fotografieren.“, darunter „Stattdessen hier zeichnen“.
- [ ] **Schritt 2:** Beim Öffnen `mb_unterschrift_code` holen; alle 3 Sekunden `mb_unterschrift_abholen`, höchstens 10 Minuten; beim Schließen sofort aufhören. Kommt ein Foto: mit `createImageBitmap` in ein Canvas, `freistellen`; bei `null` Meldung „Keine Unterschrift erkannt – bitte noch einmal fotografieren“ und neuer Code; sonst auf höchstens 600 px Breite verkleinern und als Vorschau auf Schachbrett-Hintergrund zeigen, mit „Übernehmen“ und „Neues Foto“.
- [ ] **Schritt 3:** „Stattdessen hier zeichnen“: Zeichenfläche mit Zeigerereignissen (Maus, Stift), schwarze Linie, „Löschen“, „Übernehmen“ speichert transparentes PNG. „Übernehmen“ sendet `PUT /api/unterschrift`; bei Fehler Meldung anzeigen und Fenster offen lassen.
- [ ] **Schritt 4: Prüfen:** Syntaxprüfung, `go build -o /tmp/mb .`. **Schritt 5: Commit** `feat: Unterschrift per QR-Code und Handy-Foto hinterlegen`

### Task 12: Version, README und Abschluss

**Files:** Modify `TESTVERSION` (`1.1.0`), `README.md`

- [ ] **Schritt 1:** `README.md` um Abschnitte „Korrekturen und Abzeichnen“ und „Unterschrift per Handy“ ergänzen (kurz, Verweis auf `docs/server-einspielen.md`; Satz zum Server-Teil anpassen).
- [ ] **Schritt 2:** `echo 1.1.0 > TESTVERSION`; `VERSION` bleibt `1.0.1`.
- [ ] **Schritt 3: Gesamtprüfung:** `NODE_PATH=/opt/npm-tools/node_modules node --test "test/*.test.js"` , `go test ./...`, `go vet ./...`, `go build -o /tmp/mb .` → alles ohne Fehler; `git diff --stat main..HEAD` zeigt nur Dateien aus diesem Plan, `VERSION` unverändert.
- [ ] **Schritt 4 (nur wenn ein Browser verfügbar ist):** Oberfläche mit einer Nachbildung des Anmeldeservers ausprobieren (`MB_DEV=1 MB_TEST_SERVER=… go run .`); Anmeldeablauf vorher in `checkAccess` und `refreshBlock` nachlesen. Sonst im Bericht klar sagen, dass die Oberfläche nicht ausprobiert wurde.
- [ ] **Schritt 5: Commit** `chore: Testversion 1.1.0 und README`, dann `git push` des Zweigs. **Nicht** nach `main` mergen; der Release-Workflow läuft nur auf `main`.
- [ ] **Schritt 6: Bericht an Benjamin:** was getestet wurde (Befehle mit Ergebnis), was nicht (Windows-Fenster, Handy, QR, echter Server) und die Liste seiner einmaligen Schritte aus `docs/server-einspielen.md`.
