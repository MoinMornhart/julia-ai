'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { CodeProjekte, statusLesen, logLesen, projektInfo } = require('../src/main/code');

test('Git-Status lesen: Zweig, voraus/zurück, Dateiarten', () => {
  const s = statusLesen('## main...origin/main [ahead 2, behind 1]\n M src/a.js\n?? neu.txt\nD  alt.js\nR  x.js -> y.js\nA  b.js\n');
  assert.equal(s.zweig, 'main');
  assert.equal(s.voraus, 2);
  assert.equal(s.zurueck, 1);
  assert.deepEqual(s.dateien.map((d) => [d.art, d.datei]), [['geaendert', 'src/a.js'], ['neu', 'neu.txt'], ['geloescht', 'alt.js'], ['umbenannt', 'y.js'], ['hinzu', 'b.js']]);
  assert.equal(statusLesen('## release/1.0\n').zweig, 'release/1.0');
  assert.equal(statusLesen('## No commits yet on main\n').zweig, 'main');
});

test('Log lesen', () => {
  assert.deepEqual(logLesen('abc1234\t1757800000\tv1.0.0 – Erste Version\n'), [{ hash: 'abc1234', zeit: 1757800000000, text: 'v1.0.0 – Erste Version' }]);
});

test('Projekt-Info: Sprachen und npm-Skripte', () => {
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-code-'));
  fs.writeFileSync(path.join(o, 'package.json'), JSON.stringify({ scripts: { test: 'node --test', build: 'x' } }));
  fs.writeFileSync(path.join(o, 'requirements.txt'), '');
  fs.writeFileSync(path.join(o, 'README.md'), '# x');
  const i = projektInfo(o);
  assert.deepEqual(i.sprachen, ['JavaScript', 'Python']);
  assert.deepEqual(i.skripte, ['npm test', 'npm run build']);
  assert.equal(i.readme, true);
});

test('Echtes Git-Repository: Status, Commits, Diff – und nur Projekte aus der Liste', async () => {
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-repo-'));
  const git = (...a) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'init.defaultBranch=main', ...a], { cwd: o, stdio: 'pipe' });
  git('init', '-q');
  fs.writeFileSync(path.join(o, 'app.js'), 'const a = 1;\n');
  git('add', '.');
  git('commit', '-q', '-m', 'Erster Stand');
  fs.writeFileSync(path.join(o, 'app.js'), 'const a = 2;\n');
  fs.writeFileSync(path.join(o, 'neu.md'), 'Hallo\n');

  const cp = new CodeProjekte({ config: { get: () => [o] } });
  const [u] = await cp.uebersicht();
  assert.equal(u.git, true);
  assert.equal(u.zweig, 'main');
  assert.equal(u.geaendert, 2);

  const d = await cp.details(o);
  assert.deepEqual(d.git.dateien.map((x) => x.art).sort(), ['geaendert', 'neu']);
  assert.equal(d.git.commits[0].text, 'Erster Stand');

  const diff = await cp.diff(o, 'app.js');
  assert.match(diff, /-const a = 1;/);
  assert.match(diff, /\+const a = 2;/);
  assert.match(await cp.diff(o, 'neu.md'), /\+Hallo/);

  await assert.rejects(cp.diff(o, '../ausserhalb.txt'), /nicht im Projekt/);
  await assert.rejects(cp.details(os.tmpdir()), /nicht in deiner Liste/);
});
