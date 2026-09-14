'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { readmeOeffentlich, DOKUMENTE } = require('../scripts/webseite');

const WURZEL = path.join(__dirname, '..');

test('Webseite: private Teile fallen weg, öffentliche erscheinen', () => {
  const roh = 'A · [B](#b)<!-- privat --> · [Dev](#dev)<!-- /privat --> · [C](#c)\n\nText\n\n<!-- privat -->\n## Dev\ngeheim\n<!-- /privat -->\n\n## Ende\n<!-- oeffentlich\n\nNur hier.\n-->\n';
  assert.equal(readmeOeffentlich(roh), 'A · [B](#b) · [C](#c)\n\nText\n\n## Ende\n\nNur hier.\n');
});

for (const datei of ['README.md', 'README.en.md']) {
  test(`Webseite: ${datei} fürs Download-Repo`, () => {
    const text = readmeOeffentlich(fs.readFileSync(path.join(WURZEL, datei), 'utf8'));
    assert.doesNotMatch(text, /julia-ai\.git|src\/main|npm run release|<!-- (\/)?privat|<!-- oeffentlich/, 'nichts aus dem privaten Repo');
    assert.match(text, /Get-FileHash/);
    // Jeder Verweis zeigt auf etwas, das im Download-Repo auch liegt.
    const da = new Set(['README.md', 'README.en.md', 'CHANGELOG.md', 'LICENSE', ...DOKUMENTE.map((d) => `docs/${d}`)]);
    for (const [, ziel] of text.matchAll(/(?:\]\(|src="|href=")(?!https?:|#)([^)"#]+)/g)) {
      if (ziel.startsWith('docs/bilder/')) assert.ok(fs.existsSync(path.join(WURZEL, ziel)), `${ziel} fehlt`);
      else assert.ok(da.has(ziel), `${ziel} liegt nicht im Download-Repo`);
    }
  });
}
