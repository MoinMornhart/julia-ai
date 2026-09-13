'use strict';

const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');
const version = require('./version');

// Abschnitt 15: Updates nur auf getaggte Stände, nie mitten in einer Aufgabe,
// und mit Rückweg, falls die neue Fassung nicht sauber startet. Das eigentliche
// Umschalten macht update-waechter.js, weil die laufende App ihre eigenen
// Dateien (electron.exe) nicht austauschen kann.

function git(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).trim()));
      else resolve(stdout.trim());
    });
  });
}

// Changelog-Zeilen aller Versionen, die neuer als "von" und höchstens "bis" sind.
function changelogZwischen(text, von, bis) {
  const zeilen = [];
  let aktiv = false;
  for (const z of String(text || '').split(/\r?\n/)) {
    const m = /^##\s+v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/.exec(z);
    if (m) {
      aktiv = version.vergleichen(m[1], von) > 0 && version.vergleichen(m[1], bis) <= 0;
      if (aktiv) zeilen.push(z.replace(/^##\s+/, ''));
      continue;
    }
    if (aktiv && z.trim()) zeilen.push(z);
  }
  return zeilen;
}

function hoechsterTag(tags, kanal) {
  const kandidaten = tags
    .map((t) => t.trim())
    .filter((t) => /^v\d/.test(t) && version.parse(t))
    .filter((t) => kanal === 'test' || !version.parse(t).vorab);
  kandidaten.sort((a, b) => version.vergleichen(a, b));
  return kandidaten[kandidaten.length - 1] || null;
}

class Updater {
  constructor({ appOrdner, datenOrdner, config, istBeschaeftigt, beiFertig, beenden }) {
    this.appOrdner = appOrdner;
    this.datenOrdner = datenOrdner;
    this.config = config;
    this.istBeschaeftigt = istBeschaeftigt;
    this.beiFertig = beiFertig;
    this.beenden = beenden;
    this.statusDatei = path.join(datenOrdner, 'update-status.json');
    this.wartend = null;
  }

  aktuelleVersion() {
    return JSON.parse(fs.readFileSync(path.join(this.appOrdner, 'package.json'), 'utf8')).version;
  }

  async pruefen() {
    const aktuell = this.aktuelleVersion();
    try {
      await git(['rev-parse', '--is-inside-work-tree'], this.appOrdner);
    } catch {
      return { aktuell, neu: null, zeilen: [], fehler: 'Julia läuft nicht aus einem Git-Repository, Updates gehen nur mit git clone.' };
    }
    try {
      const remotes = await git(['remote'], this.appOrdner);
      if (!remotes.split(/\s+/).includes('origin')) return { aktuell, neu: null, zeilen: [], fehler: 'Kein Remote "origin" eingerichtet.' };
      await git(['fetch', '--tags', '--force', '--quiet', 'origin'], this.appOrdner);
      const tags = (await git(['tag', '-l', 'v*'], this.appOrdner)).split(/\r?\n/).filter(Boolean);
      const hoechster = hoechsterTag(tags, this.config.get('update.kanal'));
      if (!hoechster || version.vergleichen(hoechster, aktuell) <= 0) return { aktuell, neu: null, zeilen: [] };
      let changelog = '';
      try { changelog = await git(['show', `${hoechster}:CHANGELOG.md`], this.appOrdner); } catch { /* ohne Changelog weiter */ }
      return { aktuell, neu: hoechster, zeilen: changelogZwischen(changelog, aktuell, hoechster) };
    } catch (e) {
      return { aktuell, neu: null, zeilen: [], fehler: e.message };
    }
  }

  // Merkt das Update vor; läuft gerade eine Aufgabe, wird gewartet.
  nachAufgabeEinspielen(tag) {
    this.wartend = tag;
    if (!this.istBeschaeftigt()) setTimeout(() => this._einspielenWennFrei(), 200);
    return !this.istBeschaeftigt();
  }

  aufgabeFertig() {
    if (this.wartend) setTimeout(() => this._einspielenWennFrei(), 500);
  }

  async _einspielenWennFrei() {
    if (!this.wartend || this.istBeschaeftigt()) return;
    const tag = this.wartend;
    this.wartend = null;
    try {
      await this._einspielen(tag);
    } catch (e) {
      this.beiFertig({ ok: false, version: tag, fehler: e.message });
    }
  }

  async _einspielen(tag) {
    const dreckig = await git(['status', '--porcelain', '--untracked-files=no'], this.appOrdner);
    if (dreckig) throw new Error('Im Julia-Ordner gibt es lokale Änderungen. Das Update würde sie überschreiben, deshalb breche ich ab.');
    let vorher = await git(['symbolic-ref', '--short', '-q', 'HEAD'], this.appOrdner).catch(() => '');
    if (!vorher) vorher = await git(['rev-parse', 'HEAD'], this.appOrdner);

    // Der Wächter wird aus dem Datenordner gestartet, damit der Checkout ihn
    // nicht unter den Füßen austauscht.
    const waechterQuelle = path.join(__dirname, '..', 'update-waechter.js');
    const waechter = path.join(this.datenOrdner, 'update-waechter.js');
    fs.copyFileSync(waechterQuelle, waechter);

    const auftrag = {
      repo: this.appOrdner,
      ziel: tag,
      vorher,
      elternPid: process.pid,
      statusDatei: this.statusDatei,
      logDatei: path.join(this.datenOrdner, 'update.log'),
    };
    const arg = Buffer.from(JSON.stringify(auftrag), 'utf8').toString('base64');
    const node = await this._nodeFinden();
    const env = { ...process.env };
    if (node === process.execPath) env.ELECTRON_RUN_AS_NODE = '1';
    const kind = spawn(node, [waechter, arg], { detached: true, stdio: 'ignore', windowsHide: true, env, cwd: this.datenOrdner });
    kind.unref();
    this.beenden();
  }

  _nodeFinden() {
    return new Promise((resolve) => {
      execFile('where', ['node'], { windowsHide: true }, (err, out) => {
        const erster = !err && out.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
        resolve(erster || process.execPath);
      });
    });
  }

  // Beim Start: Ist das hier ein Probestart nach einem Update? Dann nach
  // erfolgreichem Hochfahren "gesund" melden. War ein Update schon fertig,
  // das Ergebnis einmal zurückgeben.
  startStatus() {
    let s;
    try { s = JSON.parse(fs.readFileSync(this.statusDatei, 'utf8')); } catch { return null; }
    if (s.phase === 'probe') return { probe: true, version: s.ziel };
    if (s.phase === 'fertig') {
      try { fs.unlinkSync(this.statusDatei); } catch { /* egal */ }
      return s;
    }
    return null;
  }

  gesundMelden() {
    let s;
    try { s = JSON.parse(fs.readFileSync(this.statusDatei, 'utf8')); } catch { return; }
    if (s.phase !== 'probe') return;
    s.gesund = true;
    s.gesundVersion = this.aktuelleVersion();
    fs.writeFileSync(this.statusDatei, JSON.stringify(s, null, 2), 'utf8');
  }
}

module.exports = { Updater, changelogZwischen, hoechsterTag };
