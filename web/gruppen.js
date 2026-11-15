// Berichte einer Kalenderwoche zu Aufträgen zusammenfassen (eine PDF je Auftrag:
// erst Montagebericht, dann UVV, dann DGUV). Im Browser globale Funktionen, in Node über module.exports.
const ART_ORDNUNG = { montage: 0, uvv: 1, dguv: 2 };
const normSer = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
const normNr = s => String(s || '').trim().toUpperCase().replace(/\s+/g, '');
// Nur eine echte Seriennummer (mind. 5 Ziffern) verbindet Berichte – der Typ allein („LPE250“) nicht
const serOk = s => (normSer(s).match(/\d/g) || []).length >= 5;

// Der Dateiname zählt vor der Erkennung der Service-Mappe: „MB … DGUV“ ist ein Montagebericht über eine
// DGUV-Prüfung, kein DGUV-Protokoll.
function artVon(b) {
  const n = String(b.datei || '').trim().toLowerCase();
  if (/^(mb|montage|service)/.test(n)) return 'montage';
  if (/^uvv/.test(n)) return 'uvv';
  if (/^(dguv|v3)/.test(n)) return 'dguv';
  return b.art;
}

// Woran sich ein Stapler erkennen lässt: Ziffernfolgen (mind. 5) aus Serien-Nr. und Dateiname, z. B. 7080018
function merkmale(b) {
  const m = new Set(), nr = normNr(b.nr);
  for (const quelle of [b.serie, String(b.datei || '').replace(/\.pdf$/i, '')])
    for (const z of String(quelle || '').match(/\d{5,}/g) || []) if (z !== nr) m.add(z);
  if (serOk(b.serie)) m.add('S:' + normSer(b.serie));
  return m;
}

function gruppieren(berichte) {
  const g = new Map();
  const liste = berichte.map(b => Object.assign({}, b, { art: artVon(b) }));
  const neu = (key, nr, b) => { if (!g.has(key)) g.set(key, { key, nr, serie: b.serie, berichte: [], merk: new Set() }); return g.get(key); };
  const ohneNr = [];
  for (const b of liste) {
    const k = normNr(b.nr);
    if (!k) { ohneNr.push(b); continue; }
    const x = neu(k, k, b); x.berichte.push(b); merkmale(b).forEach(z => x.merk.add(z));
    if (!serOk(x.serie) && serOk(b.serie)) x.serie = b.serie;
  }
  const mitNr = [...g.values()];
  for (const b of ohneNr) {
    const mb = merkmale(b);
    const kand = mitNr.filter(x => [...mb].some(z => x.merk.has(z)));
    // Mehrere Aufträge für denselben Stapler: der, dessen Montagebericht die Prüfung im Namen trägt
    const wort = b.art === 'dguv' ? 'dguv' : b.art === 'uvv' ? 'uvv' : '';
    const ziel = (wort && kand.find(x => x.berichte.some(o => o.art === 'montage' && String(o.datei).toLowerCase().includes(wort))))
      || kand.find(x => x.berichte.some(o => o.art === 'montage')) || kand[0];
    if (ziel) ziel.berichte.push(b);
    else neu('ohne:' + (serOk(b.serie) ? normSer(b.serie) : b.id), '', b).berichte.push(b);
  }
  const alle = [...g.values()];
  for (const x of alle) {
    delete x.merk;
    x.berichte.sort((a, b) => (ART_ORDNUNG[a.art] ?? 9) - (ART_ORDNUNG[b.art] ?? 9) || normSer(a.serie).localeCompare(normSer(b.serie)) || a.eingang - b.eingang);
    x.datei = x.nr ? x.nr : 'ohne Auftragsnummer ' + (serOk(x.serie) ? x.serie : x.berichte[0].datei.replace(/\.pdf$/i, ''));
    x.datum = x.berichte.map(b => b.datum).sort()[0] || '';
    x.ids = x.berichte.map(b => b.id).join(',');
  }
  return alle.sort((a, b) => (a.nr ? 0 : 1) - (b.nr ? 0 : 1) || a.datum.localeCompare(b.datum) || a.datei.localeCompare(b.datei, 'de', { numeric: true }));
}

if (typeof module !== 'undefined') module.exports = { gruppieren, artVon, ART_ORDNUNG };
