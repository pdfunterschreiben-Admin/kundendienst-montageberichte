// Prüfseite („Korrekturen und Prüfung“) hinten an die PDF eines Auftrags anhängen, dazu kleine Helfer für die Oberfläche.
// Im Browser als globale Funktionen, in Node (Tests) über module.exports. pdf-lib wird als Parameter übergeben.

// Zeichen, die die Standardschrift (WinAnsi) nicht darstellen kann, durch „?“ ersetzen; Zeilenumbrüche bleiben
function winAnsiSauber(text, schrift) {
  const erlaubt = new Set(schrift.getCharacterSet());
  let aus = '';
  for (const ch of String(text == null ? '' : text).replace(/\r\n?/g, '\n').replace(/\t/g, ' ')) {
    aus += (ch === '\n' || erlaubt.has(ch.codePointAt(0))) ? ch : '?';
  }
  return aus;
}

// Text in Zeilen der Höchstbreite zerlegen; Wörter, die allein zu lang sind, werden mitten im Wort gebrochen
function umbrechen(text, schrift, groesse, breite) {
  const passt = function (s) { return schrift.widthOfTextAtSize(s, groesse) <= breite; };
  const zeilen = [];
  String(text).split('\n').forEach(function (absatz) {
    let aktuell = '';
    absatz.split(' ').forEach(function (wort) {
      const probe = aktuell ? aktuell + ' ' + wort : wort;
      if (passt(probe)) { aktuell = probe; return; }
      if (aktuell) { zeilen.push(aktuell); aktuell = ''; }
      let rest = wort;
      while (rest && !passt(rest)) {
        let n = rest.length;
        while (n > 1 && !passt(rest.slice(0, n))) n--;
        zeilen.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      aktuell = rest;
    });
    zeilen.push(aktuell);
  });
  return zeilen;
}

function datumDe(t) {
  return new Date(t).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');
}

function rueckfrageZeile(q) { return (q.offen ? 'gestellt von ' : 'geklärt von ') + q.name + ' am ' + datumDe(q.t); }
function abzeichnungZeile(a) { return 'Kontrolliert und abgezeichnet von ' + a.name + ' am ' + datumDe(a.t); }

// Gibt die Anzahl der angehängten Seiten zurück (0, wenn es nichts zu zeigen gibt)
async function pruefseiteAnhaengen(ziel, PDFLib, daten) {
  const korrekturen = daten.korrekturen || [];
  if (!korrekturen.length && !daten.klaerung && !daten.abzeichnung) return 0;
  const schrift = await ziel.embedFont(PDFLib.StandardFonts.Helvetica);
  const fett = await ziel.embedFont(PDFLib.StandardFonts.HelveticaBold);
  const B = 595.28, H = 841.89, R = 50, textBreite = B - 2 * R;
  let seiten = 0, seite = null, y = 0;
  const neueSeite = function () { seite = ziel.addPage([B, H]); seiten++; y = H - R; };
  const platz = function (hoehe) { if (!seite || y - hoehe < R) neueSeite(); };
  const absatz = function (text, o) {
    o = o || {};
    const font = o.fett ? fett : schrift, size = o.size || 10, einzug = o.einzug || 0;
    const zeilen = umbrechen(winAnsiSauber(text, font), font, size, textBreite - einzug);
    zeilen.forEach(function (z) {
      platz(size * 1.4);
      if (z) seite.drawText(z, { x: R + einzug, y: y - size, size: size, font: font });
      y -= size * 1.4;
    });
    y -= o.danach || 0;
  };

  platz(60);
  absatz('Korrekturen und Prüfung', { fett: true, size: 16, danach: 6 });
  absatz('Auftrag: ' + daten.auftrag);
  absatz('Monteur: ' + daten.monteur);
  absatz('Kalenderwoche: ' + daten.kw, { danach: 10 });

  korrekturen.forEach(function (k) {
    platz(52);
    absatz(datumDe(k.t) + ' · ' + k.name + ' · ' + k.bereich, { fett: true });
    absatz('Im Bericht: ' + k.vorher, { einzug: 12 });
    absatz('Richtig ist: ' + k.nachher, { einzug: 12, danach: 8 });
  });

  if (daten.klaerung) {
    const q = daten.klaerung;
    platz(52);
    absatz(q.offen ? 'Rückfrage offen' : 'Rückfrage geklärt', { fett: true });
    if (q.text) absatz(q.text, { einzug: 12 });
    absatz(rueckfrageZeile(q), { einzug: 12, danach: 8 });
  }

  if (daten.abzeichnung) {
    const a = daten.abzeichnung;
    platz(110);
    absatz(abzeichnungZeile(a), { fett: true, danach: 4 });
    let bild = null;
    if (daten.unterschrift) { try { bild = await ziel.embedPng(daten.unterschrift); } catch (e) { bild = null; } }
    if (bild) {
      const f = Math.min(160 / bild.width, 60 / bild.height, 1), w = bild.width * f, h = bild.height * f;
      platz(h + 6);
      seite.drawImage(bild, { x: R, y: y - h, width: w, height: h });
      y -= h + 6;
    } else {
      absatz('(Unterschrift nicht lesbar)');
    }
  }
  return seiten;
}

function statusChips(stand) {
  const chips = [], n = stand.korrekturen.length;
  if (n) chips.push({ text: 'korrigiert (' + n + ')', klasse: 'warn' });
  if (stand.klaerung && stand.klaerung.offen) chips.push({ text: 'Rückfrage offen', klasse: 'bad' });
  if (stand.abzeichnung) chips.push({ text: '✓ abgezeichnet', klasse: 'ok' });
  return chips;
}

function serverHinweis(antwort) {
  if (!antwort || antwort.ok) return '';
  if (antwort.error === 'Unbekannte Anfrage.') return 'Der Server ist noch nicht aktualisiert (Server-Datei und Code.gs einspielen, siehe docs/server-einspielen.md).';
  return antwort.error || 'Konnte nicht geladen werden.';
}

if (typeof module !== 'undefined') module.exports = { pruefseiteAnhaengen, winAnsiSauber, umbrechen, statusChips, serverHinweis, rueckfrageZeile, abzeichnungZeile };
