const $ = id => document.getElementById(id);
let state = { account: null, busy: false, adTimer: null, adsHidden: false };

document.querySelectorAll('[data-w]').forEach(b => b.onclick = () => sarex.invoke('win-ctl', b.dataset.w));

function say(t, err) { $('msg').textContent = t; $('msg').classList.toggle('err', !!err); }
function refresh() {
  const a = state.account;
  $('logged').hidden = !a; $('login').hidden = !!a;
  if (a) $('who').textContent = a.name + (a.type === 'offline' ? ' (sin cuenta)' : '');
  $('play').disabled = state.busy || !a;
  $('update').disabled = state.busy;
  if (!a && !state.busy) say('Inicia sesión para jugar.');
}
function showAd(ads, i = 0) {
  if (!ads.length || state.adsHidden) { $('ad').hidden = true; return; }
  const ad = ads[i % ads.length];
  $('ad').hidden = false; $('adtag').textContent = ad.tag || 'Patrocinado';
  $('adtext').textContent = ad.text; $('adtext').onclick = e => { e.preventDefault(); ad.url && sarex.invoke('open-url', ad.url); };
  clearTimeout(state.adTimer);
  if (ads.length > 1) state.adTimer = setTimeout(() => showAd(ads, i + 1), 45000);
}

sarex.on('progress', p => { $('prog').hidden = false; $('fill').style.width = Math.round((p.pct || 0) * 100) + '%'; say(p.text); });
sarex.on('busy', b => { state.busy = b; refresh(); if (!b) $('prog').hidden = true; });
sarex.on('game-started', () => say('Minecraft está abierto. Buen juego.'));
sarex.on('game-closed', () => { say('Listo para jugar otra vez.'); $('prog').hidden = true; });

async function run(action) {
  const r = await sarex.invoke(action);
  if (!r.ok) say(r.error, true);
}
$('play').onclick = () => run('play');
$('update').onclick = () => run('update');
$('folder').onclick = () => sarex.invoke('open-folder');
$('logout').onclick = async () => { await sarex.invoke('logout'); state.account = null; refresh(); };
$('ms').onclick = async () => {
  $('ms').disabled = true; say('Abriendo ventana de Microsoft…');
  const r = await sarex.invoke('login-ms'); $('ms').disabled = false;
  if (r.ok) { state.account = { type: 'ms', name: r.name }; say('Sesión iniciada.'); } else say(r.error, true);
  refresh();
};
$('offbtn').onclick = async () => {
  const r = await sarex.invoke('login-offline', $('offname').value);
  if (r.ok) { state.account = { type: 'offline', name: r.name }; say(''); } else say(r.error, true);
  refresh();
};
$('ram').oninput = e => { $('ramv').textContent = e.target.value + ' GB'; sarex.invoke('set-ram', +e.target.value); };
$('adclose').onclick = () => { state.adsHidden = true; $('ad').hidden = true; };

(async () => {
  const d = await sarex.invoke('init');
  state.account = d.account;
  $('ver').textContent = `Minecraft ${d.cfg.minecraft} con Fabric`;
  $('packname').textContent = d.manifest.packName || 'Pack de mods';
  const n = (d.manifest.mods || []).length;
  $('modcount').textContent = d.manifest._offline ? 'Sin conexión con el pack: se usará lo ya instalado.' : `${n} mods se instalan y actualizan solos.`;
  $('ram').value = d.ram; $('ramv').textContent = d.ram + ' GB';
  $('news').innerHTML = (d.manifest.news || []).slice(0, 4).map(x => `<article><h3></h3><p></p></article>`).join('');
  [...$('news').children].forEach((el, i) => { el.children[0].textContent = d.manifest.news[i].title; el.children[1].textContent = d.manifest.news[i].text; });
  showAd(d.manifest.ads || []);
  refresh(); if (state.account) say('Todo listo.');
})();
