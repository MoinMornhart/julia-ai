'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const {
  kmdInit, kmdLr, kmdPredict, kmdStep, kmdStats, kmdQuant, antwortLesen, Kern,
} = require('../src/main/juliakern');

test('Befehle werden korrekt als Zeilen gebaut', () => {
  assert.equal(kmdInit(2, 0.1), 'INIT 2 0.1');
  assert.equal(kmdLr(0.05), 'LR 0.05');
  assert.equal(kmdPredict([1, 0, -1]), 'PREDICT 1 0 -1');
  assert.equal(kmdStep(2, [1, 0]), 'STEP 2 1 0');
  assert.equal(kmdStats(), 'STATS');
  assert.equal(kmdQuant(0.4), 'QUANT 0.4');
});

test('antwortLesen erkennt die Antworttypen', () => {
  assert.deepEqual(antwortLesen('Y 0.2'), { ok: true, typ: 'y', wert: 0.2 });
  assert.deepEqual(antwortLesen('LOSS 4'), { ok: true, typ: 'loss', wert: 4 });
  assert.deepEqual(antwortLesen('OK dim=2 lr=0.1'), { ok: true, typ: 'ok', text: 'dim=2 lr=0.1' });
  assert.deepEqual(antwortLesen('Q 1 -1 0'), { ok: true, typ: 'quant', werte: [1, -1, 0] });
  const s = antwortLesen('STATS epoche=3 schritte=12 loss=0.5 tps=1000');
  assert.equal(s.ok, true);
  assert.deepEqual(s.stats, { epoche: 3, schritte: 12, loss: 0.5, tps: 1000 });
});

test('antwortLesen meldet Fehler/Unbekanntes sauber, ohne zu werfen', () => {
  assert.deepEqual(antwortLesen('ERR erst INIT'), { ok: false, fehler: 'erst INIT' });
  assert.equal(antwortLesen('').ok, false);
  assert.equal(antwortLesen(null).ok, false);
  assert.equal(antwortLesen('QUATSCH 1 2').ok, false);
});

// Fake-Prozess: schreibt eine Antwortzeile auf stdout, sobald eine Befehlszeile
// über stdin ankommt (echoisiert das Protokoll grob), damit sich Kern.frage
// ohne echtes Binary testen lässt.
function fakeProzess(beantworten) {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stdin = {
    write: (zeile) => {
      const antwort = beantworten(zeile.trim());
      // asynchron, wie ein echter Prozess
      setImmediate(() => proc.stdout.emit('data', Buffer.from(`${antwort}\n`)));
      return true;
    },
    end: () => {},
  };
  return proc;
}

test('Kern.frage sendet eine Zeile und liefert die geparste Antwort', async () => {
  const starten = () => fakeProzess((zeile) => {
    if (zeile.startsWith('INIT')) return 'OK dim=2 lr=0.1';
    if (zeile.startsWith('STEP')) return 'LOSS 4';
    return 'ERR unbekannt';
  });
  const kern = new Kern({ pfad: 'egal', starten }).start();
  assert.deepEqual(await kern.frage(kmdInit(2, 0.1)), { ok: true, typ: 'ok', text: 'dim=2 lr=0.1' });
  assert.deepEqual(await kern.frage(kmdStep(2, [1, 0])), { ok: true, typ: 'loss', wert: 4 });
  kern.stop();
});

test('Kern.frage vor start() wirft nicht unkontrolliert, sondern lehnt ab', async () => {
  const kern = new Kern({ pfad: 'egal' });
  await assert.rejects(() => kern.frage('STATS'), /nicht gestartet/);
});

test('offene Anfragen werden bei Kern-Ende sauber abgeschlossen', async () => {
  let procRef = null;
  const starten = () => {
    procRef = fakeProzess(() => 'STATS epoche=0 schritte=0 loss=0 tps=0');
    // Diese Variante antwortet NICHT (überschreibt write), um „hängende" Anfrage zu simulieren.
    procRef.stdin.write = () => true;
    return procRef;
  };
  const kern = new Kern({ pfad: 'egal', starten }).start();
  const p = kern.frage('STATS');
  procRef.emit('close');
  const r = await p;
  assert.equal(r.ok, false);
  assert.match(r.fehler, /beendet/);
});
