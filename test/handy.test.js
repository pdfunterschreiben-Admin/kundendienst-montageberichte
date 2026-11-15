const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('../server/Montageberichte.js');

function fakeCache() {
  const m = new Map();
  let jetzt = 0;
  return {
    get: k => { const e = m.get(k); return e && e.bis > jetzt ? e.v : null; },
    put: (k, v, ttl) => { m.set(k, { v, bis: jetzt + ttl }); },
    remove: k => { m.delete(k); },
    tick: sek => { jetzt += sek; },
  };
}
const berta = { mail: 'berta@x', name: 'Berta' };
const carl = { mail: 'carl@x', name: 'Carl' };
const foto = '/9j/' + 'A'.repeat(100);
function neu(cache) {
  return s.mbSigCode(berta, cache, () => 'abcdef0123456789abcdef01', 'https://handy.example/', l => 'QR:' + l);
}

test('mbSigCode liefert Code, Link und QR-Bild', () => {
  const c = fakeCache();
  const r = neu(c);
  assert.equal(r.ok, true);
  assert.match(r.token, /^[0-9a-f]{24}$/);
  assert.equal(r.link, 'https://handy.example/?sig=' + r.token);
  assert.equal(r.qr, 'QR:' + r.link);
  assert.equal(s.mbSigHandy({ aktion: 'pruefen', token: r.token }, c), '1');
});

test('Handy lädt hoch, das Büro holt das Foto genau einmal ab', () => {
  const c = fakeCache(), { token } = neu(c);
  assert.equal(s.mbSigHandy({ aktion: 'hochladen', token, b64: foto }, c), '1');
  assert.deepEqual(s.mbSigAbholen(token, berta, c), { ok: true, b64: foto });
  assert.deepEqual(s.mbSigAbholen(token, berta, c), { ok: false, error: 'Code ungültig oder abgelaufen.' });
});

test('Abholen vor dem Hochladen: es wird gewartet', () => {
  const c = fakeCache(), { token } = neu(c);
  assert.deepEqual(s.mbSigAbholen(token, berta, c), { ok: true, wartet: true });
});

test('ein anderer Nutzer kann das Foto nicht abholen, der Eigentümer schon', () => {
  const c = fakeCache(), { token } = neu(c);
  s.mbSigHandy({ aktion: 'hochladen', token, b64: foto }, c);
  assert.deepEqual(s.mbSigAbholen(token, carl, c), { ok: false, error: 'Code ungültig oder abgelaufen.' });
  assert.equal(s.mbSigAbholen(token, berta, c).b64, foto);
});

test('abgelaufener Code', () => {
  const c = fakeCache(), { token } = neu(c);
  c.tick(601);
  assert.throws(() => s.mbSigHandy({ aktion: 'hochladen', token, b64: foto }, c), /abgelaufen/);
  assert.equal(s.mbSigHandy({ aktion: 'pruefen', token }, c), '0');
  assert.equal(s.mbSigAbholen(token, berta, c).ok, false);
});

test('zweiter Upload wird abgelehnt', () => {
  const c = fakeCache(), { token } = neu(c);
  s.mbSigHandy({ aktion: 'hochladen', token, b64: foto }, c);
  assert.throws(() => s.mbSigHandy({ aktion: 'hochladen', token, b64: foto }, c), /schon ein Foto/);
  assert.equal(s.mbSigHandy({ aktion: 'pruefen', token }, c), '0');
});

test('zu großes Foto und kein Bild', () => {
  const c = fakeCache(), { token } = neu(c);
  assert.throws(() => s.mbSigHandy({ aktion: 'hochladen', token, b64: '/9j/' + 'A'.repeat(89997) }, c), /zu groß/);
  assert.throws(() => s.mbSigHandy({ aktion: 'hochladen', token, b64: 'A'.repeat(200) }, c), /Kein Foto/);
  assert.equal(s.mbSigHandy({ aktion: 'pruefen', token }, c), '1');
});

test('Code mit Sonderzeichen wird nicht angenommen', () => {
  const c = fakeCache();
  neu(c);
  assert.throws(() => s.mbSigHandy({ aktion: 'hochladen', token: '../x', b64: foto }, c), /abgelaufen/);
  assert.equal(s.mbSigHandy({ aktion: 'pruefen', token: '../x' }, c), '0');
  assert.equal(s.mbSigAbholen('../x', berta, c).ok, false);
});
