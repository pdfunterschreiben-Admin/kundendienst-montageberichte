const test = require('node:test');
const assert = require('node:assert/strict');
const { gruppieren } = require('../web/gruppen.js');
const { offenAuswerten, imArchiv } = require('../web/offen.js');

const B = (monteur, kw, nr, id) => ({ monteur, jahr: 2026, kw, id, nr, art: 'montage', serie: 'RRE-12345' + id, datei: 'MB ' + nr + '.pdf', datum: '2026-11-05', eingang: 1 });
const ueb = {
  berichte: [B('a@x', 45, '100', '1'), B('a@x', 45, '101', '2'), B('a@x', 44, '102', '3'), B('b@x', 45, '200', '4')],
  stand: { 'a@x|2026|45|100': { abgezeichnet: true, rueckfrage: false, korrekturen: 0 }, 'a@x|2026|44|102': { abgezeichnet: false, rueckfrage: true, korrekturen: 1 } },
};

test('offen zählt nicht abgezeichnete Aufträge je Monteur und KW', () => {
  const r = offenAuswerten(ueb, gruppieren);
  assert.equal(r.monteure['a@x'].offen, 2);
  assert.equal(r.monteure['a@x'].kws['2026|45'].offen, 1);
  assert.equal(r.monteure['a@x'].kws['2026|45'].auftraege, 2);
  assert.equal(r.monteure['a@x'].kws['2026|44'].rueckfrage, 1);
  assert.equal(r.monteure['b@x'].offen, 1);
});

test('Liste „Zu prüfen“: alle offenen Aufträge, älteste Woche zuerst', () => {
  const r = offenAuswerten(ueb, gruppieren);
  assert.deepEqual(r.zuPruefen.map(x => x.monteur + ' ' + x.kw + ' ' + x.auftrag), ['a@x 44 102', 'a@x 45 101', 'b@x 45 200']);
  assert.equal(r.zuPruefen[0].rueckfrage, true);
  assert.deepEqual(r.rueckfragen.map(x => x.auftrag), ['102']);
});

test('Archiv: nur ganz abgezeichnete Wochen, die mindestens 4 Wochen alt sind', () => {
  const heute = { jahr: 2026, kw: 46 };
  assert.equal(imArchiv({ jahr: 2026, kw: 40 }, { offen: 0, rueckfrage: 0 }, heute), true);
  assert.equal(imArchiv({ jahr: 2026, kw: 40 }, { offen: 1, rueckfrage: 0 }, heute), false);
  assert.equal(imArchiv({ jahr: 2026, kw: 44 }, { offen: 0, rueckfrage: 0 }, heute), false);
  // älter als die Übersicht (kein Stand bekannt): Archiv
  assert.equal(imArchiv({ jahr: 2025, kw: 10 }, undefined, heute), true);
  assert.equal(imArchiv({ jahr: 2026, kw: 45 }, undefined, heute), false);
});
