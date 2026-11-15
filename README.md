# Kundendienst Montageberichte

Büro-Programm (Windows): zeigt die unterschriebenen Berichte der Monteure aus der Service-Mappe –
je Monteur und Kalenderwoche – und fügt sie je Auftragsnummer zu einer PDF zusammen:
erst Montagebericht, dann UVV-Bericht, dann DGUV-V3-Bericht.

Ablage: `Dokumente\Kundendienst Montageberichte\<Monteur>\<Jahr> KW <nn>\<Auftragsnummer>.pdf`

## Wie die Berichte ankommen
Die Service-Mappe (ab 1.20.51) schickt jeden unterschriebenen Bericht beim Speichern, Drucken oder
Mailen mit `mb_hoch` an den Anmeldeserver. Der legt die PDF in Google Drive unter
„Kundendienst Montageberichte/<Monteur>“ ab und schreibt eine Zeile ins Blatt „Montageberichte“.
Die Kalenderwoche richtet sich nach dem Datum im Bericht (ISO-Woche).

## Wer darf das Programm benutzen?
Anmeldung wie bei den anderen Programmen. Zusätzlich muss im Blatt „Nutzer Montageberichte“ in der
Spalte „Berechtigt (ja)“ ein `ja` stehen (Admins dürfen immer).

## Korrekturen und Abzeichnen
Zu jedem Auftrag gibt es „✎ Prüfen“: Fehler in Text, Ersatzteilen oder Arbeitszeit werden als Korrektur
eingetragen (Name und Zeit werden mitgespeichert), Unklarheiten als Rückfrage markiert und später als
geklärt. Mit „Kontrolliert – abzeichnen“ wird der Auftrag mit Unterschrift abgezeichnet. Jede spätere
Korrektur oder neue Rückfrage hebt die Abzeichnung auf. Die Berichte der Monteure bleiben unverändert;
die zusammengefügte PDF bekommt hinten eine Seite „Korrekturen und Prüfung“. Die Vermerke liegen auf dem
Server im Blatt „Korrekturen Montageberichte“.

## Unterschrift per Handy
Beim ersten Abzeichnen zeigt das Programm einen QR-Code. Unterschrift auf ein weißes Blatt schreiben, Code
mit dem Handy scannen, Blatt fotografieren – das Programm macht das Papier durchsichtig und speichert die
Unterschrift (`%APPDATA%\Kundendienst Montageberichte\unterschrift.png`). Alternativ lässt sich mit der Maus
zeichnen. Beim Abzeichnen geht die Unterschrift auch auf den Server, damit jede PDF an jedem PC gleich aussieht.
Die Handy-Seite liegt in `docs/handy/` (GitHub Pages).

## Server
`server/Montageberichte.js` gehört ins Apps-Script-Projekt (ohne die letzte `module.exports`-Zeile),
das Routing steht im Service-Mappe-Repository in `admin/Code.gs` (`mb_hoch`, `app: 'montageberichte'`).
Für Korrekturen und Unterschrift sind einmalig Handarbeit-Schritte nötig: siehe `docs/server-einspielen.md`.

## Versionen
`TESTVERSION` höher als `VERSION` → Testversion im Vorab-Release `montageberichte-adminkanal`.
`VERSION` neu → `montageberichte-vX.Y.Z` und `montageberichte-stabil`.
