const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('../server/Montageberichte.js');

const e = (ereignis, t, extra) => Object.assign({ t, ereignis, bereich: '', vorher: '', nachher: '', text: '', name: 'X', mail: 'x@x', unterschriftId: '' }, extra || {});

test('mbStand: leerer Verlauf', () => {
  assert.deepEqual(s.mbStand([]), { korrekturen: [], klaerung: null, abzeichnung: null, schluessel: '0:0' });
});

test('mbStand: Korrekturen bleiben in Reihenfolge, Schlüssel zählt mit', () => {
  const st = s.mbStand([
    e('korrektur', 10, { bereich: 'Text', vorher: 'a', nachher: 'b', name: 'Anna' }),
    e('korrektur', 20, { bereich: 'Arbeitszeit', vorher: '1', nachher: '2', name: 'Bob' }),
  ]);
  assert.equal(st.korrekturen.length, 2);
  assert.deepEqual(st.korrekturen.map(k => k.bereich), ['Text', 'Arbeitszeit']);
  assert.equal(st.korrekturen[1].name, 'Bob');
  assert.equal(st.schluessel, '2:20');
});

test('mbStand: Abzeichnung gilt nur, wenn danach nichts korrigiert wurde', () => {
  const basis = [e('korrektur', 1), e('abzeichnung', 2, { name: 'Anna', unterschriftId: 'U1' })];
  assert.deepEqual(s.mbStand(basis).abzeichnung, { name: 'Anna', t: 2, unterschriftId: 'U1' });
  assert.equal(s.mbStand(basis.concat([e('korrektur', 3)])).abzeichnung, null);
  assert.equal(s.mbStand(basis.concat([e('klaerung_setzen', 3, { text: 'x' })])).abzeichnung, null);
});

test('mbStand: Rückfrage erledigt hebt eine Abzeichnung nicht auf', () => {
  const st = s.mbStand([e('klaerung_setzen', 1, { text: 'x' }), e('abzeichnung', 2, { name: 'Anna', unterschriftId: 'U1' }), e('klaerung_erledigt', 3)]);
  assert.notEqual(st.abzeichnung, null);
  assert.equal(st.klaerung.offen, false);
});

test('mbStand: die letzte Rückfrage-Meldung zählt', () => {
  const a = s.mbStand([e('klaerung_setzen', 1, { text: 'Zeit?', name: 'Anna' }), e('klaerung_erledigt', 2, { name: 'Bob' })]);
  assert.equal(a.klaerung.offen, false);
  assert.equal(a.klaerung.name, 'Bob');
  const b = s.mbStand([e('klaerung_setzen', 1, { text: 'Zeit?' }), e('klaerung_erledigt', 2), e('klaerung_setzen', 3, { text: 'neu' })]);
  assert.equal(b.klaerung.offen, true);
  assert.equal(b.klaerung.text, 'neu');
});

const leer = s.mbStand([]);
const offen = s.mbStand([e('klaerung_setzen', 1, { text: 'x' })]);
const abgezeichnet = s.mbStand([e('abzeichnung', 1, { name: 'A', unterschriftId: 'U' })]);

test('mbVermerkPruefen: Korrektur', () => {
  const ok = { bereich: 'Text', vorher: 'a', nachher: 'b', text: '' };
  assert.equal(s.mbVermerkPruefen('korrektur', ok, leer), null);
  assert.equal(s.mbVermerkPruefen('korrektur', Object.assign({}, ok, { bereich: 'Quatsch' }), leer), 'Unbekannter Bereich.');
  assert.equal(s.mbVermerkPruefen('korrektur', Object.assign({}, ok, { nachher: '' }), leer), 'Bitte angeben, was richtig ist.');
  assert.equal(s.mbVermerkPruefen('korrektur', Object.assign({}, ok, { nachher: 'x'.repeat(501) }), leer), 'Text zu lang.');
  assert.equal(s.mbVermerkPruefen('korrektur', Object.assign({}, ok, { vorher: 'x'.repeat(501) }), leer), 'Text zu lang.');
});

test('mbVermerkPruefen: Rückfrage', () => {
  assert.equal(s.mbVermerkPruefen('klaerung_setzen', { text: '  ' }, leer), 'Bitte die Rückfrage beschreiben.');
  assert.equal(s.mbVermerkPruefen('klaerung_setzen', { text: 'x'.repeat(1001) }, leer), 'Text zu lang.');
  assert.equal(s.mbVermerkPruefen('klaerung_setzen', { text: 'Zeit?' }, leer), null);
  assert.equal(s.mbVermerkPruefen('klaerung_erledigt', {}, leer), 'Es ist keine Rückfrage offen.');
  assert.equal(s.mbVermerkPruefen('klaerung_erledigt', {}, offen), null);
});

test('mbVermerkPruefen: Abzeichnen', () => {
  assert.equal(s.mbVermerkPruefen('abzeichnung', {}, offen), 'Rückfrage noch offen – erst als geklärt markieren.');
  assert.equal(s.mbVermerkPruefen('abzeichnung', {}, abgezeichnet), 'Schon abgezeichnet.');
  assert.equal(s.mbVermerkPruefen('abzeichnung', {}, leer), null);
});
