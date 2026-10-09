'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../serve.cjs');

test('local server serves static app and unconfigured API without exposing backend files', async t => {
  const server = await createServer({ env: {} });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const home = await fetch(base + '/');
  assert.equal(home.status, 200);
  assert.match(home.headers.get('Content-Type'), /text\/html/);
  assert.match(await home.text(), /来处/);
  const status = await fetch(base + '/api/agent/status');
  assert.equal(status.status, 200);
  assert.equal((await status.json()).available, false);
  const query = await fetch(base + '/api/agent/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: '湖北通山阮氏' }) });
  assert.equal(query.status, 503);
  assert.equal((await query.json()).error.code, 'AGENT_NOT_CONFIGURED');
  for (const privatePath of ['/.env', '/backend/agent.mjs', '/serve.cjs', '/%2e%2e%5c.env']) assert.ok([403, 404].includes((await fetch(base + privatePath)).status));
  const missing = await fetch(base + '/api/unknown');
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, 'NOT_FOUND');
});
