const assert = require('node:assert/strict');
const test = require('node:test');

const { tilesPage } = require('../src/tiles-ui');

test('console exposes the rolling deck, task aliases, and prompt-shortcut controls', () => {
  const html = tilesPage();
  assert.match(html, /ACTIVE WINDOW/);
  assert.match(html, /five most recently modified visible Codex tasks/);
  assert.match(html, /New Codex task/);
  assert.match(html, /Task short names/);
  assert.match(html, /Short Cardputer name/);
  assert.match(html, /Use Codex name/);
  assert.match(html, /real Codex title is never changed/);
  assert.match(html, /remembered even after the task moves beyond the five visible tiles/);
  assert.match(html, /Prompt shortcuts/);
  assert.match(html, /Custom shortcut keys/);
  assert.match(html, /All 47 unmodified printable keys/);
  assert.match(html, /<strong>D<\/strong> can mean Deploy/);
  assert.match(html, />Queue</);
  assert.match(html, />Steer</);
  assert.match(html, />Draft</);
  assert.match(html, /Search recent tasks or short names/);
  assert.match(html, /Speaker feedback/);
  assert.match(html, /press <strong>S<\/strong>/);
  assert.match(html, /id="sound-mode"/);
  assert.match(html, /Read latest answer/);
  assert.doesNotMatch(html, /<select[^>]+thread/);
  assert.match(html, /\$skill-name/);
  assert.doesNotMatch(html, />Rename</);
  assert.doesNotMatch(html, />Archive</);
  assert.doesNotMatch(html, />Delete</);
  assert.doesNotMatch(html, /Clear tile/);
  assert.doesNotMatch(html, /Choose a recent task/);
  const script = html.match(/<script>([\s\S]*)<\/script>/);
  assert.ok(script);
  assert.doesNotThrow(() => new Function(script[1]));
});
