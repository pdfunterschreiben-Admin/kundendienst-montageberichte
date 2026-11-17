// Verschlüsselte Montageberichte: Server nimmt „SMB1“-Berichte mit Prüfsumme an, Schlüssel nur vom Admin setzbar
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');

function umgebung() {
  const props = {}, zeilen = [], dateien = [];
  const ctx = {
    ADMIN_MAILS: ['admin@x.de'], DOMAIN: 'firma.de',
    clean: (v, n) => String(v == null ? '' : v).trim().slice(0, n),
    findRow: () => 2,
    Utilities: {
      base64Decode: b => Array.from(Buffer.from(b, 'base64')).map(x => (x > 127 ? x - 256 : x)),
      computeDigest: (_a, bytes) => Array.from(crypto.createHash('sha256').update(Buffer.from(bytes.map(b => b & 255))).digest()).map(x => (x > 127 ? x - 256 : x)),
      DigestAlgorithm: { SHA_256: 1 }, newBlob: (b, mime, name) => ({ b, mime, name }),
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperties: o => Object.assign(props, o) }) },
    DriveApp: { getRootFolder: () => ({ getFoldersByName: () => ({ hasNext: () => false }), createFolder: () => ({ getFoldersByName: () => ({ hasNext: () => false }), createFolder: () => ({ createFile: blob => { dateien.push(blob); return { getId: () => 'F' + dateien.length }; } }) }) }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({}) },
    sheet: () => ({ getLastColumn: () => 13, getLastRow: () => 1 + zeilen.length, getRange: () => ({ getValues: () => zeilen.map(z => z.slice()), setValues: v => zeilen.splice(0, zeilen.length, ...v) }), appendRow: r => zeilen.push(r) }),
    Session: { getScriptTimeZone: () => 'Europe/Berlin' },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    module: { exports: {} }, console,
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(__dirname + '/../server/Montageberichte.js', 'utf8'), ctx);
  ctx.mbFreiFuer = () => true;
  ctx.mbNutzer = (_ss, d) => ({ mail: String(d.email).toLowerCase(), name: 'X' });
  return { ctx, props, zeilen, dateien };
}

test('Schlüssel: nur Admin darf setzen, danach kann jeder Berechtigte ihn holen', () => {
  const { ctx, props } = umgebung();
  const pub = '-----BEGIN PUBLIC KEY-----\nMIIB\n-----END PUBLIC KEY-----\n', priv = 'A'.repeat(300);
  assert.equal(ctx.montageberichteAnfrage({ event: 'mb_schluessel_setzen', email: 'buero@firma.de', pub, priv, fp: 'AB12' }).ok, false);
  assert.equal(ctx.montageberichteAnfrage({ event: 'mb_schluessel_setzen', email: 'admin@x.de', pub, priv, fp: 'AB12' }).ok, true);
  assert.equal(props.mb_pub, pub);
  assert.equal(ctx.montageberichteAnfrage({ event: 'mb_schluessel_setzen', email: 'admin@x.de', pub, priv, fp: 'CD34' }).ok, false, 'nicht überschreiben');
  const h = ctx.montageberichteAnfrage({ event: 'mb_schluessel_holen', email: 'buero@firma.de' });
  assert.equal(h.priv, priv); assert.equal(h.fp, 'AB12');
  assert.equal(ctx.mbPubText(), pub);
});

test('mbHoch: verschlüsselter Bericht mit Prüfsumme wird angenommen, Doppeltes erkannt', () => {
  const { ctx, zeilen, dateien } = umgebung();
  const enc = Buffer.concat([Buffer.from('SMB1'), crypto.randomBytes(400)]).toString('base64');
  const sha = crypto.createHash('sha256').update('pdf').digest('hex');
  const d = { email: 'monteur@firma.de', name: 'Max', b64: enc, sha, enc: 1, nr: '4711', art: 'montage', datei: 'MB 4711.pdf', datum: '' };
  assert.equal(ctx.mbHoch(d), 'gespeichert');
  assert.equal(zeilen[0][11], sha);
  assert.equal(dateien[0].mime, 'application/octet-stream');
  assert.match(dateien[0].name, /\.verschluesselt$/);
  assert.equal(ctx.mbHoch(Object.assign({}, d, { b64: Buffer.concat([Buffer.from('SMB1'), crypto.randomBytes(400)]).toString('base64') })), 'schon da');
  assert.throws(() => ctx.mbHoch(Object.assign({}, d, { sha: 'kaputt' })), /Prüfsumme/);
});

test('mbHoch: unverschlüsselte PDF (ältere Service-Mappe) geht weiter', () => {
  const { ctx, dateien } = umgebung();
  const pdf = Buffer.concat([Buffer.from('%PDF-1.7 '), crypto.randomBytes(300)]).toString('base64');
  assert.equal(ctx.mbHoch({ email: 'monteur@firma.de', name: 'Max', b64: pdf, nr: '1', art: 'uvv', datei: 'a.pdf', datum: '' }), 'gespeichert');
  assert.equal(dateien[0].mime, 'application/pdf');
  assert.throws(() => ctx.mbHoch({ email: 'monteur@firma.de', name: 'Max', b64: Buffer.from('X'.repeat(300)).toString('base64'), datei: 'b.pdf' }), /Keine PDF/);
});
