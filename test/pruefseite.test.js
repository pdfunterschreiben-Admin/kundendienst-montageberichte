const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { pruefseiteAnhaengen, winAnsiSauber, umbrechen, statusChips, serverHinweis, rueckfrageZeile, abzeichnungZeile } = require('../web/pruefseite.js');

let PDFLib;
try { PDFLib = require('pdf-lib'); } catch (e) { /* ohne pdf-lib werden die PDF-Tests übersprungen */ }
const opt = { skip: !PDFLib && 'pdf-lib nicht gefunden (NODE_PATH=/opt/npm-tools/node_modules setzen)' };

const daten = (extra) => Object.assign({ auftrag: '4711', monteur: 'Max Mustermann', kw: 'KW 46 / 2026', korrekturen: [], klaerung: null, abzeichnung: null, unterschrift: null }, extra);
const korr = () => ({ t: Date.UTC(2026, 10, 15, 10, 0), bereich: 'Arbeitszeit', vorher: '1,5 h', nachher: '2,0 h', name: 'Berta' });
async function neuesDoc() { const d = await PDFLib.PDFDocument.create(); d.addPage(); return d; }
async function seiten(doc) { return (await PDFLib.PDFDocument.load(await doc.save())).getPageCount(); }

function chunk(typ, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(typ, 'ascii'), crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([t, data])) >>> 0);
  return Buffer.concat([len, t, data, crc]);
}
function pngKlein() {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(18);
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) raw[y * 9 + 1 + x * 4 + 3] = 255;
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

test('ohne Vermerke wird keine Seite angehängt', opt, async () => {
  const doc = await neuesDoc();
  assert.equal(await pruefseiteAnhaengen(doc, PDFLib, daten()), 0);
  assert.equal(doc.getPageCount(), 1);
});

test('eine Korrektur: genau eine Seite, PDF lädt wieder', opt, async () => {
  const doc = await neuesDoc();
  assert.equal(await pruefseiteAnhaengen(doc, PDFLib, daten({ korrekturen: [korr()] })), 1);
  assert.equal(await seiten(doc), 2);
});

test('60 Korrekturen brauchen mehr als eine Seite', opt, async () => {
  const doc = await neuesDoc();
  const r = await pruefseiteAnhaengen(doc, PDFLib, daten({ korrekturen: Array.from({ length: 60 }, korr) }));
  assert.ok(r > 1);
  assert.equal(await seiten(doc), 1 + r);
});

test('Emoji, Pfeil, Zeilenumbrüche und ein sehr langes Wort bringen nichts zum Absturz', opt, async () => {
  const doc = await neuesDoc();
  const wild = '😀 → Ä ö ß € ' + 'x'.repeat(300) + '\r\n\tZeile';
  const k = Object.assign(korr(), { vorher: wild, nachher: wild });
  const r = await pruefseiteAnhaengen(doc, PDFLib, daten({ korrekturen: [k], klaerung: { offen: true, text: wild, name: 'Ä😀', t: 1 } }));
  assert.ok(r >= 1);
  assert.equal(await seiten(doc), 1 + r);
});

test('Abzeichnung mit Unterschrift (PNG) wird eingebettet', opt, async () => {
  const doc = await neuesDoc();
  const r = await pruefseiteAnhaengen(doc, PDFLib, daten({ abzeichnung: { name: 'Anna', t: Date.UTC(2026, 10, 15, 11, 0), unterschriftId: 'U1' }, unterschrift: pngKlein() }));
  assert.equal(r, 1);
  assert.equal(await seiten(doc), 2);
});

test('nicht lesbare Unterschrift bringt nichts zum Absturz', opt, async () => {
  const doc = await neuesDoc();
  const r = await pruefseiteAnhaengen(doc, PDFLib, daten({ abzeichnung: { name: 'Anna', t: 1, unterschriftId: 'U1' }, unterschrift: new Uint8Array([1, 2, 3]) }));
  assert.equal(r, 1);
});

test('winAnsiSauber ersetzt nicht darstellbare Zeichen', opt, async () => {
  const doc = await neuesDoc();
  const f = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  assert.equal(winAnsiSauber('Ä😀→ö', f), 'Ä??ö');
});

test('umbrechen kürzt Zeilen auf die Breite, ohne Zeichen zu verlieren', opt, async () => {
  const doc = await neuesDoc();
  const f = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  const zeilen = umbrechen('a'.repeat(300), f, 10, 200);
  assert.ok(zeilen.length > 1);
  assert.ok(zeilen.every(z => f.widthOfTextAtSize(z, 10) <= 200));
  assert.equal(zeilen.join(''), 'a'.repeat(300));
  assert.deepEqual(umbrechen('ab\ncd', f, 10, 200), ['ab', 'cd']);
});

test('statusChips', () => {
  assert.deepEqual(statusChips({ korrekturen: [{}, {}], klaerung: { offen: true }, abzeichnung: null }),
    [{ text: 'korrigiert (2)', klasse: 'warn' }, { text: 'Rückfrage offen', klasse: 'bad' }]);
  assert.ok(statusChips({ korrekturen: [], klaerung: null, abzeichnung: { name: 'A' } }).some(c => c.text === '✓ abgezeichnet' && c.klasse === 'ok'));
  assert.deepEqual(statusChips({ korrekturen: [], klaerung: { offen: false }, abzeichnung: null }), []);
});

test('serverHinweis', () => {
  assert.match(serverHinweis({ ok: false, error: 'Unbekannte Anfrage.' }), /noch nicht aktualisiert/);
  assert.equal(serverHinweis({ ok: false, error: 'X' }), 'X');
  assert.equal(serverHinweis({ ok: true }), '');
});

test('Zeilen für Rückfrage und Abzeichnung nennen Name und Datum (Berliner Zeit)', () => {
  const t = Date.UTC(2026, 10, 15, 10, 0);
  assert.equal(rueckfrageZeile({ offen: true, name: 'Berta', t }), 'gestellt von Berta am 15.11.2026 11:00');
  assert.equal(rueckfrageZeile({ offen: false, name: 'Carl', t }), 'geklärt von Carl am 15.11.2026 11:00');
  assert.equal(abzeichnungZeile({ name: 'Anna', t }), 'Kontrolliert und abgezeichnet von Anna am 15.11.2026 11:00');
});
