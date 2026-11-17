# Kundendienst Montageberichte – Regeln für dieses Repository

Go-Windows-Programm mit Web-Oberfläche (`web/`). Releases über GitHub Actions (`.github/workflows/release.yml`).

## Nur dieses Repository ändern
- Die Berichte schickt die **Service-Mappe** (anderes Repository, „PDF Unterschreiben & Dokumentation“).
  Dort **nichts ändern** – auch nicht, wenn eine Änderung hier etwas auf der Service-Mappe-Seite bräuchte.
  Dann nur beschreiben, was dort nötig wäre.

## Versionen und Releases
- `TESTVERSION` höher als `VERSION` → Testversion ins Vorab-Release `montageberichte-adminkanal` (nur Admins).
- `VERSION` neu → fertige Version für alle (`montageberichte-vX.Y.Z` und `montageberichte-stabil`).
- Neue Stände standardmäßig nur über `TESTVERSION` als Testversion herausgeben.
  `VERSION` nur ändern, wenn der Nutzer das ausdrücklich sagt.

## Server-Teil
- `server/Montageberichte.js` läuft im Apps-Script-Projekt „PDF Unterschreiben Anmeldung“ (Konto pdfunterschreiben@gmail.com).
- Ein Push bringt Server-Änderungen **nicht** auf den Server: Die Datei muss von Hand ins Apps-Script-Projekt
  kopiert werden (ohne die letzte `module.exports`-Zeile). Bei jeder Änderung daran darauf hinweisen.
- Der Server nimmt Berichte vorerst nur von Admins an: `MB_FREI` ist leer.
  Freigabe später per einzelner E-Mail-Adresse in `MB_FREI` oder `'*'` für alle – nur auf ausdrücklichen Wunsch.

## Verschlüsselte Berichte
- Die Service-Mappe (ab 1.20.58) verschlüsselt jeden Bericht mit dem öffentlichen Schlüssel des Büros („SMB1“-Format,
  siehe `schluessel.go`). Der geheime Schlüssel liegt mit dem Schlüssel-Passwort verschlüsselt auf dem Server
  (Script Properties `mb_pub`, `mb_priv`, `mb_fp`) und lokal in `%APPDATA%\Kundendienst Montageberichte\montageberichte-schluessel.pem`.
- `mb_datei` wird in `handleMb` entschlüsselt; die Oberfläche bekommt die PDF wie bisher. Unverschlüsselte Berichte gehen unverändert durch.
- Format nicht ändern, ohne die Service-Mappe (`mbkrypto.go` dort) mitzuziehen.

