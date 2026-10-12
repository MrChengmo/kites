import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { timingSafeEqual } from 'node:crypto';
import { openStore, validateRoutine, nextOccurrence } from './store.mjs';
import { createScheduler } from './scheduler.mjs';
import { createReading } from './reading.mjs';
import { workspaceRequests } from './workspaces.mjs';

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};
const fail = (status, message) => Object.assign(new Error(message), { status });
function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json'))
    throw fail(415, 'Use application/json.');
  let length = 0;
  const chunks = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 4 * 1024 * 1024) throw fail(413, 'The request exceeds 4 MB.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw fail(400, 'Invalid JSON.');
  }
}
function equal(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function createKites(options = {}) {
  const runtimeURL = new URL(options.runtimeURL || 'http://127.0.0.1:8080');
  if (
    !['http:', 'https:'].includes(runtimeURL.protocol) ||
    runtimeURL.username ||
    runtimeURL.password
  )
    throw new Error('Use an HTTP or HTTPS Agentway URL without credentials.');
  const store = openStore(options.database || resolve('data/kites.db'));
  const upstreamRuntime = (path, init = {}) =>
    fetch(new URL(path, runtimeURL), {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(options.runtimeToken ? { Authorization: `Bearer ${options.runtimeToken}` } : {}),
      },
    });
  const prepareWorkspace = workspaceRequests(upstreamRuntime, options.agentEnv);
  const runtime = async (path, init = {}) => {
    if (init.body) {
      const data = await prepareWorkspace(path.split('?')[0], init.method, JSON.parse(init.body));
      init = { ...init, body: JSON.stringify(data) };
    }
    return upstreamRuntime(path, init);
  };
  const reading = createReading(store, runtime);
  const scheduler = createScheduler({ store, runtime });
  const alpha = options.alphaURL
    ? createKites({
        ...options,
        alphaURL: undefined,
        runtimeURL: options.alphaURL,
        runtimeToken: options.alphaToken,
        agentEnv: options.alphaAgentEnv,
        database: options.alphaDatabase || resolve('data/kites-alpha.db'),
        isAlpha: true,
      })
    : null;
  const nativeOrigins = ['capacitor://localhost', 'https://localhost'];
  const allowedOrigins = new Set(options.origins || []);
  const host = options.host || '127.0.0.1';
  if (!['127.0.0.1', '::1', 'localhost'].includes(host) && !options.accessToken)
    throw new Error('KITES_ACCESS_TOKEN is required for a network listener.');
  function authorize(req, res) {
    const origin = req.headers.origin;
    const authority = req.headers.host || '';
    const localHost = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(authority);
    if (!options.accessToken && !localHost) throw fail(403, 'Invalid local host.');
    const sameOrigin = origin === `http://${authority}` || origin === `https://${authority}`;
    const explicit = origin && (allowedOrigins.has(origin) || nativeOrigins.includes(origin));
    if (origin && !sameOrigin && !(options.accessToken && explicit))
      throw fail(403, 'This origin is not allowed.');
    if (origin && explicit) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization,Content-Type',
      });
      res.end();
      return false;
    }
    if (
      options.accessToken &&
      !equal(req.headers.authorization || '', `Bearer ${options.accessToken}`)
    )
      throw fail(401, 'Enter the Kites access key in Connection settings.');
    if (req.headers['sec-fetch-site'] === 'cross-site' && !explicit)
      throw fail(403, 'Cross-site requests are not allowed.');
    return true;
  }
  const server = createServer(async (req, res) => {
    try {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'no-referrer');
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const path = url.pathname;
      if (path.startsWith('/alpha/api/')) {
        if (!authorize(req, res)) return;
        if (!alpha) throw fail(503, 'Alpha connection is not configured.');
        req.url = req.url.slice('/alpha'.length);
        alpha.server.emit('request', req, res);
        return;
      }
      if (path.startsWith('/api/')) {
        if (!authorize(req, res)) return;
        if (path.startsWith('/api/v1/')) {
          if (
            !/^\/api\/v1\/(health|agents(?:\/[^/]+(?:\/prompt)?)?|sessions(?:\/[^/]+(?:\/(?:events|subscribe|prompt|interrupt|workspace|agents(?:\/[^/]+)?))?)?|environments(?:\/[^/]+(?:\/(?:workspaces(?:\/[^/]+\/archive)?|files))?)?)$/.test(
              path,
            )
          )
            throw fail(404, 'Unknown runtime route.');
          const data = ['POST', 'PUT'].includes(req.method)
            ? JSON.stringify(await body(req))
            : undefined;
          const controller = new AbortController();
          res.on('close', () => controller.abort());
          let upstream;
          try {
            upstream = await runtime(path + url.search, {
              method: req.method,
              body: data,
              signal: controller.signal,
            });
          } catch (error) {
            if (controller.signal.aborted) return;
            if (error.status) throw error;
            throw fail(502, `Cannot reach Agentway at ${runtimeURL.origin}. ${error.message}`);
          }
          res.writeHead(upstream.status, {
            'Content-Type': upstream.headers.get('content-type') || 'application/json',
            'Cache-Control': 'no-store',
            'X-Accel-Buffering': 'no',
          });
          if (upstream.body) await pipeline(Readable.fromWeb(upstream.body), res);
          else res.end();
          return;
        }
        if (path === '/api/kites/reading' && req.method === 'GET') {
          const ids = (url.searchParams.get('ids') || '').split(',').filter(Boolean);
          if (ids.length > 100) throw fail(400, 'Read at most 100 conversations at once.');
          return json(res, 200, await reading.get(ids));
        }
        const readMatch = path.match(/^\/api\/kites\/reading\/([^/]+)$/);
        if (readMatch && req.method === 'PUT') {
          const data = await body(req);
          return json(res, 200, await reading.mark(decodeURIComponent(readMatch[1]), data.readSeq));
        }
        if (path === '/api/kites/state' && req.method === 'GET')
          return json(res, 200, {
            routines: store.all('routines'),
            runs: store.runs(),
            files: store.all('files'),
            chats: store.all('chats'),
            runtime: runtimeURL.origin,
            alphaAvailable: !!alpha || !!options.isAlpha,
          });
        const match = path.match(
          /^\/api\/kites\/(routines|files|chats)(?:\/([^/]+))?(?:\/(run))?$/,
        );
        if (!match) throw fail(404, 'Not found.');
        const [, collection, encoded, action] = match;
        const id = encoded ? decodeURIComponent(encoded) : undefined;
        if (collection === 'routines' && action === 'run' && req.method === 'POST') {
          const routine = store.get(collection, id);
          if (!routine) throw fail(404, 'Routine not found.');
          try {
            return json(res, 202, scheduler.start(routine));
          } catch (error) {
            throw fail(409, error.message);
          }
        }
        if (req.method === 'DELETE' && id) {
          store.remove(collection, id);
          if (collection === 'chats') store.remove('reading', id);
          return json(res, 200, { ok: true });
        }
        if (req.method === 'POST' || req.method === 'PUT') {
          const data = await body(req);
          if (req.method === 'PUT' && (!id || !store.get(collection, id)))
            throw fail(404, 'Record not found.');
          let record;
          if (collection === 'routines') {
            let value;
            try {
              value = validateRoutine(data);
            } catch (error) {
              throw fail(400, error.message);
            }
            const agent = await runtime(`/api/v1/agents/${encodeURIComponent(value.agentId)}`, {
              signal: AbortSignal.timeout(10000),
            });
            if (!agent.ok) throw fail(400, 'The selected agent is unavailable.');
            record = { ...value, id, nextAt: nextOccurrence(value), updatedAt: Date.now() };
          } else if (collection === 'files') {
            if (
              typeof data.name !== 'string' ||
              !data.name.trim() ||
              data.name.length > 200 ||
              typeof data.content !== 'string' ||
              data.content.length > 1000000
            )
              throw fail(400, 'Use a file name and text of at most 1 MB.');
            record = {
              id,
              name: data.name,
              content: data.content,
              sessionId: typeof data.sessionId === 'string' ? data.sessionId : undefined,
              updatedAt: Date.now(),
            };
          } else {
            if (
              typeof data.id !== 'string' ||
              typeof data.title !== 'string' ||
              data.title.length > 200
            )
              throw fail(400, 'A conversation ID and title are required.');
            record = {
              id: id || data.id,
              ...store.get('chats', id || data.id),
              title: data.title,
              archived:
                typeof data.archived === 'boolean'
                  ? data.archived
                  : store.get('chats', id || data.id)?.archived === true,
              pinned: data.pinned === true,
              kind: data.kind || 'chat',
              avatar:
                typeof data.avatar === 'string' && data.avatar.length < 1000 ? data.avatar : '',
            };
          }
          return json(res, 200, store.put(collection, record));
        }
        throw fail(405, 'Method not allowed.');
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw fail(405, 'Method not allowed.');
      const root = resolve(options.webRoot || 'dist');
      let file = resolve(root, `.${decodeURIComponent(path)}`);
      if (file !== root && !file.startsWith(root + sep)) throw fail(403, 'Invalid path.');
      if (!existsSync(file) || !statSync(file).isFile()) file = resolve(root, 'index.html');
      if (!existsSync(file)) throw fail(503, 'Build Kites with npm run build first.');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https:; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
      );
      res.writeHead(200, {
        'Content-Type': mime[extname(file)] || 'application/octet-stream',
        'Cache-Control': extname(file) === '.html' ? 'no-cache' : 'public,max-age=3600',
      });
      if (req.method === 'HEAD') return res.end();
      await pipeline(createReadStream(file), res);
    } catch (error) {
      if (res.headersSent) {
        if (!res.destroyed) res.destroy();
        return;
      }
      if (!res.destroyed)
        json(res, error.status || 500, { error: error.message || 'An unexpected error occurred.' });
    }
  });
  return {
    server,
    store,
    scheduler,
    async listen(port = 4317) {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, resolve);
      });
      return server.address();
    },
    async close() {
      await scheduler.close();
      if (alpha) await alpha.close();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      store.close();
    },
  };
}
