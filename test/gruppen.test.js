const test = require('node:test');
const assert = require('node:assert/strict');
const { gruppieren } = require('../web/gruppen.js');

// So kommen die Herford-Berichte (KW 45) vom Server: die Service-Mappe hat Montageberichte mit „DGUV“
// im Namen oder Text als DGUV erkannt, und bei den echten DGUV-Prüfprotokollen fehlen Nummer und Serien-Nr.
let n = 0;
const B = (nr, art, serie, datei) => ({ id: String(++n), nr, art, serie, datei, datum: '2026-11-05', eingang: n });
const herford = () => { n = 0; return [
  B('25706666', 'uvv', 'RRE140H-7080017', 'UVV #7080017_unterschrieben.pdf'),
  B('25706666', 'dguv', 'RRE140H-7080017', 'MB #7080017 Wartung_unterschrieben.pdf'),
  B('', 'dguv', 'RRE140H', 'DGUV #7080017_unterschrieben.pdf'),
  B('25707054', 'dguv', 'RRE140H-7080018', 'MB #7080018 DGUV_unterschrieben.pdf'),
  B('', 'dguv', 'RRE140H', 'DGUV #7080018_unterschrieben.pdf'),
  B('25707057', 'dguv', 'LPE250-7106189', 'MB #7106189 DGUV_unterschrieben.pdf'),
  B('25707060', 'montage', 'LPE250-7106189', 'MB #7106189 Gewaltschaden_unterschrieben.pdf'),
  B('', 'dguv', 'LPE250', 'DGUV #7106189_unterschrieben.pdf'),
  B('', 'dguv', 'LPE250', 'DGUV #9999999_unterschrieben.pdf'),
]; };
const inhalt = (gs, nr) => gs.find(g => g.nr === nr).berichte.map(b => b.art + ' ' + b.datei.split('_')[0]);

test('Montagebericht vorn, auch wenn die Service-Mappe ihn als DGUV gemeldet hat', () => {
  assert.deepEqual(inhalt(gruppieren(herford()), '25706666'),
    ['montage MB #7080017 Wartung', 'uvv UVV #7080017', 'dguv DGUV #7080017']);
});

test('DGUV-Prüfprotokoll ohne Nummer kommt über die Seriennummer im Dateinamen zum Auftrag', () => {
  assert.deepEqual(inhalt(gruppieren(herford()), '25707054'), ['montage MB #7080018 DGUV', 'dguv DGUV #7080018']);
});

test('bei zwei Aufträgen für denselben Stapler geht das DGUV-Protokoll zum DGUV-Auftrag', () => {
  const gs = gruppieren(herford());
  assert.deepEqual(inhalt(gs, '25707057'), ['montage MB #7106189 DGUV', 'dguv DGUV #7106189']);
  assert.deepEqual(inhalt(gs, '25707060'), ['montage MB #7106189 Gewaltschaden']);
});

test('ohne passenden Auftrag bleibt ein Bericht einzeln, nie nach dem Typ zusammengefasst', () => {
  const ohne = gruppieren(herford()).filter(g => !g.nr);
  assert.equal(ohne.length, 1);
  assert.equal(ohne[0].berichte.length, 1);
  assert.match(ohne[0].datei, /^ohne Auftragsnummer DGUV #9999999/);
});

test('ohne erkennbaren Dateinamen bleibt die Art der Service-Mappe', () => {
  const gs = gruppieren([{ id: '1', nr: '1', art: 'uvv', serie: '', datei: 'Bericht.pdf', datum: '', eingang: 1 }]);
  assert.equal(gs[0].berichte[0].art, 'uvv');
});
