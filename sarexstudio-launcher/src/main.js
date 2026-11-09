const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path'), fs = require('fs'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const { Client, Authenticator } = require('minecraft-launcher-core');
const { Auth } = require('msmc');

const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
const ROOT = path.join(app.getPath('appData'), '.sarexstudio');
const SETTINGS = path.join(ROOT, 'launcher.json');
let win, busy = false, manifest = null;

const readSettings = () => { try { return JSON.parse(fs.readFileSync(SETTINGS, 'utf8')); } catch { return { ram: 4 }; } };
const saveSettings = s => { fs.mkdirSync(ROOT, { recursive: true }); fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2)); };
const send = (ch, d) => win && !win.isDestroyed() && win.webContents.send(ch, d);
const status = (text, pct) => send('progress', { text, pct });
const sha1 = f => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');

async function download(url, dest, onBytes) {
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok) throw new Error(`No se pudo descargar (${r.status}): ${url}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const total = +r.headers.get('content-length') || 0; let got = 0;
  const ws = fs.createWriteStream(dest), rd = r.body.getReader();
  for (;;) { const { done, value } = await rd.read(); if (done) break; ws.write(value); got += value.length; onBytes && onBytes(got, total); }
  await new Promise(res => ws.end(res));
}

async function loadManifest() {
  try {
    const r = await fetch(CFG.manifestUrl, { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    manifest = await r.json();
  } catch {
    manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.local.json'), 'utf8'));
    manifest._offline = true;
  }
  return manifest;
}

// ---- Java 21 (1.21.1 lo necesita) ----
function findJava(dir) {
  const exe = process.platform === 'win32' ? 'javaw.exe' : 'java';
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { const f = walk(p); if (f) return f; }
    else if (e.name === exe && path.basename(d) === 'bin') return p; } };
  return fs.existsSync(dir) ? walk(dir) : null;
}
async function ensureJava() {
  const dir = path.join(ROOT, 'runtime');
  let j = findJava(dir); if (j) return j;
  const os = { win32: 'windows', darwin: 'mac', linux: 'linux' }[process.platform];
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x64';
  const url = `https://api.adoptium.net/v3/binary/latest/21/ga/${os}/${arch}/jre/hotspot/normal/eclipse`;
  const file = path.join(ROOT, process.platform === 'win32' ? 'java.zip' : 'java.tar.gz');
  await download(url, file, (g, t) => status('Descargando Java 21', t ? g / t * 0.4 : 0));
  status('Instalando Java 21', 0.4); fs.mkdirSync(dir, { recursive: true });
  execFileSync('tar', ['-xf', file, '-C', dir]); fs.unlinkSync(file);
  j = findJava(dir); if (!j) throw new Error('No se pudo instalar Java 21.');
  if (process.platform !== 'win32') fs.chmodSync(j, 0o755);
  return j;
}

// ---- Fabric ----
const mavenPath = n => { const [g, a, v] = n.split(':'); return `${g.replace(/\./g, '/')}/${a}/${v}/${a}-${v}.jar`; };
async function ensureFabric() {
  const s = readSettings(); let profile;
  try {
    const list = await (await fetch(`https://meta.fabricmc.net/v2/versions/loader/${CFG.minecraft}`)).json();
    const loader = (list.find(l => l.loader.stable) || list[0]).loader.version;
    profile = await (await fetch(`https://meta.fabricmc.net/v2/versions/loader/${CFG.minecraft}/${loader}/profile/json`)).json();
  } catch (e) {
    if (s.fabricId && fs.existsSync(path.join(ROOT, 'versions', s.fabricId, s.fabricId + '.json'))) return s.fabricId;
    throw new Error('No hay conexión para descargar Fabric.');
  }
  const id = profile.id, vdir = path.join(ROOT, 'versions', id);
  fs.mkdirSync(vdir, { recursive: true });
  fs.writeFileSync(path.join(vdir, id + '.json'), JSON.stringify(profile, null, 2));
  const libs = profile.libraries.filter(l => l.url);
  for (let i = 0; i < libs.length; i++) {
    const rel = mavenPath(libs[i].name), dest = path.join(ROOT, 'libraries', rel);
    status('Instalando Fabric', i / libs.length);
    if (!fs.existsSync(dest)) await download(libs[i].url.replace(/\/?$/, '/') + rel, dest);
  }
  saveSettings({ ...s, fabricId: id });
  return id;
}

// ---- Mods ----
async function syncMods() {
  const dir = path.join(ROOT, 'mods'); fs.mkdirSync(dir, { recursive: true });
  const mods = manifest.mods || [];
  for (let i = 0; i < mods.length; i++) {
    const m = mods[i], dest = path.join(dir, m.file);
    status(`Mods ${i + 1}/${mods.length}: ${m.file}`, i / Math.max(mods.length, 1));
    if (fs.existsSync(dest) && (!m.sha1 || sha1(dest) === m.sha1)) continue;
    await download(m.url, dest, (g, t) => t && status(`Mods ${i + 1}/${mods.length}: ${m.file}`, (i + g / t) / mods.length));
    if (m.sha1 && sha1(dest) !== m.sha1) { fs.unlinkSync(dest); throw new Error(`El mod ${m.file} llegó dañado.`); }
  }
  if (manifest.strict) { // todos con exactamente los mismos mods
    const keep = new Set(mods.map(m => m.file));
    for (const f of fs.readdirSync(dir)) if (f.endsWith('.jar') && !keep.has(f)) fs.unlinkSync(path.join(dir, f));
  }
}

// ---- Cuenta ----
async function getAuth() {
  const s = readSettings();
  if (s.account?.type === 'ms') {
    const am = new Auth('select_account');
    const mc = await (await am.refresh(s.account.token)).getMinecraft();
    return mc.mclc();
  }
  if (s.account?.type === 'offline') return Authenticator.getAuth(s.account.name);
  throw new Error('Inicia sesión primero.');
}

async function install() {
  const java = await ensureJava();
  const fabric = await ensureFabric();
  await syncMods();
  return { java, fabric };
}

async function guard(fn) {
  if (busy) return { ok: false, error: 'Ya hay una tarea en curso.' };
  busy = true; send('busy', true);
  try { await fn(); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
  finally { busy = false; send('busy', false); }
}

ipcMain.handle('init', async () => {
  const m = await loadManifest(), s = readSettings();
  return { cfg: CFG, manifest: m, ram: s.ram || 4, account: s.account ? { type: s.account.type, name: s.account.name } : null };
});
ipcMain.handle('login-ms', async () => {
  try {
    const am = new Auth('select_account');
    const xbox = await am.launch('electron'), mc = await xbox.getMinecraft();
    const name = mc.profile.name; saveSettings({ ...readSettings(), account: { type: 'ms', name, token: xbox.save() } });
    return { ok: true, name };
  } catch (e) { return { ok: false, error: 'No se pudo iniciar sesión con Microsoft.' }; }
});
ipcMain.handle('login-offline', (_e, name) => {
  name = String(name || '').trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) return { ok: false, error: 'Usa 3 a 16 letras, números o guion bajo.' };
  saveSettings({ ...readSettings(), account: { type: 'offline', name } }); return { ok: true, name };
});
ipcMain.handle('logout', () => { const s = readSettings(); delete s.account; saveSettings(s); return true; });
ipcMain.handle('set-ram', (_e, gb) => { saveSettings({ ...readSettings(), ram: gb }); return true; });
ipcMain.handle('open-folder', () => shell.openPath(ROOT));
ipcMain.handle('open-url', (_e, u) => /^https?:\/\//.test(u) && shell.openExternal(u));
ipcMain.handle('update', () => guard(async () => { await loadManifest(); await install(); status('Todo al día', 1); }));
ipcMain.handle('play', () => guard(async () => {
  const auth = await getAuth(); await loadManifest();
  const { java, fabric } = await install();
  const ram = readSettings().ram || 4, mc = new Client();
  mc.on('progress', e => e.total && status('Descargando Minecraft', e.task / e.total));
  mc.on('debug', d => send('log', d)); mc.on('data', d => send('log', String(d)));
  mc.on('close', () => { send('game-closed'); win && win.show(); });
  status('Iniciando Minecraft', 1);
  const proc = await mc.launch({
    authorization: auth, root: ROOT, javaPath: java,
    version: { number: CFG.minecraft, type: 'release', custom: fabric },
    memory: { max: `${ram}G`, min: '2G' }
  });
  if (!proc) throw new Error('Minecraft no pudo arrancar.');
  send('game-started'); win.minimize();
}));
ipcMain.handle('win-ctl', (_e, a) => { if (a === 'min') win.minimize(); if (a === 'close') win.close(); });

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1080, height: 660, minWidth: 900, minHeight: 600, frame: false, backgroundColor: '#12081a',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'index.html'));
});
app.on('window-all-closed', () => app.quit());
