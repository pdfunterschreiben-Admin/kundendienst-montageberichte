// Was ist noch zu prüfen? Wertet die Übersicht des Servers (mb_uebersicht) aus.
// Im Browser globale Funktionen, in Node über module.exports. gruppieren kommt aus gruppen.js.
const wochenNr = k => Number(k.jahr) * 53 + Number(k.kw);

function offenAuswerten(ueb, gruppieren) {
  const wochen = new Map();
  for (const b of (ueb && ueb.berichte) || []) {
    const k = b.monteur + '|' + b.jahr + '|' + b.kw;
    if (!wochen.has(k)) wochen.set(k, { monteur: b.monteur, jahr: b.jahr, kw: b.kw, berichte: [] });
    wochen.get(k).berichte.push(b);
  }
  const monteure = {}, zuPruefen = [];
  for (const w of wochen.values()) {
    const m = monteure[w.monteur] || (monteure[w.monteur] = { offen: 0, rueckfrage: 0, kws: {} });
    const kw = m.kws[w.jahr + '|' + w.kw] = { offen: 0, rueckfrage: 0, auftraege: 0 };
    for (const g of gruppieren(w.berichte)) {
      const st = (ueb.stand || {})[w.monteur + '|' + w.jahr + '|' + w.kw + '|' + g.datei] || {};
      kw.auftraege++;
      if (st.rueckfrage) { kw.rueckfrage++; m.rueckfrage++; }
      if (!st.abgezeichnet) {
        kw.offen++; m.offen++;
        zuPruefen.push({ monteur: w.monteur, jahr: w.jahr, kw: w.kw, auftrag: g.datei, nr: g.nr, datum: g.datum, rueckfrage: !!st.rueckfrage, korrekturen: st.korrekturen || 0, berichte: g.berichte.length });
      }
    }
  }
  zuPruefen.sort((a, b) => wochenNr(a) - wochenNr(b) || a.monteur.localeCompare(b.monteur) || String(a.auftrag).localeCompare(String(b.auftrag), 'de', { numeric: true }));
  return { monteure, zuPruefen, rueckfragen: zuPruefen.filter(x => x.rueckfrage) };
}

// Eine Woche kommt ins Archiv, wenn alles abgezeichnet ist und sie mindestens 4 Wochen zurückliegt.
// Wochen ohne bekannten Stand (älter als die Übersicht) gelten ab 4 Wochen ebenfalls als Archiv.
function imArchiv(k, info, heute) {
  if (wochenNr(heute) - wochenNr(k) < 4) return false;
  return !info || (info.offen === 0 && info.rueckfrage === 0);
}

if (typeof module !== 'undefined') module.exports = { offenAuswerten, imArchiv };
