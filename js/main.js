// Probador — arranque, cuentas, pantallas, salas y bucle principal
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { MAPS, MAP_IDS, DEFAULT_MAP } from './maps/index.js';
import { Character, charMaterial } from './character.js';
import { Crowd } from './npc.js';
import { FX } from './fx.js';
import { GameClient } from './game.js';
import { HostRules, ITEMS, ITEM_KEYS, COMBOS, lookStr, parseLook } from './rules.js';
import { LocalNet, OnlineNet, PEER_PREFIX } from './net.js';
import { makeBackend, niceError } from './backend.js';
import { tagMaterial, tagPreviewURL, TAG_STYLES } from './tags.js';
import { randomLook, sanitizeLook, COLORS, TOPS, BOTS, HATS, ACCS, HAIRS, HAIR_COLORS, SKINS, L } from './look.js';
import { initAudio, playMusic, stopMusic, sfx, setVolumes } from './audio.js';
import { store, makeCode, isTouch, clamp } from './util.js';

const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const Q = new URLSearchParams(location.search);
const BASE = new URL('.', import.meta.url).href.replace(/js\/$/, '');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hex = (n) => '#' + (n.hex ?? n).toString(16).padStart(6, '0');
const levelOf = (xp) => Math.floor(Math.sqrt((xp || 0) / 60)) + 1;
const ADMIN_LABELS = { players: 'Jugadores', today: 'Activos hoy', online: 'Conectados ahora', games: 'Partidas jugadas', gems: 'Gemas en juego', rooms: 'Salas abiertas', banned: 'Bloqueados' };
const EMOTES = { emo_saludo: { n: 'Saludo', e: '👋' }, emo_baile: { n: 'Baile', e: '🕺' }, emo_festejo: { n: 'Festejo', e: '🙌' }, emo_pose: { n: 'Pose de pasarela', e: '💃' }, emo_giro: { n: 'Giro', e: '🌀' } };
const NAMECOLORS = { nc_blanco: 'Blanco', nc_rosa: 'Rosa', nc_turquesa: 'Turquesa', nc_oro: 'Dorado', nc_arcoiris: 'Arcoíris', nc_t1: 'Temporada' };
// artículos que solo se consiguen en el pase de batalla
const EXCL = { col_t1: 'Color lila', nc_t1: 'Nombre de temporada', tag_t1: 'Cartel de temporada', emo_giro: 'Gesto: giro' };
const SEASON = { n: 'Temporada 1 · Gran Liquidación', end: '31/12', xp: 250, max: 30, price: 600 };
const KIND_ICON = { hat: { hat_corona: '👑', hat_gato: '🐱', hat_vincha: '🎀', hat_auris: '🎧' }, acc: { acc_collar: '📿', acc_alas: '🪽', acc_rinonera: '👝' } };

// ---------- ajustes ----------
const defaultQ = isTouch() ? 'media' : 'alta';
const settings = Object.assign({ quality: defaultQ, music: 0.55, sfx: 0.8, sens: 1, cam: 'far' }, store.get('settings', {}));
const saveSettings = () => store.set('settings', settings);
setVolumes(settings.music, settings.sfx);

// ---------- render ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: settings.quality !== 'baja', powerPreference: 'high-performance', preserveDrawingBuffer: !!Q.get('test') });
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
// reflejos suaves en todos los materiales (entorno de estudio)
let envTex = null, roomEnv = null; const pmrem = new THREE.PMREMGenerator(renderer);
roomEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; envTex = roomEnv; scene.environment = envTex;
// cielos HDR (fotos 360° reales) para luz y reflejos más naturales
const hdrCache = {};
function loadHdr(name) {
  if (!hdrCache[name]) hdrCache[name] = new RGBELoader().loadAsync(BASE + 'assets/hdr/' + name).then((t) => { t.mapping = THREE.EquirectangularReflectionMapping; return { bg: t, env: pmrem.fromEquirectangular(t).texture }; });
  return hdrCache[name];
}
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 450);
let composer = null;
let dynRes = 1; // resolución dinámica: baja sola si el celu va lento
function resize() {
  const pr = dynRes * (settings.quality === 'alta' ? Math.min(devicePixelRatio, 2) : settings.quality === 'media' ? Math.min(devicePixelRatio, 1.25) : Math.min(devicePixelRatio, 1));
  renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  if (composer) { composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight); }
}
function setupComposer() {
  if (settings.quality !== 'alta') { composer = null; return; }
  if (composer) return;
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // sombras suaves en rincones (solo en calidad alta)
  try { const ao = new GTAOPass(scene, camera, innerWidth, innerHeight, undefined, { radius: 0.45, distanceExponent: 1.3, thickness: 1.2, scale: 1.0, samples: 12 }); ao.blendIntensity = 0.85; composer.addPass(ao); } catch (e) { console.warn('ao', e); }
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.22, 0.45, 0.96));
  composer.addPass(new OutputPass());
  resize();
}
addEventListener('resize', resize); resize();

// ---------- estado global ----------
let W = null, fx = null, menuCrowd = null, preview = null, game = null, hemi = null, baseLight = null, gltfData = null, mapPending = null;
const be = makeBackend(!!Q.get('mock'));
let online = false;          // pudimos hablar con el servidor
let prof = null;             // perfil (null = invitada)
let shopCat = [];            // catálogo de la tienda
let screenName = 'loading';

const app = {
  scene, camera, renderer, settings,
  get W() { return W; }, get fx() { return fx; },
  net: null, rules: null, G: null, isHost: false, offset: 0, dark: 0,
  getG() { return app.G; },
  clockOffset() { return app.isHost ? 0 : app.offset; },
  hostPresence() { return app.hostPres || {}; },
  charShadows() { return settings.quality === 'alta'; },
  setMenuCrowd(on) { if (menuCrowd) menuCrowd.npcs.forEach((n) => { n.ch.root.visible = on; }); if (preview) preview.root.visible = on && screenName === 'home'; },
  showHud(on) { $('hud').classList.toggle('on', on); },
  // apagón: baja las luces de a poco
  setDark(v, dt) {
    if (!W || !baseLight) return;
    app.dark = dt === undefined ? v : app.dark + (v - app.dark) * Math.min(1, dt * 3);
    const d = app.dark;
    W.sun.intensity = baseLight.sun * (1 - 0.92 * d);
    if (hemi) hemi.intensity = baseLight.hemi * (1 - 0.86 * d);
    renderer.toneMappingExposure = 0.95 * (1 - 0.55 * d);
    scene.environment = d > 0.25 ? null : envTex; if (scene.background) scene.backgroundIntensity = 1 - 0.85 * d;
    if (scene.fog) { scene.fog.color.copy(baseLight.fog).lerp(new THREE.Color(0x0b0612), d); scene.fog.far = 200 - 150 * d; }
  },
  input: null,
};

function applyQuality() {
  const q = settings.quality;
  renderer.shadowMap.enabled = q !== 'baja';
  if (W) {
    W.sun.castShadow = q !== 'baja';
    W.sun.shadow.mapSize.set(q === 'alta' ? 2048 : 1024, q === 'alta' ? 2048 : 1024);
    if (W.sun.shadow.map) { W.sun.shadow.map.dispose(); W.sun.shadow.map = null; }
    renderer.shadowMap.autoUpdate = q === 'alta';
    renderer.shadowMap.needsUpdate = true;
    const cs = q === 'alta';
    if (menuCrowd) menuCrowd.setShadow(cs);
    if (game) for (const [, c] of game.chars) c.ch.setShadow(cs);
    if (preview) preview.setShadow(true);
  }
  setupComposer(); resize();
}

// ---------- mapas ----------
function disposeMap(w) {
  scene.remove(w.root);
  const CM = charMaterial();
  w.root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) for (const m of (Array.isArray(o.material) ? o.material : [o.material])) { if (m === CM) continue; for (const k of ['map', 'emissiveMap']) if (m[k] && m[k].isCanvasTexture) m[k].dispose(); m.dispose(); }
  });
  if (w.sun && w.sun.shadow.map) { w.sun.shadow.map.dispose(); w.sun.shadow.map = null; }
}
function loadMap(id) {
  if (!MAPS[id]) id = DEFAULT_MAP;
  if (W && W.id === id) return;
  if (W) { if (game) game.stop(); disposeMap(W); }
  if (menuCrowd) { menuCrowd.dispose(); menuCrowd = null; }
  const root = new THREE.Group(); root.name = 'mapa-' + id;
  W = MAPS[id].build(root, gltfData);
  scene.add(root);
  scene.fog = W.fog ? new THREE.Fog(W.fog.color, W.fog.near, W.fog.far) : null;
  hemi = null; root.traverse((o) => { if (o.isHemisphereLight && !hemi) hemi = o; });
  baseLight = { sun: W.sun.intensity, hemi: hemi ? hemi.intensity : 1, fog: scene.fog ? scene.fog.color.clone() : new THREE.Color() };
  menuCrowd = new Crowd(W, scene, 1234, id === 'feria' ? 26 : 16, { shadow: settings.quality === 'alta' });
  envTex = roomEnv; scene.environment = envTex; scene.background = null;
  if (W.hdr) loadHdr(W.hdr).then((h) => { if (!W || W.id !== id) return; envTex = h.env; scene.environment = h.env; if (W.hdrBg) { scene.background = h.bg; scene.backgroundIntensity = 1; } }).catch((e) => console.warn('hdr', e));
  const m = W.menu; if (preview) { preview.root.position.set(m.px, m.py, m.pz); preview.root.rotation.y = m.ry; }
  store.set('lastMap', id);
  applyQuality(); renderer.shadowMap.needsUpdate = true;
}
// cambiar de mapa mostrando la pantalla de carga un instante
function requestMap(id) {
  if (mapPending || !MAPS[id] || (W && W.id === id)) return;
  mapPending = id; $('loadMsg').textContent = `Armando ${MAPS[id].n}…`; $('loadBar').style.width = '60%'; $('loading').classList.add('on');
  setTimeout(() => { try { loadMap(id); } catch (e) { console.error(e); } mapPending = null; $('loading').classList.remove('on'); renderLobby.k = ''; }, 80);
}

// ---------- mi look y cosméticos ----------
let myLook = store.get('look', null) || randomLook();
const cosm = () => ({ ts: (prof && prof.tag_style) || 'tag_clasico', nc: (prof && prof.name_color) || 'nc_blanco', em: (prof && prof.emote) || 'emo_saludo' });
const owned = () => (prof && prof.owned) || [];
const myName = () => (prof ? prof.username : (store.get('guestName', '') || 'Invitada'));
function lookFromProfile() {
  const l = prof && parseLook(prof.look);
  myLook = sanitizeLook(l && l.length === 14 && l.every((v) => Number.isFinite(v)) ? l : (store.get('look', null) || randomLook()), owned());
  if (preview) preview.setLook(myLook);
  refreshPreviewTag();
}
function refreshPreviewTag() { if (preview) preview.setTag(tagMaterial(777, cosm().ts, '')); }
let saveT = 0;
function queueSave(fields) {
  if (!prof) { store.set('look', myLook); return; }
  Object.assign(prof, fields);
  clearTimeout(saveT);
  saveT = setTimeout(async () => { try { await be.saveProfile(fields); } catch (e) { notify('No se pudo guardar: ' + niceError(e)); } }, 700);
}
function setLook(l) { myLook = l; store.set('look', l); if (preview) { preview.setLook(l); preview.waveT = 1.1; } queueSave({ look: lookStr(l) }); renderCloset(); }

// ---------- carga ----------
async function boot() {
  const bar = $('loadBar');
  bar.style.width = '10%';
  const beInit = be.init().then(() => { online = true; }).catch((e) => { console.warn('backend', e); online = false; });
  try { await document.fonts.load('400 40px "Bagel Fat One"'); } catch (e) { }
  bar.style.width = '25%';
  const mod = await import(BASE + 'assets/props.js');
  bar.style.width = '50%';
  const raw = atob(mod.default); const bin = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) bin[i] = raw.charCodeAt(i);
  const gltf = await new GLTFLoader().parseAsync(bin.buffer, BASE + 'assets/');
  $('loadMsg').textContent = 'Colgando la ropa…';
  await new Promise((r) => setTimeout(r, 30));
  gltfData = gltf;
  fx = new FX(scene, renderer, { quality: () => settings.quality, crowd: () => menuCrowd, mannequins: () => (W ? W.mannequins : []) });
  preview = new Character(myLook, { shadow: true }); scene.add(preview.root); refreshPreviewTag();
  bar.style.width = '75%';
  loadMap(MAPS[Q.get('map')] ? Q.get('map') : (store.get('lastMap', '') || DEFAULT_MAP));
  game = new GameClient(app);
  app.input = input;
  $('loadMsg').textContent = 'Conectando…';
  await beInit;
  bar.style.width = '100%';
  renderer.compile(scene, camera);
  requestAnimationFrame(loop);
  be.onAuth && be.onAuth((ev) => { if (ev === 'PASSWORD_RECOVERY') recovering = true; });
  if (online && be.user) await enterWithAccount();
  else showAuth(online ? '' : 'No pudimos conectar con el servidor. Podés practicar sin cuenta mientras tanto.');
  $('loading').classList.remove('on');
}
let recovering = /type=recovery/.test(location.hash);

// ---------- pantallas ----------
function show(s) {
  screenName = s;
  for (const id of ['auth', 'home', 'hud', 'results']) $(id).classList.toggle('on', id === s);
  document.body.classList.toggle('playing', s === 'hud');
  if (preview) preview.root.visible = s === 'home';
  if (s === 'home' || s === 'auth') { app.setMenuCrowd(true); playMusic('menu'); }
}
function openSheet(id) { $(id).classList.add('on'); }
function closeSheet(id) { $(id).classList.remove('on'); }
document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-close]');
  if (c) { const sh = c.closest('.sheet'); if (sh) sh.classList.remove('on'); sfx.click(); }
  else if (e.target.classList && e.target.classList.contains('sheet') && e.target.id !== 'lobby') { e.target.classList.remove('on'); }
});
addEventListener('pointerdown', () => { initAudio(); if (screenName === 'home' || screenName === 'auth') playMusic('menu'); });
function msg(t, b) { $('msgT').textContent = t; $('msgB').textContent = b; openSheet('sMsg'); }
function notify(text) {
  let box = $('notes');
  if (!box) { box = document.createElement('div'); box.id = 'notes'; box.style.cssText = 'position:fixed;left:50%;bottom:calc(18px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:90;display:flex;flex-direction:column;gap:6px;align-items:center;pointer-events:none'; document.body.appendChild(box); }
  const el = document.createElement('div');
  el.style.cssText = 'background:#fff4e0;color:#1a0d22;font-weight:800;font-size:14px;padding:9px 16px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.35);max-width:80vw;text-align:center';
  el.textContent = text; box.appendChild(el); setTimeout(() => el.remove(), 3200);
}
const setBusy = (btn, on, label) => { btn.disabled = on; if (label) btn.textContent = label; };

// ================= INICIO DE SESIÓN =================
let authMode = 'in';
function showAuth(note = '') {
  show('auth'); setAuthMode('in');
  $('authMsg').textContent = note; $('authMsg').className = 'msgline';
}
function setAuthMode(m) {
  authMode = m;
  $$('#authTabs button').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
  $('authTabs').classList.toggle('hidden', m === 'forgot');
  $('fUser').classList.toggle('hidden', m !== 'up');
  $('aPass').parentElement.classList.toggle('hidden', m === 'forgot');
  $('aPass').autocomplete = m === 'up' ? 'new-password' : 'current-password';
  $('authGo').textContent = m === 'in' ? 'Entrar' : m === 'up' ? 'Crear mi cuenta' : 'Mandarme el link';
  $('aForgot').textContent = m === 'forgot' ? '← Volver' : '¿Olvidaste tu contraseña?';
  $('authMsg').textContent = '';
}
$('authTabs').onclick = (e) => { const b = e.target.closest('button'); if (b) { sfx.click(); setAuthMode(b.dataset.m); } };
$('aForgot').onclick = () => setAuthMode(authMode === 'forgot' ? 'in' : 'forgot');
$('aGuest').onclick = () => { sfx.click(); prof = null; enterHome(); };
$('authForm').onsubmit = async (e) => {
  e.preventDefault();
  const email = $('aEmail').value.trim().toLowerCase(), pass = $('aPass').value, user = $('aUser').value.trim();
  const out = $('authMsg'); out.className = 'msgline';
  if (!online) { out.textContent = 'Sin conexión con el servidor. Probá de nuevo en un rato.'; try { await be.init(); online = true; } catch (x) { return; } }
  if (!/^\S+@\S+\.\S+$/.test(email)) { out.textContent = 'Escribí un email válido.'; return; }
  if (authMode !== 'forgot' && pass.length < 6) { out.textContent = 'La contraseña tiene que tener al menos 6 caracteres.'; return; }
  if (authMode === 'up' && !/^[\wÁÉÍÓÚáéíóúÑñ .-]{3,14}$/.test(user)) { out.textContent = 'El nombre tiene que tener entre 3 y 14 letras o números.'; return; }
  const btn = $('authGo'); const label = btn.textContent; setBusy(btn, true, 'Un momento…');
  try {
    if (authMode === 'in') { await be.signIn(email, pass); await enterWithAccount(); }
    else if (authMode === 'up') {
      const r = await be.signUp(email, pass, user, lookStr(myLook));
      if (r.needsConfirm) { out.className = 'msgline ok'; out.textContent = '¡Listo! Te mandamos un email para confirmar la cuenta. Después entrá desde acá.'; setAuthMode('in'); $('aEmail').value = email; out.className = 'msgline ok'; out.textContent = 'Te mandamos un email para confirmar la cuenta. Confirmala y después entrá.'; }
      else await enterWithAccount(true);
    } else { await be.resetPassword(email); out.className = 'msgline ok'; out.textContent = 'Si existe esa cuenta, te llegó un email con un link para cambiar la contraseña.'; }
  } catch (err) { out.className = 'msgline'; out.textContent = niceError(err); }
  setBusy(btn, false, label);
};

async function enterWithAccount(isNew) {
  try { prof = await be.loadProfile(); }
  catch (e) { showAuth(niceError(e)); return; }
  if (prof.banned) { await be.signOut().catch(() => { }); prof = null; showAuth('Tu cuenta está bloqueada. Hablá con la administradora.'); return; }
  lookFromProfile();
  be.touch();
  enterHome();
  if (isNew) notify(`¡Bienvenida, ${prof.username}! Tenés ${prof.gems} 💎 de regalo.`);
  if (recovering) { recovering = false; openProfile(); $('pfMsg').className = 'msgline ok'; $('pfMsg').textContent = 'Escribí tu contraseña nueva y tocá "Cambiar".'; $('pfPass').focus(); }
  be.shop().then((s) => { shopCat = s || []; renderCloset(); }).catch(() => { });
  be.passRewards().then((r) => { passCat = r; renderHome(); }).catch(() => { });
}
setInterval(() => { if (prof) be.touch(); }, 60000);

// ================= MENÚ PRINCIPAL =================
function enterHome() {
  show('home'); renderHome();
  const sala = Q.get('sala');
  if (sala && !enterHome.done) { enterHome.done = true; openPlay('code'); const c = sala.toUpperCase().slice(0, 4); $$('#codeIn input').forEach((el, i) => { el.value = c[i] || ''; }); }
}
function renderHome() {
  const c = cosm();
  $('hName').textContent = myName(); $('hName').className = 'nm ' + c.nc;
  $('hAvatar').textContent = myName().slice(0, 1).toUpperCase();
  $('hAvatar').style.background = hex(COLORS[myLook[L.TOPC]] || COLORS[0]);
  if (prof) {
    $('hLevel').textContent = `Nivel ${levelOf(prof.xp)}${prof.is_admin ? ' · admin' : ''}`;
    $('hGems').textContent = prof.gems; $('hGems').parentElement.classList.remove('hidden');
    const last = prof.last_daily ? new Date(prof.last_daily).getTime() : 0;
    $('bDaily').classList.toggle('hidden', Date.now() - last < 20 * 3600e3);
  } else {
    $('hLevel').textContent = 'Tocá para crear tu cuenta';
    $('hGems').parentElement.classList.add('hidden'); $('bDaily').classList.add('hidden');
  }
  $('bAdmin').classList.toggle('hidden', !(prof && prof.is_admin));
  $('shGems').textContent = prof ? prof.gems : 0;
  $('passDot').classList.toggle('hidden', !(prof && passCat && passClaimables().length));
}
$('bProfile').onclick = () => { sfx.click(); prof ? openProfile() : showAuth(); if (!prof) setAuthMode('up'); };
$('bDaily').onclick = async () => {
  try { const r = await be.claimDaily(); if (r.gained) { prof = be.profile; sfx.fanfare(); notify(`🎁 ¡+${r.gained} gemas!`); } else notify('Ya lo abriste. Volvé mañana.'); prof.last_daily = new Date().toISOString(); renderHome(); }
  catch (e) { notify(niceError(e)); }
};
let previewSpin = 0;
for (const [id, d] of [['tL', -1], ['tR', 1]]) {
  const b = $(id);
  b.addEventListener('pointerdown', () => { previewSpin = d; }); b.addEventListener('pointerup', () => { previewSpin = 0; }); b.addEventListener('pointerleave', () => { previewSpin = 0; });
}
$('bPlay').onclick = () => { sfx.click(); openPlay(prof ? 'rooms' : 'practice'); };
$('bCloset').onclick = () => { sfx.click(); clTab = 'top'; renderCloset(); openSheet('sCloset'); };
$('bShop').onclick = () => { sfx.click(); openShop('cons'); };
$('bPass').onclick = () => { sfx.click(); openPass(); };
$('bRank').onclick = () => { sfx.click(); openRank('wins'); };
$('bHow').onclick = () => { sfx.click(); openSheet('sHow'); };
$('bAdmin').onclick = () => { sfx.click(); openAdmin(); };
$('bSettings').onclick = () => { sfx.click(); renderSettings(); $('setQuit').classList.add('hidden'); openSheet('sSettings'); };

// ================= JUGAR =================
const cfgDraft = Object.assign({ max: 6, dur: 300, lives: 3, mode: 'ffa', pub: true, name: '', map: DEFAULT_MAP }, store.get('cfg2', {}));
if (!MAPS[cfgDraft.map]) cfgDraft.map = DEFAULT_MAP;
let practiceMap = MAPS[store.get('pmap', '')] ? store.get('pmap', '') : DEFAULT_MAP;
const mapButtons = (sel) => MAP_IDS.map((id) => `<button data-v="${id}" class="${id === sel ? 'on' : ''}">${MAPS[id].e} ${MAPS[id].n}</button>`).join('');
let practiceBots = 3, practiceTut = !store.get('tutDone2', 0);
function openPlay(tab) { setPlayTab(tab); openSheet('sPlay'); }
function setPlayTab(t) {
  $$('#playTabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
  $$('#sPlay [data-p]').forEach((p) => p.classList.toggle('hidden', p.dataset.p !== t));
  if (t === 'rooms') loadRooms();
  if (t === 'create') renderCreate();
  if (t === 'practice') { $('pMap').innerHTML = mapButtons(practiceMap); $('pBots').textContent = practiceBots; $('pTut').classList.toggle('on', practiceTut); }
  if (t === 'code') { $('joinMsg').textContent = prof ? '' : 'Necesitás una cuenta para jugar online.'; setTimeout(() => { const f = $$('#codeIn input').find((i) => !i.value); (f || $$('#codeIn input')[0]).focus(); }, 60); }
}
$('playTabs').onclick = (e) => { const b = e.target.closest('button'); if (b) { sfx.click(); setPlayTab(b.dataset.t); } };
async function loadRooms() {
  const box = $('roomList');
  if (!prof) { box.innerHTML = `<div class="empty">Para jugar online con amigas necesitás una cuenta.<br><button class="btn primary" id="goSignup" style="margin-top:12px">Crear cuenta</button></div>`; $('goSignup').onclick = () => { closeSheet('sPlay'); showAuth(); setAuthMode('up'); }; return; }
  box.innerHTML = '<div class="empty">Buscando salas…</div>';
  try {
    const rooms = await be.listRooms();
    if (!rooms.length) { box.innerHTML = `<div class="empty">No hay salas abiertas ahora.<br>¡Creá una y pasale el código a tus amigas!</div>`; return; }
    box.innerHTML = rooms.map((r) => `<div class="item"><div class="t"><b>${esc(r.name || 'Sala de ' + r.host_name)}</b><small>${r.mode === 'teams' ? 'Equipos' : 'Todos contra todos'} · ${r.players || 1}/${r.max_players} · ${r.status === 'play' ? 'jugando' : 'esperando'}</small></div><button class="btn yellow" data-join="${esc(r.code)}" ${r.status === 'play' ? 'disabled' : ''}>Entrar</button></div>`).join('');
  } catch (e) { box.innerHTML = `<div class="empty">${esc(niceError(e))}</div>`; }
}
$('roomList').addEventListener('click', (e) => { const b = e.target.closest('[data-join]'); if (b) startSession('join', { code: b.dataset.join, errEl: $('roomList') }); });
$('bRefresh').onclick = () => { sfx.click(); loadRooms(); };
function renderCreate() {
  $('cMax').textContent = cfgDraft.max; $('cLives').textContent = cfgDraft.lives;
  $$('#cDur button').forEach((b) => b.classList.toggle('on', +b.dataset.v === cfgDraft.dur));
  $$('#cMode button').forEach((b) => b.classList.toggle('on', b.dataset.v === cfgDraft.mode));
  $('cMap').innerHTML = mapButtons(cfgDraft.map);
  $('cPublic').classList.toggle('on', cfgDraft.pub);
  if (!$('cName').value) $('cName').value = cfgDraft.name || (prof ? 'La sala de ' + prof.username : '');
  $('createMsg').textContent = prof ? '' : 'Necesitás una cuenta para crear salas online.';
}
$$('#sPlay [data-s]').forEach((b) => b.addEventListener('click', () => {
  const k = b.dataset.s, d = +b.dataset.d;
  cfgDraft[k] = k === 'max' ? clamp(cfgDraft[k] + d, 2, 12) : clamp(cfgDraft[k] + d, 1, 5); sfx.click(); renderCreate();
}));
$('cDur').onclick = (e) => { const b = e.target.closest('button'); if (b) { cfgDraft.dur = +b.dataset.v; sfx.click(); renderCreate(); } };
$('cMap').onclick = (e) => { const b = e.target.closest('button'); if (b) { cfgDraft.map = b.dataset.v; sfx.click(); renderCreate(); } };
$('pMap').onclick = (e) => { const b = e.target.closest('button'); if (b) { practiceMap = b.dataset.v; store.set('pmap', practiceMap); sfx.click(); $('pMap').innerHTML = mapButtons(practiceMap); } };
$('lMap').onclick = (e) => { const b = e.target.closest('button'); if (b && app.isHost && !mapPending) { app.rules.setCfg({ map: b.dataset.v }); sfx.click(); } };
$('cMode').onclick = (e) => { const b = e.target.closest('button'); if (b) { cfgDraft.mode = b.dataset.v; sfx.click(); renderCreate(); } };
$('cPublic').onclick = () => { cfgDraft.pub = !cfgDraft.pub; sfx.click(); renderCreate(); };
$('bCreateGo').onclick = () => { cfgDraft.name = $('cName').value.trim().slice(0, 30); store.set('cfg2', cfgDraft); startSession('host', { errEl: $('createMsg') }); };
$('bJoinGo').onclick = () => { const code = $$('#codeIn input').map((i) => i.value).join('').toUpperCase(); if (code.length !== 4) { $('joinMsg').textContent = 'El código tiene 4 letras.'; return; } startSession('join', { code, errEl: $('joinMsg') }); };
$$('#codeIn input').forEach((el, i, all) => {
  el.addEventListener('input', () => { el.value = el.value.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 1); if (el.value && all[i + 1]) all[i + 1].focus(); });
  el.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !el.value && all[i - 1]) all[i - 1].focus(); if (e.key === 'Enter') $('bJoinGo').click(); });
  el.addEventListener('paste', (e) => { const t = (e.clipboardData.getData('text') || '').replace(/[^a-zA-Z]/g, '').toUpperCase(); if (t.length >= 4) { e.preventDefault(); all.forEach((x, k) => { x.value = t[k] || ''; }); all[3].focus(); } });
});
$$('#sPlay [data-b]').forEach((b) => b.addEventListener('click', () => { practiceBots = clamp(practiceBots + +b.dataset.b, 1, 8); $('pBots').textContent = practiceBots; sfx.click(); }));
$('pTut').onclick = () => { practiceTut = !practiceTut; $('pTut').classList.toggle('on', practiceTut); sfx.click(); };
$('bPracticeGo').onclick = () => { app.wantTutorial = practiceTut; startSession('practice', { bots: practiceBots }); };
$('bTutorial').onclick = () => { closeSheet('sHow'); app.wantTutorial = true; startSession('practice', { bots: 3 }); };

// ================= VESTIDOR =================
const CL_TABS = [
  { k: 'top', n: '👕 Arriba' }, { k: 'bot', n: '👖 Abajo' }, { k: 'shoe', n: '👟 Calzado' }, { k: 'hat', n: '🧢 Cabeza' }, { k: 'acc', n: '👜 Accesorio' }, { k: 'body', n: '💇 Pelo y piel' },
  { k: 'tag', n: '🏷️ Cartel' }, { k: 'name', n: '✨ Nombre' }, { k: 'emote', n: '😄 Gesto' },
];
let clTab = 'top';
const priceOf = (id) => { const it = shopCat.find((s) => s.id === id); return it ? it.price : ''; };
const has = (id) => !id || owned().includes(id);
const lockTxt = (id) => (EXCL[id] ? '🎟️ Pase' : '💎' + priceOf(id));
function swatches(idx, list, label, shopable = true) {
  return `<div class="sec"><h4>${label}</h4><div class="sw">${list.map((c, i) => { const lock = shopable && c.shop && !has(c.shop); return `<button data-i="${idx}" data-v="${i}" ${lock ? `data-lock="color"` : ''} class="${myLook[idx] === i ? 'on' : ''} ${lock ? 'lock' : ''}" style="background:${hex(c)}" aria-label="${esc(c.m || 'color')}"></button>`; }).join('')}</div></div>`;
}
function optsRow(idx, list, label, kind) {
  return `<div class="sec"><h4>${label}</h4><div class="opts">${list.map((o, i) => { const n = o.n ?? o; const lock = o.shop && !has(o.shop); return `<button data-i="${idx}" data-v="${i}" ${lock ? `data-lock="${kind}"` : ''} class="opt ${myLook[idx] === i ? 'on' : ''} ${lock ? 'lock' : ''}">${lock ? '🔒 ' : ''}${esc(n)}${lock ? `<span class="pr">${lockTxt(o.shop)}</span>` : ''}</button>`; }).join('')}</div></div>`;
}
function renderCloset() {
  if (!$('clTabs')) return;
  $('clTabs').innerHTML = CL_TABS.map((t) => `<button class="chip ${t.k === clTab ? 'on' : ''}" data-t="${t.k}">${t.n}</button>`).join('');
  let h = ''; const c = cosm();
  if (clTab === 'top') h = optsRow(L.TOP, TOPS, 'Prenda') + optsRow(L.TOPP, ['Liso', 'Rayas', 'Lunares', 'Cuadros'], 'Estampado') + swatches(L.TOPC, COLORS, 'Color');
  if (clTab === 'bot') h = optsRow(L.BOT, BOTS, 'Prenda') + optsRow(L.BOTP, ['Liso', 'A cuadros'], 'Estampado') + swatches(L.BOTC, COLORS, 'Color');
  if (clTab === 'shoe') h = swatches(L.SHOE, COLORS, 'Zapatillas');
  if (clTab === 'hat') h = optsRow(L.HAT, HATS, 'Qué llevás', 'hat') + (HATS[myLook[L.HAT]].nocolor || myLook[L.HAT] === 0 ? '' : swatches(L.HATC, COLORS, 'Color'));
  if (clTab === 'acc') h = optsRow(L.ACC, ACCS, 'Accesorio', 'acc') + (ACCS[myLook[L.ACC]].nocolor || myLook[L.ACC] === 0 ? '' : swatches(L.ACCC, COLORS, 'Color'));
  if (clTab === 'body') h = optsRow(L.HAIR, HAIRS, 'Peinado') + swatches(L.HAIRC, HAIR_COLORS, 'Color de pelo', false) + swatches(L.SKIN, SKINS, 'Piel', false);
  if (clTab === 'tag') h = `<div class="sec"><h4>Estilo del cartel de tu frente</h4><div class="tagGrid">${Object.entries(TAG_STYLES).map(([id, s]) => { const lock = id !== 'tag_clasico' && !has(id); if (lock && EXCL[id] && !prof) return ''; return `<button class="tagCard ${c.ts === id ? 'on' : ''} ${lock ? 'lock' : ''}" data-cos="tag_style" data-id="${id}" ${lock ? 'data-lock="tag"' : ''}><img src="${tagPreviewURL(id, 777)}" alt="">${lock ? '🔒 ' : ''}${s.n}${lock ? ` <span class="gem">${lockTxt(id)}</span>` : ''}</button>`; }).join('')}</div></div>`;
  if (clTab === 'name') h = `<div class="sec"><h4>Color de tu nombre</h4><div class="list">${Object.entries(NAMECOLORS).map(([id, n]) => { const lock = id !== 'nc_blanco' && !has(id); return `<button class="item" style="text-align:left" data-cos="name_color" data-id="${id}" ${lock ? 'data-lock="namecolor"' : ''}><div class="t"><b class="${id}" style="font-size:18px">${esc(myName())}</b><small>${n}</small></div>${c.nc === id ? '✅' : lock ? `🔒 <span class="gem">${lockTxt(id)}</span>` : ''}</button>`; }).join('')}</div></div>`;
  if (clTab === 'emote') h = `<div class="sec"><h4>Tu gesto (botón 😄 en la partida)</h4><div class="list">${Object.entries(EMOTES).map(([id, e]) => { const lock = id !== 'emo_saludo' && !has(id); return `<button class="item" style="text-align:left" data-cos="emote" data-id="${id}" ${lock ? 'data-lock="emote"' : ''}><span style="font-size:28px">${e.e}</span><div class="t"><b>${e.n}</b><small>${lock ? 'En la tienda' : 'Tocá para probarlo'}</small></div>${c.em === id ? '✅' : lock ? `🔒 <span class="gem">${lockTxt(id)}</span>` : ''}</button>`; }).join('')}</div></div>`;
  if (['top', 'bot', 'shoe', 'hat', 'acc'].includes(clTab)) h += `<div class="sec"><button class="btn block" id="bRandom">🎲 Combinación al azar</button></div>`;
  if (!prof) h += `<p style="color:var(--muted);font-size:12.5px;margin-top:14px">Con una cuenta tu ropa queda guardada y podés comprar cosas en la tienda.</p>`;
  $('clBody').innerHTML = h;
  const r = $('bRandom'); if (r) r.onclick = () => { const l = randomLook(); for (const i of [L.HAIR, L.HAIRC, L.SKIN]) l[i] = myLook[i]; sfx.pop(); setLook(l); };
}
const ANIM_OF_EMOTE = { emo_saludo: 'wave', emo_baile: 'dance', emo_festejo: 'cheer', emo_pose: 'pose' };
$('clTabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; clTab = b.dataset.t; sfx.click(); renderCloset(); });
$('clBody').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b || b.id === 'bRandom') return;
  if (b.dataset.lock) {
    sfx.click(); if (!prof) { notify('Creá una cuenta para conseguir cosas de la tienda.'); return; }
    const v = +b.dataset.v; const i = +b.dataset.i;
    const id = b.dataset.id || (i === L.HAT ? HATS[v].shop : i === L.ACC ? ACCS[v].shop : (COLORS[v] || {}).shop);
    closeSheet('sCloset');
    if (id && EXCL[id]) { notify('Se consigue en el Pase de batalla 🎟️'); openPass(); } else openShop(b.dataset.lock);
    return;
  }
  if (b.dataset.cos) {
    sfx.click(); const id = b.dataset.id;
    if (!prof) { notify('Creá una cuenta para personalizar esto.'); return; }
    queueSave({ [b.dataset.cos]: id });
    if (b.dataset.cos === 'tag_style') refreshPreviewTag();
    if (b.dataset.cos === 'emote' && preview) { preview.emoA = ANIM_OF_EMOTE[id]; preview.emoT = 2.6; }
    renderCloset(); renderHome(); return;
  }
  const l = myLook.slice(); l[+b.dataset.i] = +b.dataset.v; sfx.click(); setLook(l);
});

// ================= TIENDA =================
const SHOP_TABS = [{ k: 'cons', n: '🎒 Objetos' }, { k: 'color', n: '🎨 Colores' }, { k: 'hat', n: '👑 Cabeza' }, { k: 'acc', n: '🪽 Accesorios' }, { k: 'tag', n: '🏷️ Carteles' }, { k: 'namecolor', n: '✨ Nombres' }, { k: 'emote', n: '💃 Gestos' }];
let shopTab = 'color';
let consCat = [];
async function openShop(tab) {
  shopTab = tab || 'cons'; openSheet('sShop'); $('shopMsg').textContent = '';
  if (!consCat.length) { try { consCat = await be.consumables(); } catch (e) { } }
  if (!shopCat.length) { $('shopGrid').innerHTML = '<div class="empty">Cargando…</div>'; try { shopCat = await be.shop(); } catch (e) { $('shopGrid').innerHTML = `<div class="empty">${esc(niceError(e))}</div>`; return; } }
  renderShop();
}
function shopPreview(it) {
  if (it.kind === 'color') { const c = COLORS.find((x) => x.shop === it.id); return `<div class="pv" style="background:${c ? hex(c) : '#888'}"></div>`; }
  if (it.kind === 'tag') return `<div class="pv"><img src="${tagPreviewURL(it.id, 777)}" alt=""></div>`;
  if (it.kind === 'namecolor') return `<div class="pv" style="font-family:var(--display);font-size:24px"><span class="${it.id}">${esc(myName())}</span></div>`;
  if (it.kind === 'emote') return `<div class="pv">${(EMOTES[it.id] || {}).e || '✨'}</div>`;
  return `<div class="pv">${(KIND_ICON[it.kind] || {})[it.id] || '🎁'}</div>`;
}
function renderShop() {
  $('shTabs').innerHTML = SHOP_TABS.map((t) => `<button class="chip ${t.k === shopTab ? 'on' : ''}" data-t="${t.k}">${t.n}</button>`).join('');
  $('shGems').textContent = prof ? prof.gems : 0;
  if (shopTab === 'cons') {
    const its = prof ? prof.items || {} : {};
    $('shopGrid').innerHTML = consCat.map((c) => { const it = ITEMS[c.id]; if (!it) return ''; const p5 = Math.floor(c.price * 5 * 0.8); return `<div class="sCard"><div class="pv">${it.e}</div><b>${it.n}</b><div class="desc">${esc(it.d)}</div><div class="have">Tenés: ${its[c.id] || 0}</div><div class="two"><button class="btn primary" data-cbuy="${c.id}" data-q="1" data-p="${c.price}">💎 ${c.price}</button><button class="btn yellow" data-cbuy="${c.id}" data-q="5" data-p="${p5}">x5 · ${p5}</button></div></div>`; }).join('') || '<div class="empty">Cargando…</div>';
    return;
  }
  const items = shopCat.filter((s) => s.kind === shopTab);
  $('shopGrid').innerHTML = items.map((it) => {
    const mine = has(it.id) && prof; const cant = prof && prof.gems < it.price;
    return `<div class="sCard ${mine ? 'owned' : ''}">${shopPreview(it)}<b>${esc(it.name)}</b>${mine ? '<button class="btn" disabled>✅ Ya es tuyo</button>' : `<button class="btn ${cant ? '' : 'primary'}" data-buy="${it.id}" ${cant ? 'data-cant="1"' : ''}>💎 ${it.price}</button>`}</div>`;
  }).join('') || '<div class="empty">Nada por acá todavía.</div>';
}
$('shTabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { shopTab = b.dataset.t; sfx.click(); renderShop(); } });
$('shopGrid').addEventListener('click', async (e) => {
  const cb = e.target.closest('[data-cbuy]');
  if (cb) {
    const m = $('shopMsg'); m.className = 'msgline';
    if (!prof) { m.textContent = 'Necesitás una cuenta para comprar.'; return; }
    if (prof.gems < +cb.dataset.p) { m.textContent = 'Te faltan gemas. Jugá partidas online, abrí el regalo diario o subí el pase.'; sfx.wrong(); return; }
    if (cb.dataset.confirm !== '1') { cb.dataset.confirm = '1'; const old = cb.textContent; cb.textContent = '¿Seguro? Tocá de nuevo'; setTimeout(() => { if (cb.isConnected) { cb.dataset.confirm = ''; cb.textContent = old; } }, 2500); return; }
    setBusy(cb, true, '…');
    try { await be.buyConsumable(cb.dataset.cbuy, +cb.dataset.q); prof = be.profile; sfx.pick(); m.className = 'msgline ok'; m.textContent = `¡Listo! ${ITEMS[cb.dataset.cbuy].e} ${ITEMS[cb.dataset.cbuy].n} x${cb.dataset.q} a tu mochila.`; renderShop(); renderHome(); renderBag(); }
    catch (err) { m.textContent = niceError(err); renderShop(); }
    return;
  }
  const b = e.target.closest('[data-buy]'); if (!b) return;
  const m = $('shopMsg'); m.className = 'msgline';
  if (!prof) { m.textContent = 'Necesitás una cuenta para comprar.'; return; }
  if (b.dataset.cant) { m.textContent = 'Te faltan gemas. Jugá partidas online o abrí el regalo diario.'; sfx.wrong(); return; }
  const it = shopCat.find((s) => s.id === b.dataset.buy);
  if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = '¿Comprar? Tocá de nuevo'; setTimeout(() => { if (b.isConnected) { b.dataset.confirm = ''; b.textContent = '💎 ' + it.price; } }, 2500); return; }
  setBusy(b, true, '…');
  try { await be.buy(it.id); prof = be.profile; sfx.fanfare(); m.className = 'msgline ok'; m.textContent = `¡${it.name} es tuyo! Ya lo podés usar en el Vestidor.`; renderShop(); renderHome(); renderCloset(); }
  catch (err) { m.textContent = niceError(err); setBusy(b, false, '💎 ' + it.price); }
});

// ================= PASE DE BATALLA =================
let passCat = null;
const passLevel = () => Math.min(SEASON.max, 1 + Math.floor(((prof && prof.pass_xp) || 0) / SEASON.xp));
function passClaimables() {
  if (!prof || !passCat) return [];
  const lv = passLevel(); const out = [];
  for (const r of passCat) { if (r.level > lv) continue; if (r.premium && !prof.pass_premium) continue; const done = (r.premium ? prof.pass_prem : prof.pass_free) || []; if (!done.includes(r.level)) out.push(r); }
  return out;
}
function itemName(id) { const s = shopCat.find((x) => x.id === id); return EXCL[id] || (s ? s.name : id); }
function rewardView(r) {
  if (r.kind === 'gems') return { ic: '💎', t: `${r.amount} gemas` };
  if (r.kind === 'cons') { const it = ITEMS[r.ref] || {}; return { ic: it.e || '🎁', t: `${it.n || r.ref} x${r.amount}` }; }
  const id = r.ref;
  if (id.startsWith('col_')) { const c = COLORS.find((x) => x.shop === id); return { ic: `<div class="sw1" style="background:${c ? hex(c) : '#888'}"></div>`, t: itemName(id) }; }
  if (id.startsWith('tag_')) return { ic: `<img src="${tagPreviewURL(id, 777)}" alt="">`, t: itemName(id) };
  if (id.startsWith('nc_')) return { ic: `<span class="${id}" style="font-family:var(--display);font-size:18px">Aa</span>`, t: itemName(id) };
  if (id.startsWith('emo_')) return { ic: (EMOTES[id] || {}).e || '✨', t: itemName(id) };
  return { ic: (KIND_ICON[id.split('_')[0]] || {})[id] || '🎁', t: itemName(id) };
}
async function openPass() {
  openSheet('sPass'); const body = $('passBody');
  if (!prof) { body.innerHTML = `<div class="empty">El pase de batalla es para jugadoras con cuenta.<br><button class="btn primary" id="goSignup2" style="margin-top:12px">Crear cuenta</button></div>`; $('goSignup2').onclick = () => { closeSheet('sPass'); showAuth(); setAuthMode('up'); }; return; }
  if (!passCat) { body.innerHTML = '<div class="empty">Cargando…</div>'; try { passCat = await be.passRewards(); if (!shopCat.length) shopCat = await be.shop(); } catch (e) { body.innerHTML = `<div class="empty">${esc(niceError(e))}</div>`; return; } }
  renderPass(true);
}
function renderPass(scroll) {
  const body = $('passBody'); const lv = passLevel(); const xp = prof.pass_xp || 0;
  const inLv = lv >= SEASON.max ? SEASON.xp : xp % SEASON.xp; const n = passClaimables().length;
  $('paGems').textContent = prof.gems;
  let h = `<div class="passHead"><div class="lvlBig"><small>NIVEL</small>${lv}</div><div class="mid"><b>${SEASON.n}</b><div class="bar2"><i style="width:${Math.round(inLv / SEASON.xp * 100)}%"></i></div><small style="color:var(--muted);font-weight:700">${lv >= SEASON.max ? '¡Pase completo!' : `${inLv} / ${SEASON.xp} XP para el nivel ${lv + 1}`} · termina el ${SEASON.end} · jugá online para sumar XP</small></div>`;
  h += `<div style="display:flex;flex-direction:column;gap:8px">${prof.pass_premium ? '<span class="chip on">⭐ Premium activo</span>' : `<button class="btn yellow" id="bBuyPass">⭐ Premium · 💎 ${SEASON.price}</button>`}${n ? `<button class="btn primary" id="bClaimAll">Reclamar ${n} ${n === 1 ? 'premio' : 'premios'}</button>` : ''}</div></div>`;
  h += `<div class="legend"><span>Arriba: gratis</span><span style="color:var(--mustard)">Abajo: ⭐ premium (cosas exclusivas)</span></div><div class="track" id="track">`;
  for (let L2 = 1; L2 <= SEASON.max; L2++) {
    h += `<div class="lv ${L2 <= lv ? 'reached' : ''}"><div class="n">${L2}</div>`;
    for (const prem of [false, true]) {
      const r = passCat.find((x) => x.level === L2 && x.premium === prem); if (!r) { h += '<div class="rw lock"></div>'; continue; }
      const done = ((prem ? prof.pass_prem : prof.pass_free) || []).includes(L2);
      const ok = !done && L2 <= lv && (!prem || prof.pass_premium);
      const v = rewardView(r);
      h += `<button class="rw ${prem ? 'prem' : ''} ${done ? 'done' : ok ? 'ok' : 'lock'}" data-l="${L2}" data-p="${prem ? 1 : 0}"><div class="ic">${v.ic}</div>${esc(v.t)}</button>`;
    }
    h += '</div>';
  }
  body.innerHTML = h + '</div><div class="msgline" id="passMsg"></div>';
  if (scroll) { const tr = $('track'); const col = tr.children[Math.max(0, lv - 2)]; if (col) tr.scrollLeft = col.offsetLeft - tr.offsetLeft; }
  const bb = $('bBuyPass'); if (bb) bb.onclick = async () => {
    if (prof.gems < SEASON.price) { $('passMsg').textContent = `Necesitás ${SEASON.price} gemas.`; sfx.wrong(); return; }
    if (bb.dataset.c !== '1') { bb.dataset.c = '1'; bb.textContent = '¿Seguro? Tocá de nuevo'; return; }
    try { await be.buyPass(); prof = be.profile; sfx.fanfare(); notify('⭐ ¡Pase premium activado!'); renderPass(); renderHome(); } catch (e) { $('passMsg').textContent = niceError(e); }
  };
  const ca = $('bClaimAll'); if (ca) ca.onclick = async () => { setBusy(ca, true, 'Reclamando…'); for (const r of passClaimables()) { try { await be.claimPass(r.level, r.premium); } catch (e) { } } prof = be.profile; sfx.fanfare(); notify('🎁 ¡Premios reclamados!'); renderPass(); renderHome(); renderCloset(); };
}
$('passBody').addEventListener('click', async (e) => {
  const b = e.target.closest('.rw.ok'); if (!b) return;
  b.classList.remove('ok');
  try { await be.claimPass(+b.dataset.l, b.dataset.p === '1'); prof = be.profile; sfx.pick(); const r = passCat.find((x) => x.level === +b.dataset.l && x.premium === (b.dataset.p === '1')); notify('🎁 ' + rewardView(r).t); renderPass(); renderHome(); renderCloset(); }
  catch (err) { $('passMsg').textContent = niceError(err); renderPass(); }
});

// ================= MOCHILA =================
let bag = (store.get('bag', null) || ['bin', 'box']).filter((k) => ITEMS[k]).slice(0, 2);
while (bag.length < 2) bag.push(bag[0] === 'box' ? 'bin' : 'box');
let bagSel = -1;
const freeItems = () => !session || session.kind === 'practice';
const stockOf = (k) => (freeItems() ? Infinity : ((prof && prof.items && prof.items[k]) || 0));
const validBag = () => bag.filter((k) => ITEMS[k] && stockOf(k) > 0);
function pushBag() { if (app.net) app.net.setPresence({ lo: validBag() }); }
function renderBag() {
  if (!$('bag')) return;
  $$('#bag .bagSlot').forEach((el, i) => {
    const k = bag[i]; const it = ITEMS[k]; const st = stockOf(k);
    el.className = 'bagSlot' + (bagSel === i ? ' sel' : '') + (st > 0 ? '' : ' empty');
    el.innerHTML = it ? `<span>${it.e}</span><div style="text-align:left">${it.n}<small>${freeItems() ? 'gratis en práctica' : st > 0 ? `te quedan ${st}` : 'sin stock · comprá en la tienda'}</small></div>` : '<span>＋</span>';
  });
  const pk = $('bagPick'); pk.classList.toggle('hidden', bagSel < 0);
  if (bagSel >= 0) pk.innerHTML = ITEM_KEYS.map((k) => { const st = stockOf(k); return `<button data-k="${k}" class="${st > 0 ? '' : 'no'} ${bag[bagSel] === k ? 'on' : ''}"><span>${ITEMS[k].e}</span>${ITEMS[k].n.replace('¡', '').replace('!', '')}<b>${freeItems() ? '∞' : st}</b></button>`; }).join('') + (freeItems() ? '' : '<button data-shop="1"><span>🛍️</span>Comprar<b>más</b></button>');
  const combo = COMBOS.find((c) => (bag.includes(c.a) && bag.includes(c.b)));
  $('bagMsg').innerHTML = combo ? `✨ Combo posible: <b>${combo.n}</b>` : bagSel >= 0 ? 'Elegí un objeto para ese lugar.' : 'Tocá un lugar para cambiar el objeto.';
}
$('bag').addEventListener('click', (e) => { const b = e.target.closest('.bagSlot'); if (!b) return; sfx.click(); bagSel = bagSel === +b.dataset.s ? -1 : +b.dataset.s; renderBag(); });
$('bagPick').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.shop) { openShop('cons'); return; }
  const k = b.dataset.k; if (stockOf(k) <= 0) { notify('No te quedan. Comprá en la tienda 🛍️'); return; }
  const other = 1 - bagSel; if (bag[other] === k) bag[other] = bag[bagSel];
  bag[bagSel] = k; bagSel = -1; store.set('bag', bag); sfx.pick(); renderBag(); pushBag();
});
// al usar un objeto online se descuenta del stock
app.onItemUsed = (k) => {
  if (freeItems() || !prof) return;
  be.useConsumable(k).then(() => { prof = be.profile; pushBag(); }).catch(() => { });
};

// ================= RANKING =================
async function openRank(by) {
  openSheet('sRank'); $$('#rkTabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === by));
  const box = $('rkList'); box.innerHTML = '<div class="empty">Cargando…</div>';
  if (!online) { box.innerHTML = '<div class="empty">Sin conexión con el servidor.</div>'; return; }
  try {
    const rows = await be.leaderboard(by);
    box.innerHTML = rows.map((r, i) => `<div class="rk ${prof && r.id === prof.id ? 'me' : ''}"><span class="pos">${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span><span class="nm ${esc(r.name_color || 'nc_blanco')}">${esc(r.username)}</span><small style="color:var(--muted)">Nv ${levelOf(r.xp)}</small><span class="v">${r[by] || 0}</span></div>`).join('') || '<div class="empty">Todavía nadie jugó. ¡Sé la primera!</div>';
  } catch (e) { box.innerHTML = `<div class="empty">${esc(niceError(e))}</div>`; }
}
$('rkTabs').onclick = (e) => { const b = e.target.closest('button'); if (b) { sfx.click(); openRank(b.dataset.t); } };

// ================= PERFIL =================
async function openProfile() {
  if (!prof) return;
  openSheet('sProfile'); $('pfMsg').textContent = '';
  try { prof = await be.loadProfile(); } catch (e) { }
  const lv = levelOf(prof.xp), next = lv * lv * 60;
  $('pfStats').innerHTML = [['Nivel', lv, `${prof.xp}/${next} XP`], ['Gemas', prof.gems, '💎'], ['Partidas', prof.games, ''], ['Victorias', prof.wins, ''], ['Números leídos', prof.finds, '']].map(([n, v, s]) => `<div class="stat"><b>${v}</b><small>${n}${s ? ' · ' + s : ''}</small></div>`).join('');
  $('pfName').value = prof.username; $('pfEmail').textContent = be.email + (prof.is_admin ? ' · administradora' : '');
  const log = $('pfLog'); log.innerHTML = '<div class="empty">Cargando…</div>';
  try { const l = await be.gemLog(); log.innerHTML = l.map((x) => `<div class="item"><div class="t"><b>${esc(x.reason)}</b><small>${new Date(x.created_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</small></div><b style="color:${x.delta >= 0 ? 'var(--ok)' : '#ff9dbb'}">${x.delta >= 0 ? '+' : ''}${x.delta} 💎</b></div>`).join('') || '<div class="empty">Sin movimientos todavía.</div>'; }
  catch (e) { log.innerHTML = ''; }
  renderHome();
}
$('pfNameGo').onclick = async () => {
  const n = $('pfName').value.trim(); const m = $('pfMsg'); m.className = 'msgline';
  if (!/^[\wÁÉÍÓÚáéíóúÑñ .-]{3,14}$/.test(n)) { m.textContent = 'Entre 3 y 14 letras o números.'; return; }
  try { prof = await be.saveProfile({ username: n }); m.className = 'msgline ok'; m.textContent = '¡Nombre guardado!'; renderHome(); } catch (e) { m.textContent = niceError(e); }
};
$('pfPassGo').onclick = async () => {
  const p = $('pfPass').value; const m = $('pfMsg'); m.className = 'msgline';
  if (p.length < 6) { m.textContent = 'Mínimo 6 caracteres.'; return; }
  try { await be.updatePassword(p); $('pfPass').value = ''; m.className = 'msgline ok'; m.textContent = 'Contraseña cambiada.'; } catch (e) { m.textContent = niceError(e); }
};
$('pfOut').onclick = async () => { await be.signOut().catch(() => { }); prof = null; closeSheet('sProfile'); showAuth('Cerraste sesión.'); };

// ================= ADMIN =================
let adUserId = null;
function openAdmin() { openSheet('sAdmin'); setAdTab('stats'); }
function setAdTab(t) {
  $$('#adTabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === t || (t === 'user' && b.dataset.t === 'users')));
  $$('#sAdmin [data-a]').forEach((p) => p.classList.toggle('hidden', p.dataset.a !== t));
  if (t === 'stats') loadAdStats();
  if (t === 'users') loadAdUsers();
  if (t === 'rooms') loadAdRooms();
}
$('adTabs').onclick = (e) => { const b = e.target.closest('button'); if (b) { sfx.click(); setAdTab(b.dataset.t); } };
async function loadAdStats() {
  const box = $('adStats'); box.innerHTML = '<div class="empty">Cargando…</div>';
  try { const s = await be.adminStats(); box.innerHTML = Object.entries(s || {}).map(([k, v]) => `<div class="stat"><b>${v ?? 0}</b><small>${ADMIN_LABELS[k] || k}</small></div>`).join(''); }
  catch (e) { box.innerHTML = `<div class="empty">${esc(niceError(e))}</div>`; }
}
let adSearchT = 0;
$('adSearch').oninput = () => { clearTimeout(adSearchT); adSearchT = setTimeout(loadAdUsers, 300); };
async function loadAdUsers() {
  const box = $('adUsers'); box.innerHTML = '<div class="empty">Buscando…</div>';
  try {
    const us = await be.adminSearch($('adSearch').value.trim());
    box.innerHTML = us.map((u) => `<button class="item" style="text-align:left" data-u="${u.id}"><div class="avatar" style="width:34px;height:34px;font-size:16px">${esc(u.username.slice(0, 1).toUpperCase())}</div><div class="t"><b class="${esc(u.name_color)}">${esc(u.username)}${u.is_admin ? '<span class="badge">ADMIN</span>' : ''}${u.banned ? '<span class="badge red">BLOQUEADO</span>' : ''}</b><small>Nv ${levelOf(u.xp)} · ${u.games} partidas · visto ${u.last_seen ? new Date(u.last_seen).toLocaleDateString('es-AR') : '—'}</small></div><b class="gem">💎 ${u.gems}</b></button>`).join('') || '<div class="empty">No encontramos a nadie con ese nombre.</div>';
    adUsersCache = us;
  } catch (e) { box.innerHTML = `<div class="empty">${esc(niceError(e))}</div>`; }
}
let adUsersCache = [];
$('adUsers').addEventListener('click', (e) => { const b = e.target.closest('[data-u]'); if (b) { adUserId = b.dataset.u; renderAdUser(); } });
async function renderAdUser(note = '') {
  const u = (await be.adminSearch('').catch(() => adUsersCache)).find((x) => x.id === adUserId) || adUsersCache.find((x) => x.id === adUserId);
  if (!u) return;
  $$('#sAdmin [data-a]').forEach((p) => p.classList.toggle('hidden', p.dataset.a !== 'user'));
  const items = shopCat.length ? shopCat : await be.shop().catch(() => []);
  const isMe = prof && u.id === prof.id;
  $('adUser').innerHTML = `
    <button class="linkbtn" id="adBack">← Volver a la lista</button>
    <div class="item" style="margin-top:6px"><div class="avatar">${esc(u.username.slice(0, 1).toUpperCase())}</div><div class="t"><b class="${esc(u.name_color)}" style="font-size:18px">${esc(u.username)}${u.is_admin ? '<span class="badge">ADMIN</span>' : ''}${u.banned ? '<span class="badge red">BLOQUEADO</span>' : ''}</b><small>Nivel ${levelOf(u.xp)} · ${u.wins} victorias · ${u.finds} números leídos · ${u.games} partidas</small></div><b class="gem" style="font-family:var(--display);font-size:24px">💎 ${u.gems}</b></div>
    <div class="msgline ${note ? 'ok' : ''}" id="adMsg">${esc(note)}</div>
    <div class="sec"><h4>Dar gemas</h4><div class="quick"><button class="btn yellow" data-g="100">+100</button><button class="btn yellow" data-g="500">+500</button><button class="btn yellow" data-g="1000">+1000</button><button class="btn danger" data-g="-100">−100</button></div>
      <div style="display:flex;gap:8px;margin-top:8px"><input class="search" id="adAmt" type="number" inputmode="numeric" placeholder="Otra cantidad (ej: 250 o -50)" style="flex:1"><button class="btn primary" id="adAmtGo">Dar</button></div>
      <input class="search" id="adReason" placeholder="Motivo (opcional, lo ve en su historial)" style="margin-top:8px"></div>
    <div class="sec"><h4>Regalar o quitar artículos</h4><div class="opts">${items.map((it) => { const o = (u.owned || []).includes(it.id); return `<button class="opt ${o ? 'on' : ''}" data-it="${it.id}" data-has="${o ? 1 : 0}">${o ? '✅ ' : '＋ '}${esc(it.name)}</button>`; }).join('')}</div></div>
    <div class="sec"><h4>Dar objetos (+5 cada toque)</h4><div class="opts">${ITEM_KEYS.map((k) => `<button class="opt" data-cons="${k}">${ITEMS[k].e} ${(u.items || {})[k] || 0}</button>`).join('')}</div></div>
    <div class="sec"><h4>Cambiar nombre</h4><div style="display:flex;gap:8px"><input class="search" id="adName" value="${esc(u.username)}" maxlength="14"><button class="btn" id="adNameGo">Guardar</button></div></div>
    <div class="sec" style="display:flex;gap:8px;flex-wrap:wrap">
      ${isMe ? '' : `<button class="btn ${u.banned ? 'teal' : 'danger'}" id="adBan">${u.banned ? 'Desbloquear' : '🚫 Bloquear cuenta'}</button>`}
      ${isMe ? '' : `<button class="btn" id="adAdm">${u.is_admin ? 'Quitar admin' : '🛡️ Hacer admin'}</button>`}
    </div>
    <div class="sec"><h4>Historial de gemas</h4><div class="list" id="adLog"><div class="empty">Cargando…</div></div></div>`;
  $('adBack').onclick = () => setAdTab('users');
  const act = async (fn, okMsg) => { try { await fn(); sfx.good(); await renderAdUser(okMsg); if (isMe) { prof = await be.loadProfile(); renderHome(); } } catch (e) { $('adMsg').className = 'msgline'; $('adMsg').textContent = niceError(e); } };
  const give = (n) => { if (!n) return; act(() => be.adminGems(u.id, n, $('adReason').value.trim() || (n > 0 ? 'Regalo de la administración' : 'Ajuste de la administración')), `${n > 0 ? '+' : ''}${n} gemas para ${u.username}.`); };
  $$('#adUser [data-g]').forEach((b) => { b.onclick = () => give(+b.dataset.g); });
  $('adAmtGo').onclick = () => give(Math.trunc(+$('adAmt').value));
  $$('#adUser [data-it]').forEach((b) => { b.onclick = () => { const g = b.dataset.has !== '1'; act(() => be.adminItem(u.id, b.dataset.it, g), g ? 'Artículo regalado.' : 'Artículo quitado.'); }; });
  $$('#adUser [data-cons]').forEach((b) => { b.onclick = () => act(() => be.adminGiveCons(u.id, b.dataset.cons, 5), `+5 ${ITEMS[b.dataset.cons].n}.`); });
  $('adNameGo').onclick = () => act(() => be.adminRename(u.id, $('adName').value.trim()), 'Nombre cambiado.');
  if ($('adBan')) $('adBan').onclick = () => act(() => be.adminBan(u.id, !u.banned), u.banned ? 'Cuenta desbloqueada.' : 'Cuenta bloqueada.');
  if ($('adAdm')) $('adAdm').onclick = () => act(() => be.adminAdmin(u.id, !u.is_admin), u.is_admin ? 'Ya no es admin.' : 'Ahora es admin.');
  try { const l = await be.gemLog(u.id); $('adLog').innerHTML = l.map((x) => `<div class="item"><div class="t"><b>${esc(x.reason)}</b><small>${new Date(x.created_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</small></div><b>${x.delta >= 0 ? '+' : ''}${x.delta}</b></div>`).join('') || '<div class="empty">Sin movimientos.</div>'; } catch (e) { $('adLog').innerHTML = ''; }
}
async function loadAdRooms() {
  const box = $('adRooms'); box.innerHTML = '<div class="empty">Cargando…</div>';
  try { const rs = await be.listRooms(); box.innerHTML = rs.map((r) => `<div class="item"><div class="t"><b>${esc(r.code)} · ${esc(r.name || '')}</b><small>de ${esc(r.host_name)} · ${r.players}/${r.max_players} · ${r.status === 'play' ? 'jugando' : 'esperando'}</small></div><button class="btn" data-join="${esc(r.code)}">Entrar</button></div>`).join('') || '<div class="empty">No hay salas abiertas.</div>'; }
  catch (e) { box.innerHTML = `<div class="empty">${esc(niceError(e))}</div>`; }
}
$('adRooms').addEventListener('click', (e) => { const b = e.target.closest('[data-join]'); if (b) { closeSheet('sAdmin'); startSession('join', { code: b.dataset.join, errEl: $('adRooms') }); } });

// ================= AJUSTES / CÓMO SE JUEGA =================
function renderSettings() {
  $$('#segQ button').forEach((b) => b.classList.toggle('on', b.dataset.v === settings.quality));
  $$('#segCam button').forEach((b) => b.classList.toggle('on', b.dataset.v === settings.cam));
  $('volM').value = settings.music; $('volS').value = settings.sfx; $('sens').value = settings.sens;
}
$('segQ').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; settings.quality = b.dataset.v; saveSettings(); renderSettings(); applyQuality(); };
$('segCam').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; settings.cam = b.dataset.v; saveSettings(); renderSettings(); };
$('volM').oninput = () => { settings.music = +$('volM').value; setVolumes(settings.music, settings.sfx); saveSettings(); };
$('volS').oninput = () => { settings.sfx = +$('volS').value; setVolumes(settings.music, settings.sfx); saveSettings(); };
$('sens').oninput = () => { settings.sens = +$('sens').value; saveSettings(); };
$('bFull').onclick = () => goFull();
$('bQuit').onclick = () => { closeSheet('sSettings'); endSession(); };
function goFull() {
  const el = document.documentElement;
  try { const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen && el.webkitRequestFullscreen(); if (p && p.then) p.then(() => { try { window.screen.orientation && window.screen.orientation.lock && window.screen.orientation.lock('landscape').catch(() => { }); } catch (e) { } }).catch(() => { }); } catch (e) { }
}
const CAT = { leer: ['#1fb5a8', 'Para leer números'], proteger: ['#b98af0', 'Para protegerte'], caos: ['#ff4f8b', 'Caos para todos'] };
$('itemList').innerHTML = Object.keys(CAT).map((c) => `<div class="catlbl" style="color:${CAT[c][0]}">${CAT[c][1]}</div>` + ITEM_KEYS.filter((k) => ITEMS[k].c === c).map((k) => `<div><span>${ITEMS[k].e}</span><span><b>${ITEMS[k].n}</b>${ITEMS[k].d}</span></div>`).join('')).join('');
$('comboList').innerHTML = '<div class="catlbl" style="color:#ffc93c">Combinaciones</div>' + COMBOS.map((c) => `<div><span>${ITEMS[c.a].e}${ITEMS[c.b].e}</span><span><b>${c.n}</b>${c.d}</span></div>`).join('');
$('bPauseHow').onclick = () => openSheet('sHow');
$('bPauseSet').onclick = () => { renderSettings(); $('setQuit').classList.remove('hidden'); openSheet('sSettings'); };

// ================= ENTRADA =================
const input = (() => {
  const keys = new Set();
  const joy = { id: null, x: 0, y: 0, ox: 0, oy: 0 };
  const lookT = { id: null, lx: 0, ly: 0, dx: 0, dy: 0 };
  let mouseDX = 0, mouseDY = 0, dragging = false, lastMX = 0, lastMY = 0, jumpQ = false;
  const base = $('joyBase'), knob = $('joyKnob'), jz = $('joy'), lp = $('lookPad');
  jz.addEventListener('pointerdown', (e) => {
    if (joy.id !== null) return; joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.x = joy.y = 0;
    jz.classList.add('active'); base.style.display = 'block';
    const r = jz.getBoundingClientRect(); base.style.left = (e.clientX - r.left - 60) + 'px'; base.style.top = (e.clientY - r.top - 60) + 'px';
    jz.setPointerCapture(e.pointerId);
  });
  jz.addEventListener('pointermove', (e) => {
    if (e.pointerId !== joy.id) return;
    let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const d = Math.hypot(dx, dy), m = 52;
    if (d > m) { dx *= m / d; dy *= m / d; }
    joy.x = dx / m; joy.y = -dy / m; knob.style.transform = `translate(${dx}px,${dy}px)`;
  });
  const endJoy = (e) => { if (e.pointerId !== joy.id) return; joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; base.style.display = 'none'; jz.classList.remove('active'); };
  jz.addEventListener('pointerup', endJoy); jz.addEventListener('pointercancel', endJoy);
  lp.addEventListener('contextmenu', (e) => e.preventDefault());
  lp.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') { if (e.button === 2 && game) { game.zoom = !game.zoom; return; } dragging = true; lastMX = e.clientX; lastMY = e.clientY; lp.setPointerCapture(e.pointerId); return; }
    if (lookT.id !== null) return; lookT.id = e.pointerId; lookT.lx = e.clientX; lookT.ly = e.clientY; lp.setPointerCapture(e.pointerId);
  });
  lp.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') { if (dragging) { mouseDX += e.clientX - lastMX; mouseDY += e.clientY - lastMY; lastMX = e.clientX; lastMY = e.clientY; } return; }
    if (e.pointerId !== lookT.id) return;
    lookT.dx += e.clientX - lookT.lx; lookT.dy += e.clientY - lookT.ly; lookT.lx = e.clientX; lookT.ly = e.clientY;
  });
  const endLook = (e) => { if (e.pointerType === 'mouse') { dragging = false; return; } if (e.pointerId !== lookT.id) return; lookT.id = null; };
  lp.addEventListener('pointerup', endLook); lp.addEventListener('pointercancel', endLook);
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Escape') { const open = $$('.sheet.on').filter((s) => s.id !== 'lobby'); if (open.length) { open[open.length - 1].classList.remove('on'); return; } if (screenName === 'hud') { openSheet('sPause'); return; } }
    keys.add(e.code);
    if (screenName !== 'hud' || !game || $$('.sheet.on').length) return;
    const d = /^(Digit|Numpad)(\d)$/.exec(e.code);
    if (d) { e.preventDefault(); if (!game.padOpen) game.openPad(); game.key(d[2]); return; }
    if (e.code === 'Backspace') { e.preventDefault(); game.key('del'); return; }
    if (e.code === 'Space') { e.preventDefault(); jumpQ = true; }
    if (e.code === 'KeyZ') game.useSlot(0);
    if (e.code === 'KeyX') game.useSlot(1);
    if (e.code === 'KeyE') game.ctxAction();
    if (e.code === 'KeyC') game.zoom = !game.zoom;
    if (e.code === 'KeyG') game.emote();
    if (e.code === 'Tab') { e.preventDefault(); game.padOpen ? game.closePad() : game.openPad(); }
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  return {
    move() {
      let x = joy.x, y = joy.y, run = false;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1; if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1; if (keys.has('KeyA')) x -= 1; if (keys.has('KeyD')) x += 1;
      if (keys.has('ShiftLeft') || keys.has('ShiftRight')) run = true;
      const kb = keys.has('KeyW') || keys.has('KeyS') || keys.has('KeyA') || keys.has('KeyD') || keys.has('ArrowUp') || keys.has('ArrowDown');
      const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
      if (kb && !run) { x *= 0.85; y *= 0.85; }
      return { x, y, run };
    },
    look() {
      const s = settings.sens;
      const dx = -(lookT.dx * 0.0062 + mouseDX * 0.0042) * s, dy = (lookT.dy * 0.0045 + mouseDY * 0.003) * s;
      lookT.dx = lookT.dy = 0; mouseDX = mouseDY = 0;
      let kdx = 0; if (keys.has('ArrowLeft') || keys.has('KeyQ')) kdx += 0.04; if (keys.has('ArrowRight')) kdx -= 0.04;
      return { dx: dx + kdx, dy };
    },
    jump() { const j = jumpQ; jumpQ = false; return j; },
    vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { } },
  };
})();
if (isTouch()) { $('keys').classList.add('hidden'); document.body.classList.add('touch'); }

// ================= SESIÓN (salas) =================
let session = null; // { kind, code, room }
let busy = false, heartbeat = 0;
function netCfg() {
  const c = { backend: be.kind === 'supabase' ? be : null };
  if (Q.get('peer')) { const [h, p] = Q.get('peer').split(':'); c.host = h; c.port = +p || 9000; c.path = '/'; c.secure = false; }
  if (Q.get('peerjs')) c.peerjsUrl = Q.get('peerjs');
  return c;
}
async function startSession(kind, opts = {}) {
  if (busy) return;
  const errEl = opts.errEl || $('createMsg');
  if (kind !== 'practice' && !prof) { errEl.textContent = 'Necesitás una cuenta para jugar online.'; return; }
  busy = true; initAudio();
  const note = (t) => { if (errEl.classList.contains('msgline')) { errEl.className = 'msgline'; errEl.textContent = t; } else if (t) notify(t); };
  note(kind === 'practice' ? '' : 'Conectando…');
  let code = opts.code;
  try {
    let net;
    if (kind === 'practice') { net = new LocalNet(); await net.host(); app.isHost = true; }
    else if (kind === 'host') {
      for (let tries = 0; tries < 4 && !net; tries++) {
        code = makeCode();
        const n = new OnlineNet(netCfg());
        try { await n.host(code); net = n; } catch (e) { n.leave(); if (String(e && (e.type || e.message)).includes('unavailable-id')) continue; throw e; }
      }
      if (!net) throw new Error('nocode');
      app.isHost = true;
      await be.createRoom({ code, host_name: prof.username, host_peer: PEER_PREFIX + code, name: cfgDraft.name || 'La sala de ' + prof.username, mode: cfgDraft.mode, max_players: cfgDraft.max, players: 1, status: 'lobby', is_public: cfgDraft.pub }).catch((e) => console.warn('room', e));
    } else {
      const room = await be.getRoom(code).catch(() => null);
      if (room && room.status === 'play') note('Esa sala está en medio de una partida. Vas a entrar cuando termine.');
      net = new OnlineNet(netCfg());
      try { await net.join(code); } catch (e) { net.leave(); throw e; }
      app.isHost = false;
      let found = false;
      for (let i = 0; i < 60 && !found; i++) { for (const [, p] of net.peers) if (p && p.g) found = true; if (!found) await new Promise((r) => setTimeout(r, 100)); }
      if (!found) { net.leave(); throw new Error('nohost'); }
    }
    app.net = net;
    const c = cosm();
    session = { kind, code: code || '' };
    net.setPresence({ n: myName(), lk0: lookStr(myLook), ts: c.ts, nc: c.nc, em: c.em, uid: prof ? prof.id : '', v: 2, lo: validBag() });
    bagSel = -1; renderBag();
    if (app.isHost) {
      app.rules = new HostRules({ get W() { return W; }, now: () => Date.now() });
      if (kind === 'host') { app.rules.setCfg({ max: cfgDraft.max, dur: cfgDraft.dur, lives: cfgDraft.lives, mode: cfgDraft.mode, map: cfgDraft.map }); app.rules.G.name = cfgDraft.name || 'La sala de ' + prof.username; }
      else { app.rules.setCfg({ max: 9, dur: 300, lives: 3, mode: 'ffa', map: practiceMap }); app.rules.G.name = 'Práctica'; }
      app.rules.syncLobby(new Map([[net.myId, net.mine]]), net.myId);
      if (kind === 'practice') for (let i = 0; i < (opts.bots || 3); i++) app.rules.addBot();
      app.G = app.rules.G;
      publishHost();
      if (kind === 'host') heartbeat = setInterval(roomBeat, 25000);
    }
    net.onStatus((s) => { if (s === 'hostgone' && session) { endSession(); msg('Se cortó la sala', 'Quien creó la sala se desconectó.'); } });
    note('');
    for (const id of ['sPlay', 'sAdmin', 'sHow']) closeSheet(id);
    lastPh = '';
    openSheet('lobby'); show('lobbybg');
    $('lCode').textContent = kind === 'practice' ? '🤖' : code;
    $$('#bCopy,#bShare').forEach((b) => b.classList.toggle('hidden', kind === 'practice'));
    if (kind === 'practice' && app.wantTutorial) { app.rules.start(); }
  } catch (e) {
    console.warn(e);
    const m = String(e && (e.message || e.type));
    note(m.includes('nohost') || m.includes('peer-unavailable') ? 'No encontramos esa sala. Revisá el código.' : m.includes('network') || m.includes('server') || m.includes('timeout') ? 'No se pudo conectar. Revisá tu internet y probá de nuevo.' : 'No se pudo conectar. Probá de nuevo.');
    app.net = null; app.isHost = false;
  }
  busy = false;
}
function roomBeat() {
  if (!session || session.kind !== 'host' || !app.rules) return;
  const G = app.rules.G; const humans = Object.values(G.pl).filter((p) => !p.bt && !p.gone).length;
  be.updateRoom(session.code, { players: humans, status: G.ph === 'play' ? 'play' : 'lobby', max_players: G.cfg.max, mode: G.cfg.mode }).catch(() => { });
}
function hostG() {
  if (app.isHost) return app.rules && app.rules.G;
  for (const [, p] of app.net.peers) if (p && p.g) { app.hostPres = p; return p.g; }
  return null;
}
function endSession() {
  if (session && session.kind === 'host') be.deleteRoom(session.code).catch(() => { });
  clearInterval(heartbeat);
  if (app.net) app.net.leave();
  app.net = null; app.rules = null; app.G = null; session = null; app.isHost = false; app.hostPres = null; app.offset = 0; app._offInit = false;
  if (game) game.stop();
  for (const id of ['lobby', 'sPause', 'sSettings']) closeSheet(id);
  app.showHud(false); clearPodium();
  enterHome();
}
addEventListener('pagehide', () => { if (session && session.kind === 'host') be.deleteRoom(session.code).catch(() => { }); });
$('bLeave').onclick = () => { sfx.click(); endSession(); };
$('bPauseQuit').onclick = () => endSession();
$('bResExit').onclick = () => endSession();
$('bMenu').onclick = () => openSheet('sPause');
$('bStart').onclick = () => {
  if (!app.isHost) return;
  if (mapPending) return;
  if (!app.rules.start()) { $('lNote').textContent = 'Se necesitan al menos 2 jugadores (podés sumar bots).'; return; }
  sfx.fanfare(); roomBeat(); goFull();
};
$('bAgain').onclick = () => { if (app.isHost) { app.rules.backToLobby(); roomBeat(); } };
$('bBotAdd').onclick = () => { if (app.isHost) { app.rules.addBot(); sfx.click(); } };
$('bBotDel').onclick = () => { if (app.isHost) { app.rules.removeBot(); sfx.click(); } };
$$('#lobby [data-l]').forEach((b) => b.addEventListener('click', () => {
  if (!app.isHost) return; const k = b.dataset.l, d = +b.dataset.d, c = app.rules.G.cfg;
  app.rules.setCfg({ [k]: k === 'max' ? clamp(c.max + d, Math.max(2, Object.keys(app.rules.G.pl).length), 12) : clamp(c[k] + d, 1, 5) }); sfx.click();
}));
$('lDur').onclick = (e) => { const b = e.target.closest('button'); if (b && app.isHost) { app.rules.setCfg({ dur: +b.dataset.v }); sfx.click(); } };
$('lMode').onclick = (e) => { const b = e.target.closest('button'); if (b && app.isHost) { app.rules.setCfg({ mode: b.dataset.v }); sfx.click(); } };
$('bCopy').onclick = () => { try { navigator.clipboard.writeText(session.code); $('bCopy').textContent = '¡Copiado!'; setTimeout(() => { $('bCopy').textContent = 'Copiar código'; }, 1500); } catch (e) { } };
$('bShare').onclick = async () => {
  const url = location.origin + location.pathname + '?sala=' + session.code;
  const text = `¡Vení a jugar Probador conmigo! Código de sala: ${session.code}`;
  const copy = async () => { try { await navigator.clipboard.writeText(text + ' ' + url); $('bShare').textContent = '¡Link copiado!'; setTimeout(() => { $('bShare').textContent = 'Compartir'; }, 1500); } catch (e) { $('lNote').textContent = url; } };
  try { if (navigator.share) await navigator.share({ title: 'Probador', text, url }); else await copy(); } catch (e) { if (!e || e.name !== 'AbortError') await copy(); }
};

function renderLobby(G) {
  const ids = Object.keys(G.pl); const me = app.net.myId;
  const k = JSON.stringify([ids.map((i) => [i, G.pl[i].n, G.pl[i].nc, G.pl[i].lk]), G.cfg, G.full, app.isHost, G.name]);
  if (renderLobby.k === k) return; renderLobby.k = k;
  $('lTitle').textContent = session && session.kind === 'practice' ? 'Práctica con bots' : (G.name || 'Sala');
  $('lCount').textContent = `Jugadores (${ids.length}/${G.cfg.max})`;
  $('plist').innerHTML = ids.map((id) => {
    const p = G.pl[id]; const lk = parseLook(p.lk) || [];
    return `<div class="pl"><span class="dot" style="background:${hex(COLORS[lk[L.TOPC]] || COLORS[0])}"></span><span class="${esc(p.nc || 'nc_blanco')}">${esc(p.n)}</span>${id === me ? ' <small style="color:var(--muted)">(vos)</small>' : ''}<span class="who">${p.h ? '👑 anfitriona' : p.bt ? 'bot' : ''}</span></div>`;
  }).join('');
  $('lMax').textContent = G.cfg.max; $('lLives').textContent = G.cfg.lives;
  $$('#lDur button').forEach((b) => b.classList.toggle('on', +b.dataset.v === G.cfg.dur));
  $$('#lMode button').forEach((b) => b.classList.toggle('on', b.dataset.v === G.cfg.mode));
  $('lMap').innerHTML = mapButtons(G.cfg.map || DEFAULT_MAP);
  $('hostCfg').classList.toggle('hidden', !app.isHost);
  $('botBtns').classList.toggle('hidden', !app.isHost);
  $('bStart').classList.toggle('hidden', !app.isHost);
  $('guestCfg').innerHTML = app.isHost ? '' : `<p>${MAPS[G.cfg.map] ? MAPS[G.cfg.map].e + ' ' + MAPS[G.cfg.map].n + ' · ' : ''}${G.cfg.mode === 'teams' ? '🔴🔵 Equipos' : '🙋 Todos contra todos'} · <b>${G.cfg.dur / 60} min</b> · <b>${G.cfg.lives}</b> ${G.cfg.lives === 1 ? 'vida' : 'vidas'}</p><p>Esperando a que la anfitriona empiece…</p>`;
  const full = (G.full || []).includes(me);
  $('lNote').textContent = full ? 'La sala está llena 😕' : app.isHost ? (ids.length < 2 ? 'Esperando jugadores… pasales el código o sumá bots.' : 'Cuando estén todos, ¡empezá!') : '';
}

// ---------- publicación del anfitrión ----------
let lastG = '';
function publishHost() {
  const G = app.rules.G; const s = JSON.stringify(G);
  const patch = { hn: Date.now() };
  if (s !== lastG) { lastG = s; patch.g = G; }
  patch.bp = app.rules.botPresence();
  app.net.setPresence(patch);
  app.hostPres = app.net.mine;
}
let lastHostTick = 0;
function hostTick() {
  if (!app.net || !app.isHost || !app.rules) return;
  const now = performance.now();
  const tdt = Math.min(0.3, (now - (lastHostTick || now - 100)) / 1000); lastHostTick = now;
  app.rules.syncLobby(app.net.peers, app.net.myId);
  app.rules.tick(tdt, app.net.peers);
  publishHost();
  app.net.flush();
}
setInterval(hostTick, 100);

// ================= RESULTADOS =================
let podium = null;
function clearPodium() { if (podium) { scene.remove(podium.g); podium.chars.forEach((c) => c.dispose()); podium = null; } }
function showResults(G) {
  show('results'); stopMusic(); sfx.fanfare();
  const me = app.net.myId; const ids = G.res || Object.keys(G.pl); const p = G.pl[me];
  const won = G.cfg.mode === 'teams' ? (G.win && p && G.win === p.tm) : G.win === me;
  if (G.cfg.mode === 'teams') $('winner').innerHTML = G.win ? `${G.win === 'r' ? '🔴 Ganó el equipo ROJO' : '🔵 Ganó el equipo AZUL'}<br><span style="font-size:.5em">${won ? '¡Tu equipo ganó!' : 'la próxima es tuya'}</span>` : '¡Empate!';
  else { const w = G.pl[ids[0]]; $('winner').innerHTML = `🏆 ${esc(w ? w.n : '')}<br><span style="font-size:.5em">${won ? '¡Ganaste!' : 'ganó la feria'}</span>`; }
  $('rlist').innerHTML = ids.map((id, i) => { const q = G.pl[id]; return `<div class="rrow ${id === me ? 'me' : ''}"><span class="pos">${i + 1}</span><span><span class="${esc(q.nc || '')}">${q.tm ? (q.tm === 'r' ? '🔴 ' : '🔵 ') : ''}${esc(q.n)}</span><small>${q.finds || 0} números leídos · ${q.lost ? `le leyeron ${q.lost}` : 'nunca le leyeron el número'}</small></span><span class="pts">${q.sc}</span></div>`; }).join('');
  $('bAgain').classList.toggle('hidden', !app.isHost);
  // recompensas
  const rw = $('rewards'); rw.innerHTML = '';
  const humans = Object.values(G.pl).filter((q) => !q.bt).length;
  if (session && session.kind !== 'practice' && prof && p && !game.reported) {
    game.reported = true;
    if (humans < 2) rw.innerHTML = '<span style="font-weight:600;font-size:13px">Las partidas solo con bots no dan gemas</span>';
    else {
      rw.innerHTML = '<span>Sumando gemas…</span>';
      be.reportMatch(p.finds || 0, !!won).then((r) => { prof = be.profile; rw.innerHTML = r && r.gained ? `<span>💎 +${r.gained}</span><span>⭐ +${r.xp ?? (40 + (p.finds || 0) * 20 + (won ? 80 : 0))} XP</span>` : '<span style="font-size:13px">Esperá un poquito entre partidas para sumar gemas</span>'; renderHome(); }).catch((e) => { rw.innerHTML = `<span style="font-size:13px">${esc(niceError(e))}</span>`; });
    }
  } else if (session && session.kind === 'practice') rw.innerHTML = '<span style="font-weight:600;font-size:13px">La práctica no da gemas · jugá online para ganar 💎</span>';
  // podio 3D en el escenario
  clearPodium();
  const PD = W.podium; const g = new THREE.Group(); g.position.set(PD.x, PD.y, PD.z); g.rotation.y = PD.ry; scene.add(g);
  const chars = []; const spots = [[0, 1.2, 0], [-1.6, 0.8, 0.3], [1.6, 0.5, 0.3]]; const colors = [0xffc93c, 0xd8dde6, 0xd9925a];
  ids.slice(0, 3).forEach((id, i) => {
    const [x, h, z] = spots[i];
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.4, h, 1.2), new THREE.MeshStandardMaterial({ color: colors[i], roughness: 0.5 }));
    box.position.set(x, h / 2, z); box.castShadow = box.receiveShadow = true; g.add(box);
    const q = G.pl[id]; const ch = new Character(parseLook(q.lk), { shadow: true }); ch.root.position.set(x, h, z); ch.setTag(tagMaterial(q.num || 100, q.ts, q.tm || '', 'glow')); g.add(ch.root); chars.push(ch);
    ch.podAnim = i === 0 ? (ANIM_OF_EMOTE[q.em] === 'wave' ? 'dance' : ANIM_OF_EMOTE[q.em] || 'dance') : 'wave';
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(2.7, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xff4f8b, roughness: 0.8 })); floor.position.y = 0.03; floor.receiveShadow = true; g.add(floor);
  podium = { g, chars };
  fx.burst(PD.x, PD.y + 3, PD.z, perfT);
}

// ================= BUCLE =================
const clock = new THREE.Clock();
let perfT = 0, lastFlush = 0, lastPh = '';
const mirrorRect = { on: false };
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  perfT += dt;
  if (W) { if (W.sky) W.sky.material.uniforms.time.value = perfT; W.anim.forEach((f) => f(perfT)); }
  if (app.net) {
    const now = performance.now();
    const G = hostG();
    if (!app.isHost && app.hostPres && app.hostPres.hn) {
      const sample = app.hostPres.hn - Date.now();
      if (app._lastHn !== app.hostPres.hn) { app._lastHn = app.hostPres.hn; app.offset = app._offInit ? Math.max(app.offset - 1, sample) : sample; app._offInit = true; }
    }
    if (G) {
      app.G = G;
      if (G.cfg && G.cfg.map && W && G.cfg.map !== W.id) requestMap(G.cfg.map);
      if (G.ph !== lastPh) { const prev = lastPh; lastPh = G.ph; onPhase(G, prev); }
      if (G.ph === 'lobby' && $('lobby').classList.contains('on')) renderLobby(G);
      if (G.ph === 'play' && !mapPending && game.matchT0 !== G.t0 && G.pl[app.net.myId] && screenName === 'hud' && (!G.cfg.map || G.cfg.map === W.id)) game.startMatch();
    }
    if (game && G && G.ph === 'play' && game.started && !mapPending) game.update(dt);
    if (now - lastFlush > 75) { lastFlush = now; app.net.flush(); }
  }
  const menuView = screenName === 'home' || screenName === 'auth' || screenName === 'loading' || screenName === 'lobbybg' || (app.net && (!app.G || app.G.ph === 'lobby'));
  if (menuView && W) {
    if (menuCrowd) { menuCrowd.update(perfT, dt, {}); fx.setBlobs(menuCrowd.npcs.map((n) => ({ x: n.x, z: n.z, y: n.y })).concat(preview && preview.root.visible ? [{ x: preview.root.position.x, z: preview.root.position.z }] : [])); }
    if (preview) {
      preview.root.rotation.y += previewSpin * dt * 2.5;
      preview.waveT = (preview.waveT || 0) - dt; preview.emoT = (preview.emoT || 0) - dt;
      preview.update(dt, preview.emoT > 0 ? preview.emoA : preview.waveT > 0 ? 'wave' : 'idle', 0, perfT);
    }
    const closet = $('sCloset').classList.contains('on');
    // con el vestidor abierto, la cámara se acerca al personaje
    const M = W.menu; const c = closet ? M.camC : M.cam, lk = closet ? M.lookC : M.look;
    camera.position.set(c[0] + Math.sin(perfT * 0.1) * 0.12, c[1], c[2]);
    camera.lookAt(lk[0], lk[1], lk[2]);
    camera.fov = 50; camera.updateProjectionMatrix();
    if (app.net) { const O = W.orbit; camera.position.set(O.cx + Math.sin(perfT * 0.05) * O.r, O.h, O.cz + Math.cos(perfT * 0.05) * O.r); camera.lookAt(O.cx, O.ly, O.cz); camera.fov = 55; camera.updateProjectionMatrix(); }
    app.setDark(0);
  }
  if (screenName === 'results' && podium) {
    podium.chars.forEach((c) => c.update(dt, c.podAnim, 0, perfT, { danceOffset: 0 }));
    const PD = W.podium; const cr = Math.cos(PD.ry), sr = Math.sin(PD.ry);
    const off = (lx, ly, lz) => [PD.x + lx * cr + lz * sr, PD.y + ly, PD.z - lx * sr + lz * cr];
    const cp = off(0.6 + Math.sin(perfT * 0.3), 2.15, 6.6), lp = off(1.0, 1.25, 0);
    camera.position.set(cp[0], cp[1], cp[2]); camera.lookAt(lp[0], lp[1], lp[2]); camera.fov = 50; camera.updateProjectionMatrix();
    fx.update(perfT, dt);
  }
  if (composer && settings.quality === 'alta') composer.render(dt); else renderer.render(scene, camera);
  if (game && game.started) {
    game.afterRender(renderer.domElement);
    // espejo de mano: segunda vista en un recuadro
    if (game.mirrorOn) {
      const r = $('mirror').getBoundingClientRect();
      if (r.width > 4) {
        const y = innerHeight - r.bottom;
        game.mirrorCam.aspect = r.width / r.height; game.mirrorCam.updateProjectionMatrix();
        renderer.setRenderTarget(null);
        renderer.setScissorTest(true); renderer.setScissor(r.left + 4, y + 4, r.width - 8, r.height - 8); renderer.setViewport(r.left + 4, y + 4, r.width - 8, r.height - 8);
        renderer.render(scene, game.mirrorCam);
        renderer.setScissorTest(false); renderer.setViewport(0, 0, innerWidth, innerHeight);
      }
    }
  }
  if (Q.get('test')) window.__frames = (window.__frames || 0) + 1;
  // resolución dinámica durante la partida
  if (screenName === 'hud') {
    perf.n++; perf.t += dt;
    if (perf.t > 2) {
      const fps = perf.n / perf.t; perf.n = 0; perf.t = 0;
      if (fps < 38 && dynRes > 0.6) { dynRes = Math.max(0.6, dynRes - 0.1); perf.good = 0; resize(); }
      else if (fps > 56 && dynRes < 1) { if (++perf.good >= 3) { dynRes = Math.min(1, dynRes + 0.1); perf.good = 0; resize(); } }
    }
  }
}
const perf = { n: 0, t: 0, good: 0 };
function onPhase(G, prev) {
  if (G.ph === 'lobby') {
    if (game) game.stop();
    app.showHud(false); clearPodium(); renderLobby.k = '';
    show('lobbybg'); openSheet('lobby');
    app.setMenuCrowd(true); playMusic('menu');
  } else if (G.ph === 'play') {
    if (!G.pl[app.net.myId]) { $('lNote').textContent = 'La partida ya empezó. Entrás en la próxima.'; return; }
    closeSheet('lobby'); show('hud');
    if (!mapPending && (!G.cfg.map || G.cfg.map === W.id)) game.startMatch();
  } else if (G.ph === 'end') {
    if (game) game.stop();
    app.showHud(false); closeSheet('sPause');
    if (G.pl[app.net.myId]) showResults(G);
  }
}

window.__probador = { app, settings, be, get prof() { return prof; }, async reload() { prof = await be.loadProfile(); renderHome(); }, get game() { return game; }, get W() { return W; }, startSession };
boot().catch((e) => { console.error(e); $('loadMsg').textContent = 'No se pudo cargar: ' + e.message; });
