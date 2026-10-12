import { validLanguage, menuTemplate } from './language.mjs';
import { app, BrowserWindow, Menu, shell, session, dialog, ipcMain } from 'electron';
import { join, dirname } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { alphaConnection } from '../server/alpha.mjs';
import { createKites } from '../server/app.mjs';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
let service, window, runtime;
let closing = false;
app.setName('Kites');
async function ensureRuntime() {
  const url = process.env.AGENTWAY_URL || 'http://127.0.0.1:8080';
  try {
    const res = await fetch(`${url}/api/v1/health`, {
      signal: AbortSignal.timeout(1500),
      headers: process.env.AGENTWAY_TOKEN
        ? { Authorization: `Bearer ${process.env.AGENTWAY_TOKEN}` }
        : {},
    });
    if (res.ok) return;
  } catch {
    /* Start the bundled local runtime when no host is available. */
  }
  if (process.env.AGENTWAY_URL) return;
  const binary = join(
    app.isPackaged ? process.resourcesPath : root,
    'bin',
    process.platform === 'win32' ? 'agentwayd.exe' : 'agentwayd',
  );
  if (!existsSync(binary)) return;
  const home = join(app.getPath('userData'), 'runtime');
  const cwd = join(app.getPath('userData'), 'workspace');
  mkdirSync(cwd, { recursive: true });
  runtime = spawn(binary, ['--listen', '127.0.0.1:8080', '--home', home, '--cwd', cwd], {
    stdio: 'ignore',
    env: {
      ...(existsSync(
        process.env.KITES_PROVIDER_CONFIG || join(app.getPath('userData'), 'providers.json'),
      )
        ? JSON.parse(
            readFileSync(
              process.env.KITES_PROVIDER_CONFIG || join(app.getPath('userData'), 'providers.json'),
              'utf8',
            ),
          )
        : {}),
      ...process.env,
    },
  });
  let exited = false;
  runtime.once('error', () => {
    exited = true;
  });
  runtime.once('exit', () => {
    exited = true;
  });
  for (let attempt = 0; attempt < 30 && !exited; attempt++) {
    try {
      if ((await fetch(`${url}/api/v1/health`, { signal: AbortSignal.timeout(500) })).ok) return;
    } catch {
      /* The process is starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
async function start() {
  await app.whenReady();
  const languageFile = join(app.getPath('userData'), 'language.json');
  let language = 'system';
  try {
    const saved = JSON.parse(readFileSync(languageFile, 'utf8'));
    if (validLanguage(saved)) language = saved;
  } catch {
    // First launch, or an invalid preference: use the operating system language.
  }
  const languageState = () => ({
    preference: language,
    systemLanguages: app.getPreferredSystemLanguages(),
  });
  const updateMenu = () => {
    if (closing) return;
    Menu.setApplicationMenu(
      Menu.buildFromTemplate(menuTemplate(language, app.getPreferredSystemLanguages())),
    );
  };
  let origin = process.env.KITES_SERVER_URL;
  if (!origin) {
    try {
      const existing = await fetch('http://127.0.0.1:4317/api/kites/state', {
        signal: AbortSignal.timeout(800),
        headers: process.env.KITES_ACCESS_TOKEN
          ? { Authorization: `Bearer ${process.env.KITES_ACCESS_TOKEN}` }
          : {},
      });
      if (existing.ok && Array.isArray((await existing.json()).routines))
        origin = 'http://127.0.0.1:4317';
    } catch {
      /* No existing Kites service; open a local space below. */
    }
  }
  let token = process.env.KITES_ACCESS_TOKEN || '';
  if (origin) {
    const url = new URL(origin);
    if (
      url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))
    )
      throw new Error('Use HTTPS for a remote Kites server.');
    origin = url.origin;
  } else {
    await ensureRuntime();
    token = randomBytes(32).toString('hex');
    service = createKites({
      ...alphaConnection(),
      alphaDatabase: join(app.getPath('userData'), 'kites-alpha.db'),
      database: process.env.KITES_DATABASE || join(app.getPath('userData'), 'kites.db'),
      webRoot: join(root, 'dist'),
      runtimeURL: process.env.AGENTWAY_URL,
      runtimeToken: process.env.AGENTWAY_TOKEN,
      accessToken: token,
    });
    const address = await service.listen(0);
    origin = `http://127.0.0.1:${address.port}`;
  }
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: [`${origin}/api/*`] },
    (details, callback) =>
      callback({
        requestHeaders: {
          ...details.requestHeaders,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      }),
  );
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false),
  );
  function open() {
    window = new BrowserWindow({
      title: 'Kites',
      width: 1280,
      height: 850,
      minWidth: 390,
      minHeight: 580,
      backgroundColor: '#ffffff',
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 20, y: 21 },
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: join(root, 'desktop/preload.cjs'),
      },
    });
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/.test(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    window.webContents.on('will-navigate', (event, url) => {
      if (new URL(url).origin !== origin) event.preventDefault();
    });
    void window.loadURL(`${origin}/?desktop=1`);
  }
  function checkSender(event) {
    if (
      !window ||
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame ||
      new URL(event.senderFrame.url).origin !== origin
    ) {
      throw new Error('Untrusted language request');
    }
  }
  ipcMain.handle('kites:language:get', (event) => {
    checkSender(event);
    return languageState();
  });
  ipcMain.handle('kites:language:set', (event, next) => {
    checkSender(event);
    if (!validLanguage(next)) throw new Error('Unsupported language');
    mkdirSync(app.getPath('userData'), { recursive: true });
    writeFileSync(languageFile, JSON.stringify(next), 'utf8');
    language = next;
    updateMenu();
    return languageState();
  });
  updateMenu();
  app.on('browser-window-focus', updateMenu);
  open();
  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) open();
  });
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    window?.show();
    window?.focus();
  });
  void start().catch((error) => {
    dialog.showErrorBox('Kites could not start', error.message);
    app.quit();
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('before-quit', (event) => {
    if (closing) return;
    event.preventDefault();
    closing = true;
    void (async () => {
      await service?.close();
      if (runtime && !runtime.killed) {
        const done = new Promise((resolve) => runtime.once('exit', resolve));
        runtime.kill('SIGTERM');
        await Promise.race([done, new Promise((resolve) => setTimeout(resolve, 3000))]);
        if (runtime.exitCode === null) runtime.kill('SIGKILL');
      }
      app.quit();
    })();
  });
}
