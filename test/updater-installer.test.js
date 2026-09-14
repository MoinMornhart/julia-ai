'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { InstallerUpdater, latestYmlLesen } = require('../src/main/updater-installer');

const DL = 'https://github.com/MoinMornhart/julia-ai-web/releases/download';

function aufbau({ exe = Buffer.from('MZ – Installer'), summe, urlExe } = {}) {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-upd-'));
  fs.writeFileSync(path.join(ordner, 'package.json'), JSON.stringify({ version: '0.9.3' }));
  const sha = summe || crypto.createHash('sha512').update(exe).digest('base64');
  const yml = `version: 1.0.0\nfiles:\n  - url: Julia-AI-Setup.exe\n    sha512: ${sha}\n    size: ${exe.length}\npath: Julia-AI-Setup.exe\nsha512: ${sha}\nreleaseDate: '2026-09-14T10:00:00.000Z'\n`;
  const releases = [
    {
      tag_name: 'v1.0.0', body: '- Julia gibt es jetzt zum Installieren', draft: false, prerelease: false,
      assets: [
        { name: 'latest.yml', size: yml.length, browser_download_url: `${DL}/v1.0.0/latest.yml` },
        { name: 'Julia-AI-Setup.exe', size: exe.length, browser_download_url: urlExe || `${DL}/v1.0.0/Julia-AI-Setup.exe` },
      ],
    },
    { tag_name: 'v1.1.0-beta.1', body: 'Test', prerelease: true, assets: [] },
    { tag_name: 'v0.9.2', body: 'alt', assets: [] },
  ];
  const antworten = { api: releases, [`${DL}/v1.0.0/latest.yml`]: yml, [urlExe || `${DL}/v1.0.0/Julia-AI-Setup.exe`]: exe };
  const geholt = [];
  const holen = async (url) => {
    geholt.push(url);
    const k = url.startsWith('https://api.github.com/') ? 'api' : url;
    if (!(k in antworten)) return { ok: false, status: 404 };
    const d = antworten[k];
    return {
      ok: true,
      status: 200,
      json: async () => d,
      text: async () => String(d),
      arrayBuffer: async () => { const b = Buffer.from(d); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); },
    };
  };
  const gestartet = [];
  let beendet = false;
  const u = new InstallerUpdater({
    appOrdner: ordner,
    datenOrdner: ordner,
    config: { get: (k) => (k === 'update.kanal' ? 'stabil' : undefined) },
    istBeschaeftigt: () => false,
    beiFertig: () => {},
    beenden: () => { beendet = true; },
    holen,
    starten: (datei, args) => { gestartet.push({ datei, args }); return { unref() {} }; },
  });
  return { u, ordner, gestartet, geholt, istBeendet: () => beendet };
}

test('Installierte Fassung findet das neueste stabile Release samt Versionshinweis', async () => {
  const { u } = aufbau();
  const r = await u.pruefen();
  assert.equal(r.fehler, undefined);
  assert.equal(r.neu, 'v1.0.0', 'Vorabversion bleibt im stabilen Kanal außen vor');
  assert.deepEqual(r.zeilen, ['1.0.0 – Julia gibt es jetzt zum Installieren']);
});

test('Installer wird nur mit passender SHA-512-Summe gestartet', async () => {
  const { u, ordner, gestartet, istBeendet } = aufbau();
  await u.pruefen();
  await u._einspielen('v1.0.0');
  assert.equal(gestartet.length, 1);
  assert.match(gestartet[0].datei, /Julia-AI-Setup-1\.0\.0\.exe$/);
  assert.deepEqual(gestartet[0].args.slice(0, 1), ['/S']);
  assert.equal(fs.readFileSync(gestartet[0].datei, 'utf8'), 'MZ – Installer');
  assert.equal(JSON.parse(fs.readFileSync(path.join(ordner, 'update-status.json'), 'utf8')).phase, 'installer');
  assert.equal(istBeendet(), true);
});

test('Falsche Prüfsumme: nichts wird gestartet', async () => {
  const falsch = crypto.createHash('sha512').update('etwas anderes').digest('base64');
  const { u, gestartet, istBeendet } = aufbau({ summe: falsch });
  await u.pruefen();
  await assert.rejects(u._einspielen('v1.0.0'), /Prüfsumme/);
  assert.equal(gestartet.length, 0);
  assert.equal(istBeendet(), false);
});

test('Downloads von fremden Adressen werden gar nicht erst geladen', async () => {
  const { u, gestartet, geholt } = aufbau({ urlExe: 'https://angreifer.example/Julia-AI-Setup.exe' });
  await u.pruefen();
  await assert.rejects(u._einspielen('v1.0.0'), /Download-Adresse/);
  assert.equal(gestartet.length, 0);
  assert.ok(!geholt.some((x) => x.includes('angreifer')));
});

test('latest.yml: nur vollständige Angaben mit harmlosem Dateinamen', () => {
  const sha = crypto.createHash('sha512').update('x').digest('base64');
  assert.deepEqual(latestYmlLesen(`version: 1.0.0\npath: Julia-AI-Setup.exe\nsha512: ${sha}\n`), { version: '1.0.0', datei: 'Julia-AI-Setup.exe', sha512: sha });
  assert.throws(() => latestYmlLesen(`version: 1.0.0\nfiles:\n  - sha512: ${sha}\npath: Julia-AI-Setup.exe\n`), /unvollständig/);
  assert.throws(() => latestYmlLesen(`version: 1.0.0\npath: ../../boese.exe\nsha512: ${sha}\n`), /Installer/);
  assert.throws(() => latestYmlLesen('version: 1.0.0\npath: Julia-AI-Setup.exe\nsha512: kaputt\n'), /SHA-512/);
});

test('Nach dem Installer meldet Julia, ob die neue Version läuft', () => {
  const { u, ordner } = aufbau();
  const status = path.join(ordner, 'update-status.json');
  fs.writeFileSync(status, JSON.stringify({ phase: 'installer', ziel: 'v0.9.3' }));
  assert.equal(u.startStatus().ok, true);
  assert.equal(fs.existsSync(status), false, 'wird nur einmal gemeldet');
  fs.writeFileSync(status, JSON.stringify({ phase: 'installer', ziel: 'v1.0.0' }));
  const s = u.startStatus();
  assert.equal(s.ok, false);
  assert.match(s.fehler, /0\.9\.3/);
});
