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

// ---------------- Task 2: Anfragen ----------------
function fakeAblage() {
  const z = [];
  return {
    zeilen: () => z.slice(),
    anhaengen: o => { z.push(o); },
    unterschriftSpeichern: (mail, b64) => ({ id: 'FILE-' + b64.length, pruefsumme: 'sha-' + b64.length }),
    unterschriftLesen: () => 'PNGDATA',
  };
}
const berta = { mail: 'berta@x', name: 'Berta' };
const carl = { mail: 'carl@x', name: 'Carl' };
const png = 'iVBORw0KGgo=' + 'A'.repeat(10);
const basis = { monteur: 'M@x', jahr: 2026, kw: 46, auftrag: '4711' };
const anfrage = (ev, d, nutzer, ab, t) => s.mbVermerkAnfrage(ev, Object.assign({}, basis, d), nutzer || berta, ab, t || 1000);

test('mb_korrektur hängt eine Zeile mit Name und Zeitpunkt an', () => {
  const ab = fakeAblage();
  const r = anfrage('mb_korrektur', { bereich: 'Arbeitszeit', vorher: '1,5 h', nachher: '2,0 h' }, berta, ab, 5000);
  assert.equal(r.ok, true);
  assert.deepEqual(r.stand.korrekturen[0], { t: 5000, bereich: 'Arbeitszeit', vorher: '1,5 h', nachher: '2,0 h', name: 'Berta' });
  assert.equal(ab.zeilen()[0].mail, 'berta@x');
  assert.equal(ab.zeilen()[0].monteur, 'm@x');
});

test('mb_vermerke liefert nur den angefragten Monteur, das Jahr und die KW', () => {
  const ab = fakeAblage();
  anfrage('mb_korrektur', { bereich: 'Text', nachher: 'a' }, berta, ab);
  anfrage('mb_korrektur', { auftrag: '4712', bereich: 'Text', nachher: 'b' }, berta, ab);
  anfrage('mb_korrektur', { monteur: 'anderer@x', bereich: 'Text', nachher: 'c' }, berta, ab);
  anfrage('mb_korrektur', { kw: 45, bereich: 'Text', nachher: 'd' }, berta, ab);
  const r = anfrage('mb_vermerke', {}, berta, ab);
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.vermerke).sort(), ['4711', '4712']);
  assert.equal(r.vermerke['4711'].korrekturen.length, 1);
});

test('zwei Nutzer nacheinander: beide Zeilen bleiben in Reihenfolge', () => {
  const ab = fakeAblage();
  anfrage('mb_korrektur', { bereich: 'Text', nachher: 'eins' }, berta, ab, 1);
  anfrage('mb_korrektur', { bereich: 'Text', nachher: 'zwei' }, carl, ab, 2);
  assert.deepEqual(ab.zeilen().map(z => z.name), ['Berta', 'Carl']);
  assert.deepEqual(anfrage('mb_vermerke', {}, berta, ab).vermerke['4711'].korrekturen.map(k => k.nachher), ['eins', 'zwei']);
});

test('Auftrag mit Umlauten und Leerzeichen bleibt unverändert der Schlüssel', () => {
  const ab = fakeAblage();
  const a = 'ohne Auftragsnummer Ä-12 ö';
  anfrage('mb_korrektur', { auftrag: a, bereich: 'Text', nachher: 'x' }, berta, ab);
  assert.deepEqual(Object.keys(anfrage('mb_vermerke', {}, berta, ab).vermerke), [a]);
});

test('Schreiben ohne Auftrag wird abgelehnt', () => {
  const r = anfrage('mb_korrektur', { auftrag: '', bereich: 'Text', nachher: 'x' }, berta, fakeAblage());
  assert.deepEqual(r, { ok: false, error: 'Auftrag fehlt.' });
});

test('mb_klaerung setzen und erledigen', () => {
  const ab = fakeAblage();
  assert.equal(anfrage('mb_klaerung', { aktion: 'erledigt' }, berta, ab).error, 'Es ist keine Rückfrage offen.');
  assert.equal(anfrage('mb_klaerung', { aktion: 'setzen', text: 'Zeit?' }, berta, ab).stand.klaerung.offen, true);
  assert.equal(anfrage('mb_klaerung', { aktion: 'erledigt' }, carl, ab).stand.klaerung.offen, false);
  assert.equal(anfrage('mb_klaerung', { aktion: 'quatsch' }, carl, ab).error, 'Unbekannte Anfrage.');
});

test('mb_abzeichnen prüft die Unterschrift und merkt die ID', () => {
  const ab = fakeAblage();
  assert.equal(anfrage('mb_abzeichnen', { unterschrift: '' }, berta, ab).error, 'Bitte zuerst die Unterschrift hinterlegen.');
  assert.equal(anfrage('mb_abzeichnen', { unterschrift: 'AAAA' }, berta, ab).error, 'Unterschrift ungültig.');
  assert.equal(anfrage('mb_abzeichnen', { unterschrift: 'iVBOR' + 'A'.repeat(200000) }, berta, ab).error, 'Unterschrift ungültig.');
  const r = anfrage('mb_abzeichnen', { unterschrift: png }, berta, ab, 7);
  assert.equal(r.ok, true);
  assert.deepEqual(r.stand.abzeichnung, { name: 'Berta', t: 7, unterschriftId: 'FILE-' + png.length });
});

test('Korrektur nach der Abzeichnung hebt sie auf, Abzeichnen bei offener Rückfrage geht nicht', () => {
  const ab = fakeAblage();
  anfrage('mb_abzeichnen', { unterschrift: png }, berta, ab, 1);
  assert.equal(anfrage('mb_abzeichnen', { unterschrift: png }, berta, ab, 2).error, 'Schon abgezeichnet.');
  assert.equal(anfrage('mb_korrektur', { bereich: 'Text', nachher: 'x' }, carl, ab, 3).stand.abzeichnung, null);
  anfrage('mb_klaerung', { aktion: 'setzen', text: 'Frage' }, carl, ab, 4);
  assert.equal(anfrage('mb_abzeichnen', { unterschrift: png }, berta, ab, 5).error, 'Rückfrage noch offen – erst als geklärt markieren.');
});

test('mb_unterschrift_datei nur für bekannte IDs', () => {
  const ab = fakeAblage();
  const id = anfrage('mb_abzeichnen', { unterschrift: png }, berta, ab).stand.abzeichnung.unterschriftId;
  // Das Feld heißt datei (wie bei mb_datei): id ist in jeder Anfrage die Rechner-ID des Programms
  assert.deepEqual(s.mbVermerkAnfrage('mb_unterschrift_datei', { datei: id, id: 'RECHNER' }, berta, ab, 1), { ok: true, b64: 'PNGDATA' });
  assert.deepEqual(s.mbVermerkAnfrage('mb_unterschrift_datei', { datei: 'FREMD' }, berta, ab, 1), { ok: false, error: 'Unterschrift nicht gefunden.' });
  assert.deepEqual(s.mbVermerkAnfrage('mb_unterschrift_datei', { id }, berta, ab, 1), { ok: false, error: 'Unterschrift nicht gefunden.' });
});

test('unbekanntes Ereignis', () => {
  assert.deepEqual(anfrage('mb_loeschen', {}, berta, fakeAblage()), { ok: false, error: 'Unbekannte Anfrage.' });
});

// ---- Übersicht für „Zu prüfen“, Zahlen je Monteur/KW und Archiv ----
const zeile = (mail, jahr, kw, nr, id) => [new Date(1000), 'Max', mail, '2026-11-05', jahr, kw, nr, 'montage', 'RRE-1234567', nr + '.pdf', id, 'sha'];
const v = (ereignis, mail, jahr, kw, auftrag, t, extra) => Object.assign({ t, ereignis, monteur: mail, jahr, kw, auftrag, bereich: '', vorher: '', nachher: '', text: '', name: 'X', mail: 'x@x', unterschriftId: '' }, extra || {});
const datumText = d => d instanceof Date ? '2026-11-05' : String(d);

test('mbUebersicht: Berichte der letzten Wochen mit Monteur und KW, ältere nicht', () => {
  // 26 Wochen bis KW 46/2026: ab KW 21/2026; über den Jahreswechsel zählt die Woche weiter
  const r = s.mbUebersicht([zeile('a@x', 2026, 45, '1', 'F1'), zeile('b@x', 2026, 21, '2', 'F2'), zeile('b@x', 2026, 20, '4', 'F4'), zeile('a@x', 2025, 50, '3', 'F3')], [], { jahr: 2026, kw: 46 }, 26, datumText);
  assert.deepEqual(r.berichte.map(b => [b.monteur, b.jahr, b.kw, b.id]), [['a@x', 2026, 45, 'F1'], ['b@x', 2026, 21, 'F2']]);
  const neujahr = s.mbUebersicht([zeile('a@x', 2025, 50, '3', 'F3')], [], { jahr: 2026, kw: 2 }, 26, datumText);
  assert.equal(neujahr.berichte.length, 1);
  assert.equal(r.berichte[0].nr, '1');
});

test('mbUebersicht: Stand je Auftrag in Kurzform (abgezeichnet, Rückfrage, Korrekturen)', () => {
  const r = s.mbUebersicht([zeile('a@x', 2026, 45, '1', 'F1')], [
    v('korrektur', 'a@x', 2026, 45, '1', 1), v('abzeichnung', 'a@x', 2026, 45, '1', 2),
    v('klaerung_setzen', 'a@x', 2026, 45, '2', 3, { text: '?' }),
  ], { jahr: 2026, kw: 46 }, 26, datumText);
  assert.deepEqual(r.stand['a@x|2026|45|1'], { abgezeichnet: true, rueckfrage: false, korrekturen: 1 });
  assert.deepEqual(r.stand['a@x|2026|45|2'], { abgezeichnet: false, rueckfrage: true, korrekturen: 0 });
});

test('mbOhneTestberichte: Berichte vom Testkonto fallen für alle anderen Nutzer weg', () => {
  const zeilen = [
    [0, 'Anna', 'anna@firma.de'],
    [0, 'Test', 'BenjaminStockey@Gmail.com'],
    [0, 'Ben', 'b.stockey@schlueter-gabelstapler.de'],
  ];
  const test = ['benjaminstockey@gmail.com'];
  assert.deepEqual(s.mbOhneTestberichte(zeilen, test).map(r => r[1]), ['Anna', 'Ben']);
  assert.equal(s.mbOhneTestberichte([], test).length, 0);
});
