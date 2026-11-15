# Korrekturen, Rückfragen und Abzeichnen von Berichten – Design

Stand: 2026-11-15 · Programm: Kundendienst Montageberichte (nur dieses Repository)

## Worum es geht und warum
Im Büro sollen die Berichte der Monteure geprüft werden können. Fehlerhafte Angaben sollen korrigiert werden
können, jede Korrektur mit dem Namen der Person, die sie gemacht hat. Wenn etwas unklar ist, soll das
sichtbar als offene Rückfrage markiert werden. Ist der Bericht kontrolliert, wird er mit Unterschrift
abgezeichnet.

Korrigiert wird in diesen Fällen (so von Benjamin genannt):
- **Text** ist fehlerhaft
- **Ersatzteile** stimmen nicht
- **Arbeitszeit** stimmt nicht
- **Klärungsbedarf**: es ist etwas unklar und muss nachgefragt werden

## Ziele
1. Pro Auftrag (eine zusammengefügte PDF) lassen sich Korrekturen eintragen: Bereich, was im Bericht steht,
   was richtig ist. Name und Zeitpunkt kommen automatisch dazu.
2. Pro Auftrag lässt sich eine **Rückfrage** setzen (Text) und später als geklärt markieren.
3. Pro Auftrag lässt sich der Bericht **abzeichnen**: „Kontrolliert“ mit Unterschrift, Name und Datum.
4. Alles davon steht auf der **Prüfseite**, die hinten an die PDF angehängt wird.
5. Die Vermerke liegen auf dem Server und sind auf jedem Büro-PC gleich. „↻ Neu erstellen“ verliert nichts.
6. In der Liste der Aufträge sieht man auf einen Blick: korrigiert, Rückfrage offen, abgezeichnet.

## Nicht-Ziele
- Die Seiten des Monteurs werden **nicht verändert**. Das Original bleibt unverändert in der PDF.
- Kein direktes Schreiben in den Bericht, keine Anzeige des Berichts im Programm (Weg B, verworfen).
- Keine Mail an den Monteur und keine Antwort des Monteurs im Programm.
- Keine Änderung an der Service-Mappe (anderes Repository). Berichte kommen weiter nur als PDF an.
- Keine Bearbeitung einzelner Felder wie Ersatzteil-Positionen als Daten, weil sie nicht als Daten ankommen.

## Anti-Ziele (wäre ein Fehlschlag, auch wenn es technisch läuft)
- Eine Korrektur ohne Namen oder ohne Zeitpunkt.
- Vermerke, die beim Neu-Erstellen, am anderen PC oder nach einem Update verschwinden.
- Eine Unterschrift, die auf dem Server oder bei anderen Nutzern liegt.
- Ein Bericht, der abgezeichnet aussieht, obwohl danach noch etwas korrigiert wurde.

## Constraints
- Berichte liegen nur als fertige PDFs vor. Der Server kennt je Bericht: Monteur, E-Mail, Datum, Jahr, KW,
  Auftragsnummer, Art, Seriennummer, Dateiname.
- PDFs werden im Programm mit pdf-lib zusammengefügt (steht schon im Programm und wird beim ersten Start geladen).
- Wer das Programm benutzen darf, regelt `mbNutzer` auf dem Server (Blatt „Nutzer Montageberichte“, „Berechtigt (ja)“).
  Das gilt auch für die neuen Funktionen.
- `server/Montageberichte.js` muss von Hand ins Apps-Script-Projekt kopiert werden (ohne die letzte `module.exports`-Zeile).
- Mehrere Kollegen arbeiten auf demselben Remote-Server, jeder mit eigenem Windows-Benutzer.

## Ansätze
- **A. Prüfseite hinten anhängen (gewählt).** Original bleibt, eine Seite „Korrekturen und Prüfung“ kommt dazu.
  Vermerke liegen auf dem Server. Passt zu dem, was das Programm schon tut (PDFs zusammenfügen).
- **B. Auf die Seite des Berichts schreiben (verworfen).** Bräuchte eine Anzeige des Berichts und Anklicken der
  Stelle, ist bei unterschiedlichen Berichten fehleranfällig und viel Aufwand.
- **C. Nur lokal in der PDF (verworfen).** Vermerke gingen beim Neu-Erstellen oder am zweiten PC verloren.
- Rückfrage: nur Markierung mit Text (gewählt). Mail an den Monteur und Antwort im Programm sind spätere Schritte.
- Unterschrift: einmal im Programm hinterlegen, beim Abzeichnen einfügen (so von Benjamin bestätigt).

## Die Entscheidungen im Einzelnen

### Oberfläche
- In der Liste der Aufträge kommt neben „📄 Öffnen“ eine Schaltfläche **„✎ Prüfen“**.
- In der Statusspalte kommen kleine Hinweise dazu: „korrigiert (n)“, „Rückfrage offen“, „✓ abgezeichnet“.
- „✎ Prüfen“ öffnet ein Fenster zum Auftrag mit drei Teilen:
  1. **Korrekturen:** Liste der bisherigen (Datum, Name, Bereich, vorher → nachher). Darunter ein Formular:
     Bereich (Text / Ersatzteile / Arbeitszeit / Sonstiges), „Steht im Bericht“, „Richtig ist“, Knopf „Korrektur eintragen“.
  2. **Rückfrage:** Textfeld und Knopf „Rückfrage setzen“. Ist eine offen, steht sie da mit Name und Datum und
     einem Knopf „Als geklärt markieren“.
  3. **Abzeichnen:** Knopf „Kontrolliert – abzeichnen“. Gibt es noch keine Unterschrift, öffnet sich zuerst ein
     Feld zum Unterschreiben mit Maus oder Stift.
- Die Unterschrift lässt sich im Fenster später ändern.

### Prüfseite in der PDF
- Wird nur angehängt, wenn es zum Auftrag mindestens einen Vermerk gibt. Sonst bleibt die PDF wie heute.
- Inhalt: Überschrift „Korrekturen und Prüfung“, Auftrag, Monteur, Kalenderwoche. Dann die Korrekturen als Liste,
  die offene Rückfrage (oder „Rückfrage geklärt“) und die Abzeichnung mit Unterschrift, Name und Datum.
- Bei sehr vielen Korrekturen darf die Prüfseite über mehrere Seiten gehen.
- Schrift: Standardschrift von pdf-lib (Helvetica), reicht für deutsche Umlaute und ß.

### Neu-Erstellen und „abgelegt“
- Der Merker, ob eine PDF aktuell ist (`merkKey`/`ids` in `web/index.html`), berücksichtigt künftig auch den
  Stand der Vermerke. Nach jeder Korrektur, Rückfrage oder Abzeichnung wird die PDF des Auftrags neu erstellt
  und überschrieben.

### Abzeichnung und spätere Korrekturen
- **Meine Entscheidung:** Wird nach dem Abzeichnen noch korrigiert oder eine Rückfrage gesetzt, gilt die
  Abzeichnung nicht mehr. Der Auftrag muss neu abgezeichnet werden. Die alte Abzeichnung bleibt im Verlauf auf dem Server.
- **Meine Entscheidung:** Jeder berechtigte Nutzer darf korrigieren, Rückfragen setzen und abzeichnen.
  Der Name kommt vom Server aus dem Blatt „Nutzer Montageberichte“, nicht aus der Eingabe im Programm.

### Server (`server/Montageberichte.js`)
- Neues Blatt **„Korrekturen Montageberichte“**, nur anhängen, nie überschreiben, damit der Verlauf vollständig bleibt.
  Spalten: Zeitpunkt, Ereignis, Monteur-E-Mail, Jahr, KW, Auftrag, Bereich, Vorher, Nachher, Text, Name, E-Mail.
- Ereignisse: `korrektur`, `klaerung_setzen`, `klaerung_erledigt`, `abzeichnung`.
- Neue Anfragen im Büro-Programm (alle über `montageberichteAnfrage` und `mbNutzer`):
  `mb_vermerke` (alle Vermerke einer Kalenderwoche), `mb_korrektur`, `mb_klaerung`, `mb_abzeichnen`.
- Der aktuelle Stand eines Auftrags wird aus dem Verlauf berechnet: Liste der Korrekturen, Rückfrage offen oder nicht,
  abgezeichnet nur wenn die letzte Abzeichnung nach dem letzten Korrektur- oder Rückfrage-Ereignis liegt.
  Diese Berechnung ist eine eigene Funktion, damit man sie ohne Google testen kann.
- Ein Auftrag wird über Monteur-E-Mail, Jahr, KW und Auftrag (derselbe Wert wie `g.datei` im Programm) erkannt.
- Eingaben werden gekürzt (Länge) und auf unzulässige Zeichen geprüft, wie es `clean` schon macht.
- `MB_FREI` bleibt unverändert und betrifft nur das Annehmen von Berichten.

### Programm (Go)
- Neue Schnittstelle `/api/unterschrift`: Unterschrift als PNG lesen und speichern, in `dataDir()` je Windows-Benutzer
  (`unterschrift.png`). Sie wird nie an den Server geschickt.
- Die neuen Server-Anfragen laufen über `handleMb`: Dort kommen die vier neuen Ereignisse in die Liste der
  erlaubten Anfragen und die Felder (Bereich, Vorher, Nachher, Text, Auftrag) in die Anfrage.
- Ist der Server noch nicht aktualisiert, antwortet er „Unbekannte Anfrage“. Das Programm zeigt dann einen klaren
  Hinweis („Server noch nicht aktualisiert“) statt eines Fehlers.

### Version
- Herausgabe nur als Testversion (`TESTVERSION` höher, z. B. 1.1.0). `VERSION` bleibt unverändert, bis Benjamin es sagt.

## Was bewusst offen bleibt
- Genaue Gestaltung (Abstände, Farben, Größe der Prüfseite) entscheidet der Baumeister im Stil des bestehenden Programms.
- Texte der Schaltflächen und Hinweise: wie oben vorgeschlagen, kleine Änderungen sind in Ordnung.

## Was sich hier nicht prüfen lässt (ehrlich vorab)
- Die Windows-Oberfläche und das Zeichnen der Unterschrift lassen sich in dieser Umgebung nicht ausprobieren.
- Prüfbar sind: die Berechnung des Stands aus dem Verlauf (Test mit Node), die Go-Teile (Bauen, `go vet`) und,
  soweit pdf-lib verfügbar ist, das Erzeugen der Prüfseite.
- Das Einspielen von `server/Montageberichte.js` ins Apps-Script-Projekt muss Benjamin selbst machen.
