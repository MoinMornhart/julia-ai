'use strict';

// Veröffentlicht eine neue Julia-Version nach Abschnitt 15:
//   npm run release -- korrektur "Blase startet jetzt ausgeschaltet"
//   npm run release -- funktion  "Julia kann jetzt Termine vorlesen"
//   npm run release -- bruch     "Neue Einstellungsdatei" --hinweis "Hotkeys neu setzen"
// Optionen: --kein-push, --kein-release, --ohne-tests, --ohne-audit, --ohne-installer,
// --trailer "Zeile" (mehrfach möglich, landet unter der Commit-Nachricht),
// --text-datei <pfad> (Changelog-Zeile aus einer UTF-8-Datei – Windows
// PowerShell 5.1 verschluckt sonst typografische Anführungszeichen wie „ “)
//
// Vorher laufen die Tests und npm audit. Schlagen Tests fehl oder gibt es
// bekannte Lücken ab Stufe "high", wird nichts veröffentlicht.
//
// Setzt die Version in package.json (und package-lock.json), schreibt die
// Changelog-Zeile, committet mit "vX.Y.Z – <Zeile>" als Nachricht, setzt den
// Tag, pusht beides und legt ein GitHub-Release an (über die gh-CLI).
// Danach baut es den Installer und hängt Julia-AI-Setup.exe samt latest.yml an
// dasselbe Release im öffentlichen Repo julia-ai. Julia holt Updates von dort.

const fs = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');
const version = require('../src/main/version');

const WURZEL = path.join(__dirname, '..');

function git(...args) {
  return execFileSync('git', args, { cwd: WURZEL, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function argumente(argv) {
  const pos = [];
  const opt = { trailer: [], push: true, githubRelease: true, tests: true, audit: true, installer: true, hinweis: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--kein-push') opt.push = false;
    else if (a === '--ohne-installer') opt.installer = false;
    else if (a === '--kein-release') opt.githubRelease = false;
    else if (a === '--ohne-tests') opt.tests = false;
    else if (a === '--ohne-audit') opt.audit = false;
    else if (a === '--text-datei') opt.textDatei = argv[++i] || '';
    else if (a === '--hinweis') opt.hinweis = argv[++i] || '';
    else if (a === '--trailer') opt.trailer.push(argv[++i] || '');
    else pos.push(a);
  }
  return { art: pos[0], text: pos.slice(1).join(' ').trim(), ...opt };
}

function heute() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function changelogEinfuegen(inhalt, eintrag) {
  const zeilen = inhalt.split(/\r?\n/);
  const erste = zeilen.findIndex((z) => /^##\s/.test(z));
  if (erste === -1) return inhalt.replace(/\s*$/, '\n\n') + eintrag;
  zeilen.splice(erste, 0, ...eintrag.trimEnd().split('\n'), '');
  return zeilen.join('\n');
}

function main() {
  const a = argumente(process.argv.slice(2));
  if (a.textDatei) a.text = fs.readFileSync(a.textDatei, 'utf8').replace(/^﻿/, '').replace(/\s+/g, ' ').trim();
  if (!version.ARTEN.includes(a.art) || !a.text) {
    console.error('Aufruf: npm run release -- <korrektur|funktion|bruch> "Changelog-Zeile in Nutzersprache" [--hinweis "…"] [--kein-push]');
    process.exit(1);
  }
  if (a.art === 'bruch' && !a.hinweis) {
    console.error('Bei einem Bruch muss --hinweis sagen, was der Nutzer nach dem Update von Hand prüfen muss.');
    process.exit(1);
  }
  if (/^\w+(\(.+\))?!?:\s/.test(a.text)) {
    console.error('Bitte ohne Präfix-Kürzel wie "feat:" – ein Satz in Nutzersprache.');
    process.exit(1);
  }

  vorabPruefen(a);

  const pkgDatei = path.join(WURZEL, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgDatei, 'utf8'));
  const alt = pkg.version;
  const neu = version.naechste(alt, a.art);
  const tag = `v${neu}`;
  if (git('tag', '-l', tag)) {
    console.error(`Den Tag ${tag} gibt es schon.`);
    process.exit(1);
  }

  pkg.version = neu;
  fs.writeFileSync(pkgDatei, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  const lockDatei = path.join(WURZEL, 'package-lock.json');
  if (fs.existsSync(lockDatei)) {
    const lock = JSON.parse(fs.readFileSync(lockDatei, 'utf8'));
    lock.version = neu;
    if (lock.packages && lock.packages['']) lock.packages[''].version = neu;
    fs.writeFileSync(lockDatei, JSON.stringify(lock, null, 2) + '\n', 'utf8');
  }

  const clDatei = path.join(WURZEL, 'CHANGELOG.md');
  const bestand = fs.existsSync(clDatei) ? fs.readFileSync(clDatei, 'utf8') : '# Changelog\n';
  let eintrag = `## ${neu} – ${heute()}\n- ${a.text}\n`;
  if (a.hinweis) eintrag += `- Nach dem Update von Hand prüfen: ${a.hinweis}\n`;
  fs.writeFileSync(clDatei, changelogEinfuegen(bestand, eintrag), 'utf8');

  // Die Version steht vorne in der Nachricht, damit sie in der Commit-Liste auf
  // GitHub sichtbar ist.
  const titel = `${tag} – ${a.text}`;
  const nachricht = [titel, ...(a.trailer.length ? ['', ...a.trailer] : [])].join('\n');
  git('add', '-A');
  git('commit', '-q', '-m', nachricht);
  git('tag', '-a', tag, '-m', titel);
  console.log(`${alt} → ${neu}, Tag ${tag} gesetzt.`);

  const remotes = git('remote').split(/\s+/);
  if (a.push && remotes.includes('origin')) {
    git('push', '-q', 'origin', 'HEAD');
    git('push', '-q', 'origin', tag);
    console.log('Gepusht.');
    if (a.githubRelease) githubRelease(tag, a);
    if (a.githubRelease && a.installer) installerVeroeffentlichen(tag, a);
  } else if (a.push) {
    console.log('Kein Remote "origin", nicht gepusht.');
  }
}

function vorabPruefen(a) {
  if (a.tests) {
    try {
      execSync('npm test', { cwd: WURZEL, stdio: 'pipe' });
      console.log('Tests grün.');
    } catch (e) {
      console.error(`Tests schlagen fehl – kein Release.\n${String(e.stdout || '').slice(-1500)}`);
      process.exit(1);
    }
  }
  if (a.audit) {
    try {
      execSync('npm audit --audit-level=high', { cwd: WURZEL, stdio: 'pipe' });
      console.log('npm audit: keine Lücken ab Stufe "high".');
    } catch (e) {
      console.error(`npm audit meldet Lücken ab Stufe "high" oder ist nicht erreichbar – kein Release. Nur bewusst mit --ohne-audit überspringen.\n${String(e.stdout || '').slice(-1500)}`);
      process.exit(1);
    }
  }
}

function githubRelease(tag, a) {
  const notizen = [`- ${a.text}`, ...(a.hinweis ? [`- Nach dem Update von Hand prüfen: ${a.hinweis}`] : [])].join('\n');
  try {
    execFileSync('gh', ['release', 'create', tag, '--verify-tag', '--title', `${tag} – ${a.text}`.slice(0, 120), '--notes', notizen], { cwd: WURZEL, stdio: ['ignore', 'pipe', 'pipe'] });
    console.log('GitHub-Release angelegt.');
  } catch (e) {
    console.log(`GitHub-Release nicht angelegt (gh fehlt oder ist nicht angemeldet): ${String(e.stderr || e.message).trim().slice(0, 200)}`);
  }
}

// Installer bauen und Setup samt latest.yml an das Release im Repo hängen.
// Die installierte Julia holt ihre Updates genau von dort.
function installerVeroeffentlichen(tag, a) {
  const dist = path.join(WURZEL, 'dist');
  try {
    fs.rmSync(dist, { recursive: true, force: true });
    execSync('npm run installer', { cwd: WURZEL, stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    console.log(`Installer nicht gebaut: ${String(e.stderr || e.stdout || e.message).trim().slice(-400)}`);
    return;
  }
  const yml = fs.readFileSync(path.join(dist, 'latest.yml'), 'utf8');
  if (!new RegExp(`^version: ${tag.slice(1).replace(/\./g, '\\.')}\\s*$`, 'm').test(yml)) {
    console.log('latest.yml passt nicht zur Version – nichts veröffentlicht.');
    return;
  }
  try {
    const dateien = ['Julia-AI-Setup.exe', 'Julia-AI-Setup.exe.blockmap', 'latest.yml'].map((d) => path.join(dist, d)).filter((d) => fs.existsSync(d));
    execFileSync('gh', ['release', 'upload', tag, ...dateien, '--clobber'], { cwd: WURZEL, stdio: ['ignore', 'pipe', 'pipe'] });
    console.log(`Installer veröffentlicht: an Release ${tag} angehängt.`);
  } catch (e) {
    console.log(`Installer nicht veröffentlicht: ${String(e.stderr || e.message).trim().slice(0, 300)}`);
  }
}

if (require.main === module) main();

module.exports = { changelogEinfuegen, argumente };
