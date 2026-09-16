'use strict';

const fs = require('fs');
const path = require('path');

// Start-Selbstprüfung: Julia soll nie still verschwinden. Bevor das erste
// Fenster entsteht, schreibt sie ein Logbuch, prüft Schreibrechte und die
// mitgegebenen Flags und merkt sich, ob sie wegen GPU-Abstürzen auf
// Software-Rendering ausweichen muss. Läuft etwas schief, sieht der Nutzer
// eine klare Meldung mit Knöpfen zum Logbuch – nie einen wortlosen Abbruch.

const LOG_MAX = 512 * 1024; // ab dieser Größe wird das Logbuch gedreht
const LOG_ALTE = 3; // so viele alte Logbücher bleiben erhalten
const GPU_SCHWELLE = 2; // so viele GPU-Abstürze, dann Software-Rendering

// Flags, die Julia selbst kennt (der Rest wird nur mit einer Warnung geduldet).
const BEKANNTE_FLAGS = new Set([
  '--versteckt', '--updated', '--force-run', '--allow-file-access-from-files',
  '--enable-logging', '--disable-gpu', '--no-sandbox', '/s',
]);

// Chromium-Flags, die sich gegenseitig aufheben und den GPU-Prozess abstürzen
// lassen können. Tauchen beide auf, weicht Julia gleich auf Software aus.
const KONFLIKTE = [['--use-gl=swiftshader', '--disable-software-rasterizer']];

const jetztText = () => new Date().toISOString();

// --- Logbuch mit einfacher Rotation ---

class Logbuch {
  constructor(datei) {
    this.datei = datei;
  }

  _drehen() {
    try {
      if (!fs.existsSync(this.datei) || fs.statSync(this.datei).size < LOG_MAX) return;
      fs.rmSync(`${this.datei}.${LOG_ALTE}`, { force: true });
      for (let i = LOG_ALTE - 1; i >= 1; i--) {
        if (fs.existsSync(`${this.datei}.${i}`)) fs.renameSync(`${this.datei}.${i}`, `${this.datei}.${i + 1}`);
      }
      fs.renameSync(this.datei, `${this.datei}.1`);
    } catch { /* Rotation ist nur Kosmetik – lieber weiterschreiben */ }
  }

  schreiben(stufe, text, daten) {
    try {
      this._drehen();
      const zusatz = daten ? ' ' + JSON.stringify(daten) : '';
      fs.appendFileSync(this.datei, `${jetztText()} [${stufe}] ${text}${zusatz}\n`);
    } catch { /* kein Logbuch möglich – das darf den Start nicht aufhalten */ }
  }
}

// Öffnet das Logbuch im Datenordner. Scheitert das Anlegen des Ordners, gibt es
// trotzdem ein Logbuch zurück, das seine Schreibfehler still schluckt.
function logbuchOeffnen(datenOrdner) {
  try { fs.mkdirSync(datenOrdner, { recursive: true }); } catch { /* siehe schreibbar() */ }
  return new Logbuch(path.join(datenOrdner, 'start.log'));
}

// --- Flags prüfen ---

// Trennt Flags von den übrigen Argumenten und meldet Unbekanntes sowie
// widersprüchliche Kombinationen. Julia bricht daran nie ab – sie warnt nur.
function flaggenPruefen(argv) {
  const flaggen = (argv || []).slice(1).filter((a) => a.startsWith('-') || a.startsWith('/'));
  const nname = (f) => f.split('=')[0].toLowerCase();
  const warnungen = [];
  const unbekannt = flaggen.filter((f) => !BEKANNTE_FLAGS.has(nname(f)));
  for (const f of unbekannt) warnungen.push(`Unbekanntes Startflag wird ignoriert: ${f}`);
  let konflikt = false;
  const roh = new Set(flaggen.map((f) => f.toLowerCase()));
  for (const paar of KONFLIKTE) {
    if (paar.every((f) => roh.has(f))) {
      konflikt = true;
      warnungen.push(`Widersprüchliche Grafik-Flags (${paar.join(' + ')}) – Julia nutzt Software-Rendering.`);
    }
  }
  return { flaggen, unbekannt, konflikt, warnungen };
}

// --- Schreibrechte ---

// Legt den Datenordner an und prüft, ob wirklich hineingeschrieben werden kann.
// Wirft mit einer verständlichen Ursache, statt später wortlos zu scheitern.
function schreibbarPruefen(ordner) {
  try {
    fs.mkdirSync(ordner, { recursive: true });
    const probe = path.join(ordner, `.schreibprobe-${process.pid}`);
    fs.writeFileSync(probe, 'ok');
    fs.rmSync(probe, { force: true });
  } catch (e) {
    throw new Error(`Julia kann in ihren Datenordner nicht schreiben (${ordner}): ${e.message}`);
  }
}

// --- Software-Rendering merken ---
// Ein reines Markierungsdatei-Verfahren, weil die Entscheidung schon vor dem
// Laden der Konfiguration (vor app.whenReady) feststehen muss.

function _marker(ordner) {
  return path.join(ordner, 'software-rendering');
}

function softwareRendering(ordner) {
  try { return fs.existsSync(_marker(ordner)); } catch { return false; }
}

function softwareRenderingSetzen(ordner, an) {
  try {
    if (an) fs.writeFileSync(_marker(ordner), `${jetztText()}\n`);
    else fs.rmSync(_marker(ordner), { force: true });
  } catch { /* nicht schlimm: dann greift es beim nächsten Start eben nicht */ }
}

// --- Fehlermeldung mit Knöpfen ---

// Zeigt eine native Meldung mit klarer Ursache und Knöpfen zum Logbuch. Gibt
// den gewählten Knopf zurück. Braucht ein bereites app-Objekt (dialog).
async function fehlerDialog({ app, dialog, shell, titel = 'Julia', text, logDatei, ordner }) {
  try {
    await app.whenReady();
  } catch { /* wenn selbst das scheitert, bleibt nur der Text unten */ }
  const knoepfe = ['Schließen'];
  if (logDatei) knoepfe.push('Logdatei öffnen');
  if (ordner) knoepfe.push('Ordner im Explorer zeigen');
  const voll = logDatei ? `${text}\n\nEinzelheiten stehen im Logbuch:\n${logDatei}` : text;
  let wahl = 0;
  try {
    wahl = dialog.showMessageBoxSync({ type: 'error', title: titel, message: titel, detail: voll, buttons: knoepfe, defaultId: 0, noLink: true });
  } catch {
    try { dialog.showErrorBox(titel, voll); } catch { /* nichts mehr möglich */ }
    return 0;
  }
  const gewaehlt = knoepfe[wahl];
  try {
    if (gewaehlt === 'Logdatei öffnen' && logDatei) shell.openPath(logDatei);
    else if (gewaehlt === 'Ordner im Explorer zeigen' && ordner) shell.showItemInFolder(logDatei || ordner);
  } catch { /* Explorer nicht erreichbar */ }
  return wahl;
}

// --- GPU-Abstürze überwachen ---

// Hört auf abgestürzte Kind- und Renderer-Prozesse. Stürzt der GPU-Prozess
// wiederholt ab, merkt sich Julia Software-Rendering, sagt es dem Nutzer einmal
// und bietet einen Neustart an. Gibt eine Funktion zum Abschalten zurück.
//
// Wichtig für den Fall, dass der GPU-Prozess schon beim Start in Serie abstürzt
// und Chromium ganz aufgibt ("GPU process isn't usable. Goodbye."): Passiert der
// erste GPU-Absturz kurz nach dem Start, wird der Software-Rendering-Merker
// SOFORT gesetzt. So startet Julia beim nächsten Mal sicher, selbst wenn sie
// diesmal noch abstürzt, bevor der Neustart greift.
const ECHTER_CRASH = /crashed|oom|launch-failed|integrity-failure|abnormal-exit/;

function gpuUeberwachen({ app, logbuch, datenOrdner, melden, neustart, fatal, schwelle = GPU_SCHWELLE, jetzt = Date.now, startFensterMs = 20000 }) {
  let gpuAbstuerze = 0;
  let rendererAbstuerze = 0;
  let gemeldet = false;
  let neugestartet = false;
  const start = jetzt();
  const imStart = () => jetzt() - start < startFensterMs;

  const ausweichen = () => {
    if (gemeldet) return;
    gemeldet = true;
    softwareRenderingSetzen(datenOrdner, true);
    logbuch.schreiben('GPU', 'Wiederholter GPU-Absturz – Software-Rendering wird ab dem nächsten Start genutzt.');
    if (melden) melden();
    if (neustart) neustart();
  };

  // Absturz gleich beim Start (schwarzes Fenster): einmal auf Software-Rendering
  // umstellen und SOFORT neu starten, damit der Nutzer nicht auf ein totes Fenster
  // starrt. Crasht es auch mit Software-Rendering, wird nicht endlos neu gestartet,
  // sondern eine klare Meldung gezeigt.
  const startAbsichern = (grund) => {
    if (neugestartet || gemeldet) return;
    if (!softwareRendering(datenOrdner)) {
      neugestartet = true;
      softwareRenderingSetzen(datenOrdner, true);
      logbuch.schreiben('GPU', `${grund} beim Start – Software-Rendering ist ab jetzt aktiv, ich starte neu.`);
      if (neustart) neustart();
    } else {
      gemeldet = true;
      logbuch.schreiben('FATAL', `${grund} trotz Software-Rendering – Start abgesichert abgebrochen.`);
      if (fatal) fatal(`${grund}: Julia startet nicht sauber, auch nicht mit Software-Grafik. Einzelheiten im Logbuch.`);
    }
  };

  const beiKind = (_e, d) => {
    logbuch.schreiben('CRASH', `Kindprozess weg: ${d.type}`, { grund: d.reason, code: d.exitCode });
    if (d.type === 'GPU' && d.reason !== 'clean-exit') {
      gpuAbstuerze += 1;
      if (imStart()) { startAbsichern('GPU-Absturz'); return; }
      if (gpuAbstuerze >= schwelle) ausweichen();
    }
  };
  const beiRenderer = (_e, _wc, d) => {
    logbuch.schreiben('CRASH', 'Renderer weg', { grund: d.reason, code: d.exitCode });
    if (!ECHTER_CRASH.test(String(d.reason || ''))) return; // sauber beendet/abgeschossen: nichts tun
    // Ein echter Renderer-Absturz beim Start führt zum schwarzen Fenster – sofort
    // wie einen GPU-Absturz absichern.
    if (imStart()) { startAbsichern('Renderer-Absturz'); return; }
    // Auch nach dem Start: stürzt der Renderer wiederholt ab (oft dieselbe GPU-
    // Ursache), auf Software-Rendering umstellen und neu starten, statt mit totem
    // Fenster hängen zu bleiben (Issue #41/#3).
    rendererAbstuerze += 1;
    if (rendererAbstuerze >= schwelle) ausweichen();
  };

  app.on('child-process-gone', beiKind);
  app.on('render-process-gone', beiRenderer);
  return () => {
    app.removeListener('child-process-gone', beiKind);
    app.removeListener('render-process-gone', beiRenderer);
  };
}

module.exports = {
  Logbuch, logbuchOeffnen, flaggenPruefen, schreibbarPruefen,
  softwareRendering, softwareRenderingSetzen, fehlerDialog, gpuUeberwachen,
  LOG_MAX, LOG_ALTE, GPU_SCHWELLE, BEKANNTE_FLAGS,
};
