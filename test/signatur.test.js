const test = require('node:test');
const assert = require('node:assert/strict');
const { freistellen } = require('../web/signatur.js');

// Graustufenbild als RGBA; fn(x, y) gibt die Helligkeit zurück
function bild(w, h, fn) {
  const p = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, v = fn(x, y);
    p[i] = p[i + 1] = p[i + 2] = v; p[i + 3] = 255;
  }
  return p;
}
const alpha = (r, x, y) => r.pixel[(y * r.breite + x) * 4 + 3];

test('macht das Papier durchsichtig und behält den Strich', () => {
  const p = bild(120, 80, (x, y) => (x >= 40 && x <= 79 && y >= 30 && y <= 33) ? 40 : 230);
  const r = freistellen(p, 120, 80);
  assert.equal(r.breite, 52);
  assert.equal(r.hoehe, 16);
  assert.equal(alpha(r, 0, 0), 0);
  assert.ok(alpha(r, 26, 7) >= 200);
  assert.equal(r.pixel[(7 * 52 + 26) * 4], 40);
});

test('Papier im Schatten (Verlauf von 150 bis 230)', () => {
  const p = bild(120, 80, (x, y) => (x >= 50 && x <= 79 && y >= 30 && y <= 33) ? 30 : Math.round(150 + 80 * x / 119));
  const r = freistellen(p, 120, 80);
  assert.notEqual(r, null);
  assert.equal(alpha(r, 0, 0), 0);
  assert.equal(alpha(r, r.breite - 1, r.hoehe - 1), 0);
  assert.equal(alpha(r, 0, r.hoehe - 1), 0);
});

test('leeres Blatt gibt null', () => {
  assert.equal(freistellen(bild(120, 80, () => 230), 120, 80), null);
});

test('nur zehn dunkle Pixel (Fleck) geben null', () => {
  assert.equal(freistellen(bild(120, 80, (x, y) => (y === 40 && x >= 50 && x < 60) ? 40 : 230), 120, 80), null);
});

test('sehr kleines Foto (30x20) mit Unterschrift geht', () => {
  const r = freistellen(bild(30, 20, (x, y) => (x >= 5 && x < 25 && y >= 8 && y < 10) ? 40 : 230), 30, 20);
  assert.notEqual(r, null);
  assert.ok(r.breite <= 30 && r.hoehe <= 20);
  assert.ok(r.pixel.some((v, i) => i % 4 === 3 && v >= 200));
});

const { nurTinte } = require('../web/signatur.js');
// RGBA mit voller Deckkraft; fn(x, y) gibt [r, g, b] zurück
function farbbild(w, h, fn) {
  const p = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, c = fn(x, y); p[i] = c[0]; p[i + 1] = c[1]; p[i + 2] = c[2]; p[i + 3] = 255; }
  return p;
}

test('nurTinte: bei blauer Unterschrift verschwinden schwarze Linien', () => {
  const p = farbbild(40, 20, (x, y) => y < 10 ? [30, 50, 200] : [20, 20, 20]);
  nurTinte(p);
  assert.equal(p[(2 * 40 + 5) * 4 + 3], 255, 'blau bleibt');
  assert.equal(p[(15 * 40 + 5) * 4 + 3], 0, 'schwarz wird durchsichtig');
});

test('nurTinte: schwarze Unterschrift bleibt unverändert', () => {
  const p = farbbild(40, 20, () => [20, 20, 20]);
  nurTinte(p);
  assert.ok([...p].every((v, i) => i % 4 !== 3 || v === 255));
});
