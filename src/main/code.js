'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

// Code-Reiter: deine Projekte auf einen Blick – Git-Stand, geänderte Dateien,
// letzte Commits, vorhandene Skripte. Hier wird nur gelesen. Ändern tut Julia
// im Chat, und dort gilt wie immer die Ampel.

const MAX_DIFF = 200 * 1024;
const MAX_PROJEKTE = 30;

function gitAusfuehren(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile('git', ['-c', 'core.quotepath=false', ...args], { cwd, windowsHide: true, timeout: 15000, maxBuffer: 16 * 1024 * 1024 }, (err, aus, fehl) => {
      if (err) reject(new Error(String(fehl || err.message).trim().slice(0, 300)));
      else resolve(aus);
    });
  });
}

// git status --porcelain=v1 -b
function statusLesen(text) {
  let zweig = '';
  let voraus = 0;
  let zurueck = 0;
  const dateien = [];
  for (const z of String(text || '').split(/\r?\n/)) {
    if (!z) continue;
    if (z.startsWith('## ')) {
      const m = /^## (?:No commits yet on |Initial commit on )?(.+?)(?:\.\.\.(\S+))?(?: \[(.*)\])?$/.exec(z);
      if (m) {
        zweig = m[1];
        const v = /ahead (\d+)/.exec(m[3] || '');
        const b = /behind (\d+)/.exec(m[3] || '');
        voraus = v ? Number(v[1]) : 0;
        zurueck = b ? Number(b[1]) : 0;
      }
      continue;
    }
    const code = z.slice(0, 2);
    let datei = z.slice(3);
    if (datei.includes(' -> ')) datei = datei.split(' -> ').pop();
    datei = datei.replace(/^"|"$/g, '');
    const art = code === '??' ? 'neu' : /D/.test(code) ? 'geloescht' : /R/.test(code) ? 'umbenannt' : /A/.test(code) ? 'hinzu' : 'geaendert';
    dateien.push({ code: code.trim(), art, datei });
  }
  return { zweig, voraus, zurueck, dateien };
}

// git log --pretty=format:%h%x09%ct%x09%s
function logLesen(text) {
  return String(text || '').split(/\r?\n/).filter(Boolean).map((z) => {
    const [hash, zeit, ...rest] = z.split('\t');
    return { hash, zeit: Number(zeit) * 1000, text: rest.join('\t') };
  });
}

// Was für ein Projekt ist das? Sprachen, npm-Skripte, README.
function projektInfo(pfad) {
  const da = (n) => fs.existsSync(path.join(pfad, n));
  const sprachen = [];
  let skripte = [];
  if (da('package.json')) {
    sprachen.push(da('tsconfig.json') ? 'TypeScript' : 'JavaScript');
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(pfad, 'package.json'), 'utf8').replace(/^﻿/, ''));
      skripte = Object.keys(pkg.scripts || {}).slice(0, 12).map((s) => `npm run ${s}`.replace(/^npm run (test|start)$/, 'npm $1'));
    } catch { /* kaputtes package.json */ }
  }
  if (da('pyproject.toml') || da('requirements.txt') || da('setup.py')) sprachen.push('Python');
  if (da('Cargo.toml')) sprachen.push('Rust');
  if (da('go.mod')) sprachen.push('Go');
  if (da('pom.xml') || da('build.gradle') || da('build.gradle.kts')) sprachen.push('Java/Kotlin');
  try {
    if (fs.readdirSync(pfad).some((n) => /\.(csproj|sln)$/i.test(n))) sprachen.push('C#');
  } catch { /* nicht lesbar */ }
  return { sprachen, skripte, readme: da('README.md') || da('readme.md') };
}

class CodeProjekte {
  constructor({ config, git = gitAusfuehren }) {
    this.config = config;
    this.git = git;
  }

  pfade() {
    return (this.config.get('code.projekte') || []).slice(0, MAX_PROJEKTE);
  }

  // Nur Projekte aus deiner Liste – kein beliebiger Ordner über diesen Weg.
  pruefen(pfad) {
    const p = path.resolve(String(pfad || ''));
    if (!this.pfade().some((x) => path.resolve(x).toLowerCase() === p.toLowerCase())) throw new Error('Dieses Projekt steht nicht in deiner Liste.');
    return p;
  }

  async _status(pfad) {
    try {
      return statusLesen(await this.git(['status', '--porcelain=v1', '-b'], pfad));
    } catch {
      return null;
    }
  }

  async uebersicht() {
    return Promise.all(this.pfade().map(async (pfad) => {
      const da = fs.existsSync(pfad);
      const s = da ? await this._status(pfad) : null;
      return { pfad, name: path.basename(pfad), da, git: !!s, zweig: s ? s.zweig : '', geaendert: s ? s.dateien.length : 0 };
    }));
  }

  async details(pfad) {
    const p = this.pruefen(pfad);
    if (!fs.existsSync(p)) return { pfad: p, name: path.basename(p), da: false };
    const s = await this._status(p);
    let commits = [];
    if (s) {
      try { commits = logLesen(await this.git(['log', '-8', '--pretty=format:%h%x09%ct%x09%s'], p)); } catch { /* noch keine Commits */ }
    }
    return { pfad: p, name: path.basename(p), da: true, info: projektInfo(p), git: s ? { ...s, commits } : null };
  }

  async diff(pfad, datei) {
    const p = this.pruefen(pfad);
    const ziel = path.resolve(p, String(datei || ''));
    const rel = path.relative(p, ziel);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Datei liegt nicht im Projekt.');
    const s = await this._status(p);
    const eintrag = s && s.dateien.find((d) => path.resolve(p, d.datei) === ziel);
    let text = '';
    if (eintrag && eintrag.art === 'neu') {
      // Neue Datei: als lauter hinzugefügte Zeilen zeigen.
      const inhalt = fs.readFileSync(ziel);
      if (inhalt.subarray(0, 8192).includes(0)) return '(Binärdatei)';
      text = `+++ ${rel}\n${inhalt.toString('utf8').split(/\r?\n/).map((z) => `+${z}`).join('\n')}`;
    } else {
      try { text = await this.git(['diff', 'HEAD', '--', rel], p); } catch { text = await this.git(['diff', '--', rel], p); }
    }
    return text.length > MAX_DIFF ? `${text.slice(0, MAX_DIFF)}\n… [gekürzt]` : text;
  }
}

module.exports = { CodeProjekte, statusLesen, logLesen, projektInfo, gitAusfuehren, MAX_PROJEKTE };
