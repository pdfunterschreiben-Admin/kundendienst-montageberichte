// Kundendienst Montageberichte – unterschriebene Berichte der Monteure fürs Büro.
// Im Apps-Script-Projekt als eigene Datei anlegen (ohne die letzte module.exports-Zeile).
//
// Die Service-Mappe schickt jeden unterschriebenen Bericht (PDF) mit mb_hoch hierher: Er landet in Google Drive
// im Ordner „Kundendienst Montageberichte/<Monteur>“ und bekommt eine Zeile im Blatt „Montageberichte“
// (Monteur, Berichtsdatum, Kalenderwoche, Auftragsnummer, Art …).
// Das Büro-Programm „Kundendienst Montageberichte“ (app: 'montageberichte') liest Monteure, Kalenderwochen
// und Berichte und holt die PDFs ab. Wer sich im Programm angemeldet hat und
// freigeschaltet ist, darf die Berichte sehen (das Programm ist nur für die Dispo gedacht). Sperren: im Blatt
// „Nutzer Montageberichte“ in „Gesperrt (ja)“ ein „ja“ eintragen.

const MB_BLATT = 'Montageberichte';
const MB_HEAD = ['Eingang', 'Monteur', 'E-Mail', 'Berichtsdatum', 'Jahr', 'KW', 'Auftragsnummer', 'Art', 'Seriennummer', 'Dateiname', 'Datei-ID', 'Prüfsumme'];
const MB_NUTZER = 'Nutzer Montageberichte';
const MB_ARTEN = { montage: 'Montagebericht', uvv: 'UVV Bericht', dguv: 'DGUV V3 Bericht' };
// Wer Berichte an den Kundendienst schicken darf (Schaltfläche „An Kundendienst senden“ in der Service-Mappe):
// Admins immer, sonst wer im Blatt „Nutzer“ in der Spalte „An Kundendienst senden (ja)“ ein „ja“ hat.
// Notfalls hier E-Mails eintragen, '*' = alle Monteure.
const MB_FREI = [];
const MB_FREI_SPALTE = 'An Kundendienst senden (ja)';

function mbFreiSpalte(users) {
  const lc = Math.max(users.getLastColumn(), 1);
  const head = users.getRange(1, 1, 1, lc).getValues()[0].map(function (h) { return String(h).trim(); });
  let c = head.indexOf(MB_FREI_SPALTE);
  if (c < 0) { c = Math.max(lc, 12); users.getRange(1, c + 1).setValue(MB_FREI_SPALTE).setFontWeight('bold'); }
  return c + 1;
}

function mbFreiFuer(mail, users) {
  mail = String(mail || '').toLowerCase();
  if (!mail) return false;
  if (ADMIN_MAILS.indexOf(mail) >= 0 || MB_FREI.indexOf('*') >= 0 || MB_FREI.indexOf(mail) >= 0) return true;
  users = users || SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Nutzer');
  if (!users) return false;
  const c = mbFreiSpalte(users), lr = users.getLastRow();
  if (lr < 2) return false;
  const mails = users.getRange(2, 2, lr - 1, 1).getValues(), frei = users.getRange(2, c, lr - 1, 1).getValues();
  return mails.some(function (m, i) { return String(m[0]).trim().toLowerCase() === mail && String(frei[i][0]).trim().toLowerCase() === 'ja'; });
}

function mbBlatt(ss) {
  const s = sheet(ss || SpreadsheetApp.getActiveSpreadsheet(), MB_BLATT, MB_HEAD);
  if (s.getLastColumn() < MB_HEAD.length) s.getRange(1, 1, 1, MB_HEAD.length).setValues([MB_HEAD]).setFontWeight('bold');
  return s;
}

function mbOrdner(name) {
  const root = DriveApp.getRootFolder(), it = root.getFoldersByName('Kundendienst Montageberichte');
  const haupt = it.hasNext() ? it.next() : root.createFolder('Kundendienst Montageberichte');
  const n = String(name || 'Unbekannt').replace(/[\\/:*?"<>|]/g, ' ').trim() || 'Unbekannt';
  const sub = haupt.getFoldersByName(n);
  return sub.hasNext() ? sub.next() : haupt.createFolder(n);
}

// Kalenderwoche nach ISO 8601 (Woche mit dem ersten Donnerstag ist KW 1)
function mbKw(dt) {
  const d = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
  const tag = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - tag);
  const jahr = d.getUTCFullYear();
  const kw = Math.ceil(((d - Date.UTC(jahr, 0, 1)) / 86400000 + 1) / 7);
  return { jahr: jahr, kw: kw };
}

function mbDatum(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    // Berichtsdatum nur glauben, wenn es plausibel ist (nicht in der Zukunft, nicht älter als 1 Jahr)
    if (!isNaN(d) && d.getTime() < Date.now() + 2 * 86400000 && d.getTime() > Date.now() - 366 * 86400000) return d;
  }
  const h = new Date();
  return new Date(h.getFullYear(), h.getMonth(), h.getDate());
}

// Vom Monteur (Service-Mappe, mit KEY): einen unterschriebenen Bericht ablegen
function mbHoch(d) {
  const mail = clean(d.email, 150).toLowerCase(), name = clean(d.name, 100);
  if (ADMIN_MAILS.indexOf(mail) < 0 && !mail.endsWith('@' + DOMAIN)) throw new Error('Nicht berechtigt.');
  if (!name) throw new Error('Name fehlt.');
  if (!mbFreiFuer(mail)) return 'noch nicht freigegeben';
  const b64 = String(d.b64 || '').replace(/\s/g, '');
  if (b64.length < 200 || b64.length > 40000000) throw new Error('Keine gültige PDF.');
  const bytes = Utilities.base64Decode(b64);
  if (String.fromCharCode.apply(null, bytes.slice(0, 4).map(function (b) { return b & 255; })) !== '%PDF') throw new Error('Keine PDF-Datei.');
  const sha = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
  const s = mbBlatt();
  const art = MB_ARTEN[d.art] ? d.art : 'montage';
  const datum = mbDatum(d.datum), w = mbKw(datum);
  const nr = clean(d.nr, 40), ser = clean(d.serie, 60);
  let datei = clean(d.datei, 150).replace(/[\\/:*?"<>|]/g, '_') || 'Bericht.pdf';
  if (!/\.pdf$/i.test(datei)) datei += '.pdf';
  const last = s.getLastRow(), v = last >= 2 ? s.getRange(2, 1, last - 1, MB_HEAD.length).getValues() : [];
  let zeile = 0;
  for (let i = v.length - 1; i >= 0; i--) {
    if (v[i][11] === sha) return 'schon da';   // genau dieser Bericht wurde schon geschickt
    // derselbe Bericht noch einmal unterschrieben (gleicher Monteur, Dateiname, Auftrag, Art): ersetzen
    if (!zeile && String(v[i][2]).toLowerCase() === mail && String(v[i][9]) === datei && String(v[i][6]) === nr && String(v[i][7]) === art) zeile = i + 2;
  }
  const f = mbOrdner(name).createFile(Utilities.newBlob(bytes, 'application/pdf', datei));
  const neu = [new Date(), name, mail, datum, w.jahr, w.kw, "'" + nr, art, "'" + ser, datei, f.getId(), sha];
  if (zeile) {
    try { DriveApp.getFileById(String(v[zeile - 2][10])).setTrashed(true); } catch (x) { }
    s.getRange(zeile, 1, 1, MB_HEAD.length).setValues([neu]);
    return 'ersetzt';
  }
  s.appendRow(neu);
  return 'gespeichert';
}

// Büro-Programm: angemeldeter und berechtigter Rechner?
function mbNutzer(ss, d) {
  const users = sheet(ss, MB_NUTZER, ['Name', 'E-Mail', 'Rechner-ID', 'Version', 'Erste Anmeldung', 'Zuletzt aktiv',
    'Freigeschaltet', 'Gesperrt (ja)', 'Starts', 'Gespeichert', 'Gedruckt', 'Per E-Mail', 'Berechtigt (ja)']);
  if (users.getLastColumn() < 13) users.getRange(1, 13).setValue('Berechtigt (ja)').setFontWeight('bold');
  const id = clean(d.id, 64), mail = clean(d.email, 150).toLowerCase();
  const row = id ? findRow(users, id) : -1;
  if (row < 0) throw new Error('Bitte neu anmelden.');
  const r = users.getRange(row, 1, 1, 13).getValues()[0];
  if (String(r[1]).toLowerCase() !== mail || String(r[6]).toLowerCase() !== 'ja') throw new Error('Bitte neu anmelden.');
  if (String(r[7]).trim().toLowerCase() === 'ja') throw new Error('Dein Zugang wurde gesperrt.');
  return { mail: mail, name: String(r[0] || '') };
}

// Berichte von Admin-Adressen sind Testberichte: Nur Admins sehen sie, alle anderen Nutzer nicht.
function mbOhneTestberichte(zeilen, admins) {
  return zeilen.filter(function (r) { return admins.indexOf(String(r[2]).toLowerCase()) < 0; });
}

let MB_NUR_ECHTE = false; // pro Anfrage gesetzt (siehe montageberichteAnfrage)

function mbZeilen() {
  const s = mbBlatt(), last = s.getLastRow();
  const z = last < 2 ? [] : s.getRange(2, 1, last - 1, MB_HEAD.length).getValues();
  return MB_NUR_ECHTE ? mbOhneTestberichte(z, ADMIN_MAILS) : z;
}

function montageberichteAnfrage(d) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const nutzer = mbNutzer(ss, d);
  MB_NUR_ECHTE = ADMIN_MAILS.indexOf(nutzer.mail) < 0;
  const ev = String(d.event || '');
  if (/^mb_(vermerke|korrektur|klaerung|abzeichnen|unterschrift_datei)$/.test(ev)) {
    const schreiben = /^mb_(korrektur|klaerung|abzeichnen)$/.test(ev);
    const sperre = schreiben ? LockService.getScriptLock() : null;
    if (sperre) sperre.waitLock(20000);
    try { return mbVermerkAnfrage(ev, d, nutzer, mbAblage(ss), Date.now()); }
    finally { if (sperre) sperre.releaseLock(); }
  }
  const tz = Session.getScriptTimeZone() || 'Europe/Berlin';
  if (ev === 'mb_unterschrift_code')
    return mbSigCode(nutzer, CacheService.getScriptCache(), function () { return Utilities.getUuid().replace(/-/g, '').slice(0, 24); },
      MB_HANDY_URL, function (link) { return qrBmpBase64(link, 6); });
  if (ev === 'mb_unterschrift_abholen') return mbSigAbholen(d.token, nutzer, CacheService.getScriptCache());
  if (ev === 'mb_monteure') {
    // je Monteur (E-Mail) der neueste Name und alle Kalenderwochen mit Anzahl Berichten
    const m = {};
    mbZeilen().forEach(function (r) {
      const mail = String(r[2]).toLowerCase(); if (!mail) return;
      const x = m[mail] || (m[mail] = { email: mail, name: '', kws: {} , zuletzt: 0 });
      const t = r[0] instanceof Date ? r[0].getTime() : 0;
      if (t >= x.zuletzt) { x.zuletzt = t; x.name = String(r[1]); }
      const k = r[4] + '-' + ('0' + r[5]).slice(-2);
      x.kws[k] = (x.kws[k] || 0) + 1;
    });
    const liste = Object.keys(m).map(function (k) {
      const x = m[k];
      return { email: x.email, name: x.name, zuletzt: x.zuletzt,
        kws: Object.keys(x.kws).sort().reverse().map(function (s) { const p = s.split('-'); return { jahr: +p[0], kw: +p[1], anzahl: x.kws[s] }; }) };
    }).sort(function (a, b) { return a.name.localeCompare(b.name, 'de'); });
    return { ok: true, monteure: liste };
  }
  if (ev === 'mb_liste') {
    const mail = clean(d.monteur, 150).toLowerCase(), jahr = Number(d.jahr), kw = Number(d.kw);
    const out = [];
    mbZeilen().forEach(function (r) {
      if (String(r[2]).toLowerCase() !== mail || Number(r[4]) !== jahr || Number(r[5]) !== kw) return;
      out.push({ id: String(r[10]), nr: String(r[6]), art: String(r[7]), serie: String(r[8]), datei: String(r[9]),
        datum: r[3] instanceof Date ? Utilities.formatDate(r[3], tz, 'yyyy-MM-dd') : String(r[3]),
        eingang: r[0] instanceof Date ? r[0].getTime() : 0 });
    });
    return { ok: true, berichte: out };
  }
  if (ev === 'mb_uebersicht') {
    const heute = mbKw(new Date());
    return mbUebersicht(mbZeilen(), mbAblage(ss).zeilen(), heute, 26,
      function (v) { return v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : String(v); });
  }
  if (ev === 'mb_datei') {
    const id = String(d.datei || '');
    if (!/^[\w\-]{10,100}$/.test(id)) return { ok: false, error: 'Ungültige Datei.' };
    if (!mbZeilen().some(function (r) { return String(r[10]) === id; })) return { ok: false, error: 'Bericht nicht gefunden.' };
    return { ok: true, b64: Utilities.base64Encode(DriveApp.getFileById(id).getBlob().getBytes()) };
  }
  return { ok: false, error: 'Unbekannte Anfrage.' };
}

// ---------------- Übersicht: was ist noch zu prüfen? ----------------
// Alle Berichte der letzten `wochen` Kalenderwochen (bis `heute` = {jahr, kw}) mit Monteur und KW, dazu je Auftrag
// eine Kurzfassung des Prüfstands. Schlüssel: "<monteur>|<jahr>|<kw>|<auftrag>". zeilen/vermerke wie mbZeilen()/mbAblage().zeilen().
function mbUebersicht(zeilen, vermerke, heute, wochen, datumText) {
  const nr = function (j, k) { return Number(j) * 53 + Number(k); };
  const ab = nr(heute.jahr, heute.kw) - wochen + 1;
  const berichte = [];
  zeilen.forEach(function (r) {
    if (nr(r[4], r[5]) < ab) return;
    berichte.push({ monteur: String(r[2]).toLowerCase(), jahr: Number(r[4]), kw: Number(r[5]), id: String(r[10]), nr: String(r[6]), art: String(r[7]),
      serie: String(r[8]), datei: String(r[9]), datum: datumText(r[3]), eingang: r[0] instanceof Date ? r[0].getTime() : 0 });
  });
  const gruppen = Object.create(null);
  vermerke.forEach(function (z) {
    if (nr(z.jahr, z.kw) < ab) return;
    const k = String(z.monteur).toLowerCase() + '|' + Number(z.jahr) + '|' + Number(z.kw) + '|' + z.auftrag;
    (gruppen[k] = gruppen[k] || []).push(z);
  });
  const stand = Object.create(null);
  Object.keys(gruppen).forEach(function (k) {
    const st = mbStand(gruppen[k]);
    stand[k] = { abgezeichnet: !!st.abzeichnung, rueckfrage: !!(st.klaerung && st.klaerung.offen), korrekturen: st.korrekturen.length };
  });
  return { ok: true, berichte: berichte, stand: stand };
}

// ---------------- Korrekturen, Rückfragen und Abzeichnung ----------------
// Der Verlauf liegt im Blatt „Korrekturen Montageberichte“ (nur anhängen). Der Stand eines Auftrags wird daraus berechnet.
const MB_BEREICHE = ['Text', 'Ersatzteile', 'Arbeitszeit', 'Sonstiges'];

// ereignisse: [{t, ereignis, bereich, vorher, nachher, text, name, mail, unterschriftId}] in Zeilenreihenfolge
function mbStand(ereignisse) {
  const korrekturen = [];
  let klaerung = null, abzeichnung = null;
  ereignisse.forEach(function (e) {
    if (e.ereignis === 'korrektur') {
      korrekturen.push({ t: e.t, bereich: e.bereich, vorher: e.vorher, nachher: e.nachher, name: e.name });
      abzeichnung = null;
    } else if (e.ereignis === 'klaerung_setzen') {
      klaerung = { offen: true, text: e.text, name: e.name, t: e.t };
      abzeichnung = null;
    } else if (e.ereignis === 'klaerung_erledigt') {
      klaerung = { offen: false, text: klaerung ? klaerung.text : '', name: e.name, t: e.t };
    } else if (e.ereignis === 'abzeichnung') {
      abzeichnung = { name: e.name, t: e.t, unterschriftId: e.unterschriftId };
    }
  });
  const letzte = ereignisse.length ? ereignisse[ereignisse.length - 1].t : 0;
  return { korrekturen: korrekturen, klaerung: klaerung, abzeichnung: abzeichnung, schluessel: ereignisse.length + ':' + letzte };
}

// Gibt den Fehlertext zurück oder null, wenn das Ereignis eingetragen werden darf.
function mbVermerkPruefen(ereignis, daten, stand) {
  const txt = function (v) { return String(v == null ? '' : v).trim(); };
  if (ereignis === 'korrektur') {
    if (MB_BEREICHE.indexOf(daten.bereich) < 0) return 'Unbekannter Bereich.';
    if (!txt(daten.nachher)) return 'Bitte angeben, was richtig ist.';
    if (txt(daten.vorher).length > 500 || txt(daten.nachher).length > 500 || txt(daten.text).length > 1000) return 'Text zu lang.';
    return null;
  }
  if (ereignis === 'klaerung_setzen') {
    if (!txt(daten.text)) return 'Bitte die Rückfrage beschreiben.';
    if (txt(daten.text).length > 1000) return 'Text zu lang.';
    return null;
  }
  if (ereignis === 'klaerung_erledigt') return stand.klaerung && stand.klaerung.offen ? null : 'Es ist keine Rückfrage offen.';
  if (ereignis === 'abzeichnung') {
    if (stand.klaerung && stand.klaerung.offen) return 'Rückfrage noch offen – erst als geklärt markieren.';
    if (stand.abzeichnung) return 'Schon abgezeichnet.';
    return null;
  }
  return 'Unbekannte Anfrage.';
}

// Blatt „Korrekturen Montageberichte“ und Drive-Ordner „Unterschriften“ als Ablage für mbVermerkAnfrage
const MB_KORR_BLATT = 'Korrekturen Montageberichte';
const MB_KORR_HEAD = ['Zeitpunkt', 'Ereignis', 'Monteur-E-Mail', 'Jahr', 'KW', 'Auftrag', 'Bereich', 'Vorher', 'Nachher', 'Text', 'Name', 'E-Mail', 'Unterschrift-ID', 'Prüfsumme'];

// Texte, die wie Zahlen oder Formeln aussehen, mit führendem ' als Text ablegen (wie die Auftragsnummer in mbHoch)
function mbZelle(v) { const t = String(v == null ? '' : v); return /^[\d=+\-@']/.test(t) ? "'" + t : t; }

function mbAblage(ss) {
  const s = sheet(ss, MB_KORR_BLATT, MB_KORR_HEAD);
  const text = function (v) { return String(v == null ? '' : v); };
  const ablage = {
    zeilen: function () {
      const last = s.getLastRow();
      if (last < 2) return [];
      return s.getRange(2, 1, last - 1, MB_KORR_HEAD.length).getValues().map(function (r) {
        return { t: r[0] instanceof Date ? r[0].getTime() : Number(r[0]) || 0, ereignis: text(r[1]), monteur: text(r[2]), jahr: Number(r[3]), kw: Number(r[4]),
          auftrag: text(r[5]), bereich: text(r[6]), vorher: text(r[7]), nachher: text(r[8]), text: text(r[9]), name: text(r[10]), mail: text(r[11]),
          unterschriftId: text(r[12]), pruefsumme: text(r[13]) };
      });
    },
    anhaengen: function (z) {
      s.appendRow([new Date(z.t), z.ereignis, z.monteur, z.jahr, z.kw, mbZelle(z.auftrag), z.bereich, mbZelle(z.vorher), mbZelle(z.nachher), mbZelle(z.text),
        z.name, z.mail, z.unterschriftId, z.pruefsumme]);
    },
    unterschriftSpeichern: function (mail, b64) {
      const bytes = Utilities.base64Decode(b64);
      const sha = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)
        .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
      const da = ablage.zeilen().filter(function (z) { return z.mail === mail && z.pruefsumme === sha && z.unterschriftId; })[0];
      if (da) return { id: da.unterschriftId, pruefsumme: sha };
      const f = mbOrdner('Unterschriften').createFile(Utilities.newBlob(bytes, 'image/png', mail + '-' + Date.now() + '.png'));
      return { id: f.getId(), pruefsumme: sha };
    },
    unterschriftLesen: function (id) { return Utilities.base64Encode(DriveApp.getFileById(id).getBlob().getBytes()); },
  };
  return ablage;
}

// ---------------- Unterschrift per Handy (QR-Code) ----------------
// Vorbild: „Typenschild per Handy“ der Service-Mappe. Die Handy-Seite liegt auf GitHub Pages (docs/handy in diesem Repository)
// und schickt das Foto per doPost (Ereignis h_sig, ohne Anmeldung, nur mit gültigem Code). Das Foto liegt nur im Skript-Cache.
const MB_HANDY_URL = 'https://pdfunterschreiben-admin.github.io/kundendienst-montageberichte/handy/';
const MB_SIG_TTL = 600;      // Sekunden, die der Code gilt
const MB_SIG_MAX = 90000;    // Zeichen Base64 für das Foto (Cache-Werte dürfen höchstens 100 KB groß sein)

function mbSigToken(token) {
  const t = String(token == null ? '' : token).replace(/[^a-f0-9]/g, '');
  return /^[a-f0-9]{24}$/.test(t) ? t : '';
}

function mbSigCode(nutzer, cache, zufall, handyUrl, qr) {
  const token = zufall();
  cache.put('sig_' + token, JSON.stringify({ mail: nutzer.mail, b64: null }), MB_SIG_TTL);
  const link = handyUrl + '?sig=' + token;
  return { ok: true, token: token, link: link, qr: qr(link) };
}

// Von der Handy-Seite: '1'/'0' bei aktion 'pruefen', '1' bei 'hochladen'; Fehler als Error (doPost macht daraus „FEHLER“)
function mbSigHandy(d, cache) {
  const token = mbSigToken(d.token);
  const roh = token ? cache.get('sig_' + token) : null;
  const eintrag = roh ? JSON.parse(roh) : null;
  if (d.aktion === 'pruefen') return eintrag && eintrag.b64 === null ? '1' : '0';
  if (d.aktion !== 'hochladen') throw new Error('Unbekannte Anfrage.');
  if (!eintrag) throw new Error('Der QR-Code ist abgelaufen. Bitte im Programm noch einmal „Unterschrift hinterlegen“ wählen.');
  if (eintrag.b64 !== null) throw new Error('Für diesen QR-Code wurde schon ein Foto geschickt.');
  const b64 = String(d.b64 || '').replace(/\s/g, '');
  if (b64.length < 100 || (b64.indexOf('/9j/') !== 0 && b64.indexOf('iVBOR') !== 0)) throw new Error('Kein Foto.');
  if (b64.length > MB_SIG_MAX) throw new Error('Foto zu groß.');
  eintrag.b64 = b64;
  cache.put('sig_' + token, JSON.stringify(eintrag), MB_SIG_TTL);
  return '1';
}

// Vom Büro-Programm: Foto abholen (nur der Nutzer, dem der Code gehört); nach der Ausgabe ist es gelöscht
function mbSigAbholen(token, nutzer, cache) {
  const t = mbSigToken(token);
  const roh = t ? cache.get('sig_' + t) : null;
  const eintrag = roh ? JSON.parse(roh) : null;
  if (!eintrag || eintrag.mail !== nutzer.mail) return { ok: false, error: 'Code ungültig oder abgelaufen.' };
  if (eintrag.b64 === null) return { ok: true, wartet: true };
  cache.remove('sig_' + t);
  return { ok: true, b64: eintrag.b64 };
}

// Aus Code.gs aufrufbar (siehe docs/server-einspielen.md)
function mbHandySig(d) { return mbSigHandy(d, CacheService.getScriptCache()); }

// Anfragen des Büro-Programms zu Vermerken. ablage: {zeilen(), anhaengen(zeile), unterschriftSpeichern(mail, b64), unterschriftLesen(id)}
function mbVermerkAnfrage(ev, d, nutzer, ablage, jetzt) {
  const txt = function (v, max) { return String(v == null ? '' : v).trim().slice(0, max); };
  const monteur = txt(d.monteur, 150).toLowerCase(), jahr = Number(d.jahr), kw = Number(d.kw);
  const meine = function () {
    return ablage.zeilen().filter(function (z) { return String(z.monteur).toLowerCase() === monteur && Number(z.jahr) === jahr && Number(z.kw) === kw; });
  };
  if (ev === 'mb_vermerke') {
    const gruppen = Object.create(null), vermerke = Object.create(null);
    meine().forEach(function (z) { (gruppen[z.auftrag] = gruppen[z.auftrag] || []).push(z); });
    Object.keys(gruppen).forEach(function (a) { vermerke[a] = mbStand(gruppen[a]); });
    return { ok: true, vermerke: vermerke };
  }
  if (ev === 'mb_unterschrift_datei') {
    const id = txt(d.datei, 100);
    const bekannt = id && ablage.zeilen().some(function (z) { return z.ereignis === 'abzeichnung' && z.unterschriftId === id; });
    return bekannt ? { ok: true, b64: ablage.unterschriftLesen(id) } : { ok: false, error: 'Unterschrift nicht gefunden.' };
  }
  let ereignis;
  if (ev === 'mb_korrektur') ereignis = 'korrektur';
  else if (ev === 'mb_abzeichnen') ereignis = 'abzeichnung';
  else if (ev === 'mb_klaerung') ereignis = d.aktion === 'setzen' ? 'klaerung_setzen' : d.aktion === 'erledigt' ? 'klaerung_erledigt' : '';
  if (!ereignis) return { ok: false, error: 'Unbekannte Anfrage.' };
  const auftrag = txt(d.auftrag, 200);
  if (!monteur || !auftrag) return { ok: false, error: 'Auftrag fehlt.' };
  const daten = { bereich: txt(d.bereich, 40), vorher: txt(d.vorher, 2000), nachher: txt(d.nachher, 2000), text: txt(d.text, 2000) };
  const stand = function () { return mbStand(meine().filter(function (z) { return z.auftrag === auftrag; })); };
  const fehler = mbVermerkPruefen(ereignis, daten, stand());
  if (fehler) return { ok: false, error: fehler };
  const zeile = { t: jetzt, ereignis: ereignis, monteur: monteur, jahr: jahr, kw: kw, auftrag: auftrag, bereich: daten.bereich,
    vorher: daten.vorher, nachher: daten.nachher, text: daten.text, name: nutzer.name, mail: nutzer.mail, unterschriftId: '', pruefsumme: '' };
  if (ereignis === 'abzeichnung') {
    const u = String(d.unterschrift || '').replace(/\s/g, '');
    if (!u) return { ok: false, error: 'Bitte zuerst die Unterschrift hinterlegen.' };
    if (u.length < 20 || u.length > 200000 || u.indexOf('iVBOR') !== 0) return { ok: false, error: 'Unterschrift ungültig.' };
    const f = ablage.unterschriftSpeichern(nutzer.mail, u);
    zeile.unterschriftId = f.id; zeile.pruefsumme = f.pruefsumme;
  }
  ablage.anhaengen(zeile);
  return { ok: true, stand: stand() };
}

if (typeof module !== 'undefined') module.exports = { mbOhneTestberichte, mbUebersicht, mbKw, mbDatum, MB_BEREICHE, mbStand, mbVermerkPruefen, mbVermerkAnfrage, MB_HANDY_URL, mbSigCode, mbSigHandy, mbSigAbholen };
