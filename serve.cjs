'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, 'dist');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json' };

function loadLocalEnvironment() {
  // Keep the key outside dist and preserve explicitly supplied environment values.
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
}

async function createServer(options = {}) {
  if (!options.env) loadLocalEnvironment();
  const { createAgentApi } = await import(pathToFileURL(path.join(__dirname, 'backend', 'agent.mjs')).href);
  const api = createAgentApi(options.env || process.env, options.dependencies);
  return http.createServer(async (req, res) => {
    let url;
    try { url = new URL(req.url, 'http://' + (req.headers.host || '127.0.0.1')); }
    catch { res.writeHead(400).end('Bad request'); return; }
    if (url.pathname.startsWith('/api/')) {
      const controller = new AbortController();
      res.once('close', () => { if (!res.writableEnded) controller.abort(); });
      try {
        const init = { method: req.method, headers: req.headers, signal: controller.signal };
        if (!['GET', 'HEAD'].includes(req.method)) Object.assign(init, { body: req, duplex: 'half' });
        const request = new Request(url, init);
        const response = await api(request, { clientId: req.socket.remoteAddress || 'local' });
        if (!res.destroyed) {
          res.writeHead(response.status, Object.fromEntries(response.headers));
          res.end(Buffer.from(await response.arrayBuffer()));
        }
      } catch {
        if (!res.destroyed) res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify({ error: { code: 'SERVER_ERROR', message: '服务暂时不可用，请稍后再试。' } }));
      }
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
    let relative;
    try { relative = decodeURIComponent(url.pathname); }
    catch { res.writeHead(400).end(); return; }
    const target = path.resolve(root, '.' + (relative === '/' ? '/index.html' : relative));
    if (!target.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(target, (err, data) => {
      if (err) { res.writeHead(404).end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' }).end(req.method === 'HEAD' ? undefined : data);
    });
  });
}

if (require.main === module) {
  createServer().then(server => server.listen(Number(process.env.PORT) || 4173, '127.0.0.1', () => {
    console.log('Preview: http://127.0.0.1:' + (Number(process.env.PORT) || 4173));
    console.log('Research Agent: ' + (process.env.OPENAI_API_KEY ? 'configured (credentials not yet verified)' : 'not configured; demo remains available'));
  })).catch(() => { console.error('Could not start preview server. Check the local .env file and Node.js version.'); process.exitCode = 1; });
}
module.exports = { createServer };
