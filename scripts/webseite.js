'use strict';

// Veröffentlicht die Webseite im öffentlichen Repo julia-ai-web (GitHub Pages):
//   npm run webseite [-- --trailer "Zeile"]
// Dort liegen nur die Seite, die Google-Anleitungen und – über Releases – der
// Installer. Der Quellcode bleibt im privaten Repo.
//
// In site/index.html werden __VERSION__, __SHA256__ und __GROESSE__ durch die
// Werte des gerade gebauten Installers (dist/Julia-AI-Setup.exe) ersetzt.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const WURZEL = path.join(__dirname, '..');
const WEB_REPO = 'MoinMornhart/julia-ai-web';
const ORDNER = path.join(os.tmpdir(), 'julia-ai-web');

const DOKUMENTE = ['installation.md', 'installation.en.md', 'google-einrichten.md', 'google-setup.en.md', 'outlook-einrichten.md', 'outlook-setup.en.md', 'unterwegs.md', 'unterwegs.en.md', 'proxmox.md', 'proxmox.en.md'];
// Das Relay ist öffentlich (das Install-Skript lädt es von hier); der übrige
// Quellcode bleibt privat. Diese Dateien des Relays wandern nach proxmox/relay/.
const RELAY_DATEIEN = ['server.js', 'webauthn.js', 'package.json', 'package-lock.json', 'public/index.html', 'public/relay.js', 'public/relay.css'];

// Das Download-Repo zeigt dieselbe README wie das private Repo, samt Bildern –
// nur ohne die Teile zwischen <!-- privat --> und <!-- /privat --> (Quellcode,
// Entwickler). Was nur dort erscheinen soll, steht als <!-- oeffentlich … -->.
function readmeOeffentlich(text) {
  return text
    .replace(/<!-- privat -->[\s\S]*?<!-- \/privat -->\n?/g, '')
    .replace(/<!-- oeffentlich\n([\s\S]*?)\n-->/g, '$1')
    .replace(/\n{3,}/g, '\n\n');
}

function git(...args) {
  return execFileSync('git', args, { cwd: ORDNER, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function gitOhneFehler(...args) {
  try { return git(...args); } catch { return ''; }
}

function trailerLesen(argv) {
  const t = [];
  for (let i = 0; i < argv.length; i++) if (argv[i] === '--trailer') t.push(argv[++i] || '');
  return t;
}

function installerDaten() {
  const exe = path.join(WURZEL, 'dist', 'Julia-AI-Setup.exe');
  if (!fs.existsSync(exe)) throw new Error('dist/Julia-AI-Setup.exe fehlt – erst "npm run installer".');
  const daten = fs.readFileSync(exe);
  return {
    sha256: crypto.createHash('sha256').update(daten).digest('hex').toUpperCase(),
    groesse: `${(daten.length / 1024 / 1024).toFixed(0)} MB`,
  };
}

function main() {
  const version = JSON.parse(fs.readFileSync(path.join(WURZEL, 'package.json'), 'utf8')).version;
  const { sha256, groesse } = installerDaten();

  if (!fs.existsSync(path.join(ORDNER, '.git'))) {
    fs.rmSync(ORDNER, { recursive: true, force: true });
    execFileSync('gh', ['repo', 'clone', WEB_REPO, ORDNER], { stdio: ['ignore', 'pipe', 'pipe'] });
  } else {
    git('fetch', '-q', 'origin');
    try { git('reset', '-q', '--hard', 'origin/main'); } catch { /* leeres Repo */ }
  }

  // Im öffentlichen Repo nie die echte E-Mail: Commits laufen unter der
  // noreply-Adresse von GitHub.
  if (!gitOhneFehler('config', 'user.email')) {
    const id = execFileSync('gh', ['api', 'user', '--jq', '.id'], { encoding: 'utf8' }).trim();
    const login = execFileSync('gh', ['api', 'user', '--jq', '.login'], { encoding: 'utf8' }).trim();
    git('config', 'user.name', login);
    git('config', 'user.email', `${id}+${login}@users.noreply.github.com`);
  }

  const seite = fs.readFileSync(path.join(WURZEL, 'site', 'index.html'), 'utf8')
    .split('__VERSION__').join(version)
    .split('__SHA256__').join(sha256)
    .split('__GROESSE__').join(groesse);
  fs.writeFileSync(path.join(ORDNER, 'index.html'), seite, 'utf8');
  fs.mkdirSync(path.join(ORDNER, 'docs'), { recursive: true });
  for (const d of DOKUMENTE) {
    fs.copyFileSync(path.join(WURZEL, 'docs', d), path.join(ORDNER, 'docs', d));
  }
  // Die Bilder der README; nicht mehr benutzte verschwinden mit.
  fs.rmSync(path.join(ORDNER, 'docs', 'bilder'), { recursive: true, force: true });
  fs.cpSync(path.join(WURZEL, 'docs', 'bilder'), path.join(ORDNER, 'docs', 'bilder'), { recursive: true });
  for (const r of ['README.md', 'README.en.md']) {
    fs.writeFileSync(path.join(ORDNER, r), readmeOeffentlich(fs.readFileSync(path.join(WURZEL, r), 'utf8')), 'utf8');
  }
  fs.copyFileSync(path.join(WURZEL, 'CHANGELOG.md'), path.join(ORDNER, 'CHANGELOG.md'));
  fs.copyFileSync(path.join(WURZEL, 'LICENSE'), path.join(ORDNER, 'LICENSE'));

  // Proxmox-Relay: Install-Skript und der Relay-Quellcode, den das Skript lädt.
  fs.rmSync(path.join(ORDNER, 'proxmox'), { recursive: true, force: true });
  fs.mkdirSync(path.join(ORDNER, 'proxmox', 'relay', 'public'), { recursive: true });
  fs.copyFileSync(path.join(WURZEL, 'relay', 'julia-relay.sh'), path.join(ORDNER, 'proxmox', 'julia-relay.sh'));
  for (const d of RELAY_DATEIEN) {
    fs.copyFileSync(path.join(WURZEL, 'relay', d), path.join(ORDNER, 'proxmox', 'relay', d));
  }
  fs.writeFileSync(path.join(ORDNER, '.nojekyll'), '', 'utf8');

  git('add', '-A');
  if (!git('status', '--porcelain')) {
    console.log('Webseite unverändert.');
    return;
  }
  const trailer = trailerLesen(process.argv.slice(2));
  git('commit', '-q', '-m', [`Webseite für v${version}`, ...(trailer.length ? ['', ...trailer] : [])].join('\n'));
  git('push', '-q', 'origin', 'HEAD:main');
  console.log(`Webseite für v${version} gepusht.`);
}

if (require.main === module) main();

module.exports = { readmeOeffentlich, DOKUMENTE };
