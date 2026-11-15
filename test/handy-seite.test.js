const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const seite = fs.readFileSync(path.join(__dirname, '..', 'docs', 'handy', 'index.html'), 'utf8');

test('Handy-Seite spricht den Anmeldeserver mit dem Ereignis h_sig an', () => {
  assert.ok(seite.includes('event: "h_sig"'));
  assert.ok(seite.includes('aktion: "hochladen"'));
  assert.ok(seite.includes('aktion: "pruefen"'));
  assert.ok(seite.includes('"Content-Type": "text/plain;charset=utf-8"'));
  assert.ok(seite.includes('credentials: "omit"'));
  assert.ok(seite.includes('https://script.google.com/macros/s/AKfycbwj7l1K2RcGtPUu4wdRFjI7NLayzAtqjx0_XorzQmMNEqh-JyuEaOrUlOEN1BT9HVSC/exec'));
});

test('Handy-Seite öffnet die Kamera und liest den Code aus ?sig=', () => {
  assert.ok(seite.includes('capture="environment"'));
  assert.ok(seite.includes('get("sig")'));
  assert.ok(seite.includes('90000'));
});
