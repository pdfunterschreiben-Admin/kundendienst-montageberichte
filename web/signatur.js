// Unterschrift aus einem Foto freistellen: Papier durchsichtig machen, Rand zuschneiden.
// Im Browser als globale Funktion, in Node (Tests) über module.exports.
// pixel: RGBA (Uint8ClampedArray), Rückgabe: {pixel, breite, hoehe} oder null, wenn kein Strich erkannt wurde.
function freistellen(pixel, breite, hoehe) {
  const RAND = 6, BLOCK = 32, MIN_STRICHPIXEL = 30;
  const n = breite * hoehe, hell = new Float32Array(n);
  for (let i = 0; i < n; i++) hell[i] = 0.299 * pixel[i * 4] + 0.587 * pixel[i * 4 + 1] + 0.114 * pixel[i * 4 + 2];

  // Papierhelligkeit je Block (90. Perzentil), damit Schatten und Helligkeitsverläufe nicht stören
  const bw = Math.ceil(breite / BLOCK), bh = Math.ceil(hoehe / BLOCK), papier = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const x0 = bx * BLOCK, y0 = by * BLOCK, x1 = Math.min(breite, x0 + BLOCK), y1 = Math.min(hoehe, y0 + BLOCK);
    const werte = new Float32Array((x1 - x0) * (y1 - y0));
    let k = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) werte[k++] = hell[y * breite + x];
    werte.sort();
    papier[by * bw + bx] = Math.max(1, werte[Math.floor(0.9 * (werte.length - 1))]);
  }

  const a = new Uint8ClampedArray(n);
  let strich = 0, minX = breite, minY = hoehe, maxX = -1, maxY = -1;
  for (let y = 0; y < hoehe; y++) for (let x = 0; x < breite; x++) {
    const p = papier[Math.floor(y / BLOCK) * bw + Math.floor(x / BLOCK)];
    const v = Math.min(1, Math.max(0, (0.8 * p - hell[y * breite + x]) / (0.35 * p))) * 255;
    a[y * breite + x] = v;
    if (v > 128) strich++;
    if (v > 40) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (strich < MIN_STRICHPIXEL) return null;

  const x0 = Math.max(0, minX - RAND), y0 = Math.max(0, minY - RAND), x1 = Math.min(breite - 1, maxX + RAND), y1 = Math.min(hoehe - 1, maxY + RAND);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, aus = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const q = ((y0 + y) * breite + (x0 + x)), o = (y * cw + x) * 4;
    aus[o] = pixel[q * 4]; aus[o + 1] = pixel[q * 4 + 1]; aus[o + 2] = pixel[q * 4 + 2]; aus[o + 3] = a[q];
  }
  return { pixel: aus, breite: cw, hoehe: ch };
}

if (typeof module !== 'undefined') module.exports = { freistellen };
