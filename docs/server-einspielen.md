# Server einspielen (einmalig, von Hand)

Die neuen Funktionen (Korrekturen, Rückfragen, Abzeichnen, Unterschrift per Handy) brauchen Änderungen im
Apps-Script-Projekt „PDF Unterschreiben Anmeldung“ (Konto pdfunterschreiben@gmail.com). Ein Push nach GitHub
bringt sie **nicht** dorthin. Die Reihenfolge ist wichtig.

## 1. Server-Datei ersetzen
Im Projekt die vorhandene Datei mit den Montageberichten öffnen (dieselbe, in die schon `server/Montageberichte.js`
kopiert wurde) und den Inhalt durch den neuen von `server/Montageberichte.js` ersetzen – **ohne** die letzte Zeile
(`if (typeof module !== 'undefined') module.exports = …`). Die Datei `QrCode` muss im Projekt vorhanden sein
(ist sie schon, sie gehört zur Service-Mappe).

## 2. Drei kleine Änderungen in `Code.gs`
Das Routing steht in `Code.gs` im Projekt (die Kopie im Repository der Service-Mappe wird hier nicht angefasst;
wer will, zieht sie später selbst nach).

**a) Büro-Programm-Anfragen durchlassen.** In `doPost` die Zeile
```
/^mb_(monteure|liste|datei)$/
```
ersetzen durch
```
/^mb_(monteure|liste|datei|vermerke|korrektur|klaerung|abzeichnen|unterschrift_datei|unterschrift_code|unterschrift_abholen|uebersicht)$/
```

**b) Anfragen der Handy-Seite durchlassen.** In `doPost` die Zeile
```
/^h_(check|foto|ts|vk|vorschau|vorschaubild)$/
```
ersetzen durch
```
/^h_(check|foto|ts|vk|vorschau|vorschaubild|sig)$/
```

**c) Handy-Foto verarbeiten.** In der Funktion `handyAnfrage` direkt vor der letzten Zeile
`throw new Error('Unbekannte Anfrage.');` einfügen:
```
if (d.event === 'h_sig') return mbHandySig(d);
```

## 3. Neue Version veröffentlichen
Bereitstellen → Bereitstellungen verwalten → die bestehende Bereitstellung bearbeiten → Version „Neue Version“ → Bereitstellen.
Die Web-App-Adresse bleibt dabei gleich. (Bei einer **neuen** Bereitstellung ändert sich die Adresse – das nicht tun.)

## 4. GitHub Pages einschalten
Im Repository `kundendienst-montageberichte` → Settings → Pages → „Deploy from a branch“ → Branch `main`, Ordner `/docs`.
Die Handy-Seite liegt danach unter
`https://pdfunterschreiben-admin.github.io/kundendienst-montageberichte/handy/`.
Solange die Änderungen noch nicht in `main` sind, zum Testen den Branch `korrekturen-abzeichnung` wählen.

## Woran man sieht, dass es klappt
- Schritt 4: Die Adresse oben zeigt „Dieser QR-Code ist nicht mehr gültig.“ (kein „404“).
- Schritte 1–3: Im Programm zeigt „✎ Prüfen“ keinen Hinweis „Der Server ist noch nicht aktualisiert“.
- Unterschrift: Im Programm „Unterschrift hinterlegen“ wählen, QR-Code mit dem Handy scannen, Foto aufnehmen – die
  Vorschau erscheint am PC.
