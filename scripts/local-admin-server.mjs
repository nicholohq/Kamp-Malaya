// Local-only dev server for the admin dashboard, without needing the Vercel
// CLI logged in / the project linked. Serves the built dist/ output as
// static files and runs the real api/admin/* handlers in-process for
// everything under /api/ — so login, Contacts and Messages all work against
// the real .env locally.
//
// Not part of the deployed app; not run in production. `npm run build` must
// be run first (or re-run after an admin.js/admin.css/admin.html change).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 3000;

// Load .env the same way the earlier one-off check scripts did — Node has no
// built-in .env loader in the version this project otherwise assumes.
try {
  const envText = await readFile(path.join(ROOT, '.env'), 'utf8');
  for (const line of envText.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  console.error('[local-admin-server] no .env found — admin API calls will fail closed');
}

// The CSRF Origin check in withAdmin compares against this exactly, so it has
// to match wherever this server is actually reached at.
process.env.ADMIN_ORIGIN = `http://localhost:${PORT}`;

const ROUTES = {
  '/api/admin/login': 'login.js',
  '/api/admin/logout': 'logout.js',
  '/api/admin/change-password': 'change-password.js',
  '/api/admin/contacts': 'contacts.js',
  '/api/admin/contact': 'contact.js',
  '/api/admin/conversations': 'conversations.js',
  '/api/admin/messages': 'messages.js',
  '/api/admin/send-message': 'send-message.js',
};

const handlers = {};
for (const [route, file] of Object.entries(ROUTES)) {
  const mod = await import(pathToFileURL(path.join(ROOT, 'api', 'admin', file)).href);
  handlers[route] = mod.default;
}

function shimRes(res) {
  return {
    setHeader(k, v) { res.setHeader(k, v); },
    status(code) { res.statusCode = code; return this; },
    json(obj) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(obj));
      return this;
    },
    end(body) { res.end(body); return this; },
  };
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.mp4': 'video/mp4', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain', '.xml': 'application/xml',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const handler = handlers[url.pathname];

  if (handler) {
    let body;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString('utf8');
      try { body = raw ? JSON.parse(raw) : undefined; } catch { body = undefined; }
    }
    const query = Object.fromEntries(url.searchParams);
    try {
      await handler({ method: req.method, headers: req.headers, query, body }, shimRes(res));
    } catch (err) {
      console.error('[local-admin-server] handler threw', err);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'local shim error' }));
    }
    return;
  }

  const rel = url.pathname === '/' ? '/admin.html' : url.pathname;
  const filePath = path.join(DIST, rel);
  if (!filePath.startsWith(DIST)) { res.statusCode = 400; res.end('bad path'); return; }
  try {
    const data = await readFile(filePath);
    res.setHeader('Content-Type', MIME[path.extname(filePath)] || 'application/octet-stream');
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end('Not found — did you run `npm run build`?');
  }
});

server.listen(PORT, () => {
  console.log(`[local-admin-server] http://localhost:${PORT}/admin.html`);
});
