// Cliente de juego (números en la frente): control, cámara, carteles, teclado, objetos, HUD y tutorial
import * as THREE from 'three';
import { Character, makeDog } from './character.js';
import { navPath, nearestNode } from './phys.js';
import { ITEMS, COMBOS, parseLook } from './rules.js';
import { tagMaterial, TAG_STYLES } from './tags.js';
import { clamp, lerpAng, angDiff, fmtTime, store } from './util.js';
import { sfx, playMusic } from './audio.js';

const ANIMS = ['idle', 'walk', 'run', 'tag', 'dance', 'mannequin', 'browse', 'stumble', 'wave', 'jump', 'cheer', 'pose', 'spin'];
const EMO_ANIM = { emo_saludo: 'wave', emo_baile: 'dance', emo_festejo: 'cheer', emo_pose: 'pose', emo_giro: 'spin' };
const AI = Object.fromEntries(ANIMS.map((a, i) => [a, i]));
const $ = (id) => document.getElementById(id);
const HEART = '<svg viewBox="0 0 120 70" fill="none" stroke="#ffc93c" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"><path d="M60 22c0-8 10-8 10-15S64 0 60 0s-8 3-8 7"/><path d="M60 22 8 56c-6 4-3 10 4 10h96c7 0 10-6 4-10L60 22Z"/></svg>';
const GRAV = 18, JUMP_V = 6.4, SUPER_V = 12.5;
const READ = 9, READ_ZOOM = 30, READ_FAR = 40, READ_DARK = 13, SHOW_MAX = 30;

const TUT = [
  { txt: '👋 <b>¡Bienvenida!</b> Mové el joystick de la izquierda para caminar.', desk: '👋 <b>¡Bienvenida!</b> Caminá con <b>W A S D</b>.', check: (g) => g.tutData.walked > 4 },
  { txt: '👀 Deslizá el dedo en la mitad derecha para <b>mirar alrededor</b>.', desk: '👀 Arrastrá el mouse para <b>mirar alrededor</b>.', check: (g) => g.tutData.looked > 1.4 },
  { txt: '🏷️ Todos tienen un <b>número en la frente</b>. El tuyo está arriba a la derecha: ¡que no te lo lean!', hl: 'myTag', wait: 6 },
  { txt: '🔍 Acercate a un bot y ponete <b>de frente</b>, cerca, hasta poder leer su número.', check: (g) => g.tutData.read > 1 },
  { txt: '🔢 Tocá el botón <b>🔢</b> y marcá ese número en el teclado. Si acertás: <b>+100</b>.', desk: '🔢 Escribí el número con las teclas <b>0-9</b>. Si acertás: <b>+100</b>.', hl: 'bPad', check: (g) => g.tutData.typed },
  { txt: '🎒 Abajo a la derecha están los <b>2 objetos de tu mochila</b>. Tocá uno para usarlo. Volvés a tenerlos cada vez que reaparecés.', desk: '🎒 Tus <b>2 objetos de la mochila</b> se usan con <b>Z</b> y <b>X</b>. Volvés a tenerlos cada vez que reaparecés.', hl: 'slot0', check: (g) => g.tutData.used },
  { txt: '🪜 Hay escaleras, terraza, escenario y cajones para trepar. Para cuidarte: no le muestres la cara a nadie y usá los probadores para cambiar tu número.', wait: 8 },
];

export class GameClient {
  constructor(app) {
    this.app = app;
    this.chars = new Map();
    this.me = { x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0, grounded: true, ry: 0, cy: 0, cp: 0.22, anim: 'idle', speed: 0, seq: 0, acts: [], tagT: 0 };
    this.lastEv = 0; this.lastPick = {}; this.dog = null;
    this.spectIdx = 0; this.lastHud = 0; this.matchT0 = 0; this.started = false;
    this.banner = { until: 0 }; this.camPos = new THREE.Vector3(); this.camLook = new THREE.Vector3();
    this.lastLookT = 0; this.tut = null; this.tutData = {};
    this.combo = {}; this.typed = ''; this.padOpen = false; this.zoom = false; this.photos = []; this.photoIdx = 0;
    this.readT = 0; this.readCache = new Map(); this.boxes = new Map(); this.smokes = new Map(); this.bananas = new Map();
    this.mirrorCam = new THREE.PerspectiveCamera(60, 2, 0.1, 200);
    this.bindHud();
  }
  get G() { return this.app.getG(); }
  get myId() { return this.app.net.myId; }
  gt() { const G = this.G; return G && G.t0 ? (Date.now() + this.app.clockOffset() - G.t0) / 1000 : -999; }
  act(...a) { this.me.seq++; this.me.acts.push([this.me.seq, ...a]); while (this.me.acts.length > 6) this.me.acts.shift(); this.app.net.setPresence({ ac: this.me.acts.slice() }); }

  startMatch() {
    const G = this.G; if (!G) return;
    if (this.matchT0 !== G.t0) {
      this.app.setMenuCrowd(false);
      this.lastEv = Math.max(0, (G.evn || 0) - (G.ev ? G.ev.length : 0));
      this.app.fx.clearAll();
      for (const [, c] of this.chars) { this.app.scene.remove(c.ch.root); c.ch.dispose(); }
      this.chars.clear(); this.lastPick = {}; this.photos = []; this.renderPhotos();
      this.clearObjs();
    }
    const p = G.pl[this.myId];
    if (p) { const s = this.app.W.spawns[p.si] || { x: 0, z: 8, y: 0 }; Object.assign(this.me, { x: s.x, z: s.z, y: s.y || 0, vx: 0, vz: 0, vy: 0 }); this.me.cy = Math.atan2(-s.x, -s.z); this.me.ry = this.me.cy; }
    this.me.acts = []; this.me.seq = 0;
    this.app.net.setPresence({ ac: [], x: this.me.x, z: this.me.z, y: this.me.y });
    this.started = true; this.matchT0 = G.t0; this.camPos.set(0, 0, 0);
    this.app.showHud(true); this.closePad(); this.reported = false;
    $('teams').classList.toggle('hidden', G.cfg.mode !== 'teams');
    if (this.app.wantTutorial) { this.tut = { i: 0, t: 0 }; this.tutData = { walked: 0, looked: 0, read: 0, typed: false, picked: false, used: false }; this.app.wantTutorial = false; this.renderTut(); }
    else { this.tut = null; $('coach').classList.remove('on'); }
  }
  stop() {
    this.started = false;
    for (const [, c] of this.chars) { this.app.scene.remove(c.ch.root); c.ch.dispose(); }
    this.chars.clear(); this.app.fx.clearAll(); this.clearObjs();
    this.dog = null; this.tut = null; this.zoom = false; this.closePad();
    $('coach').classList.remove('on'); $('itemCard').classList.remove('on'); $('mirror').classList.remove('on'); $('flashW').classList.remove('on');
    this.app.setDark(0);
  }
  clearObjs() { for (const m of [this.boxes, this.smokes, this.bananas]) { for (const [, o] of m) this.app.scene.remove(o); m.clear(); } }

  // ---------- HUD ----------
  bindHud() {
    $('bPad').addEventListener('pointerdown', (e) => { e.preventDefault(); this.padOpen ? this.closePad() : this.openPad(); });
    document.querySelectorAll('#keypad [data-k]').forEach((b) => b.addEventListener('pointerdown', (e) => { e.preventDefault(); this.key(b.dataset.k); }));
    $('bJump').addEventListener('pointerdown', (e) => { e.preventDefault(); this.jumpReq = true; });
    $('bZoom').addEventListener('pointerdown', (e) => { e.preventDefault(); this.zoom = !this.zoom; sfx.click(); });
    for (const i of [0, 1]) $('slot' + i).addEventListener('pointerdown', (e) => { e.preventDefault(); this.useSlot(i); });
    $('bCtx').addEventListener('pointerdown', (e) => { e.preventDefault(); this.ctxAction(); });
    $('bEmote').addEventListener('pointerdown', (e) => { e.preventDefault(); this.emote(); });
    $('bSpectNext').addEventListener('click', () => { this.spectIdx++; });
    $('coachSkip').addEventListener('click', () => this.endTut());
    $('itemCard').addEventListener('pointerdown', () => $('itemCard').classList.remove('on'));
    $('bPhotos').addEventListener('pointerdown', (e) => { e.preventDefault(); this.openPhotos(); });
    $('phClose').addEventListener('click', () => $('photoView').classList.remove('on'));
    $('phPrev').addEventListener('click', () => { this.photoIdx = Math.max(0, this.photoIdx - 1); this.showPhoto(); });
    $('phNext').addEventListener('click', () => { this.photoIdx = Math.min(this.photos.length - 1, this.photoIdx + 1); this.showPhoto(); });
    $('phZoom').addEventListener('click', () => { this.phZ = this.phZ >= 3 ? 1 : this.phZ + 1; this.showPhoto(); });
  }
  openPad() { this.padOpen = true; $('keypad').classList.add('on'); $('bPad').classList.add('on'); sfx.click(); }
  closePad() { this.padOpen = false; $('keypad').classList.remove('on'); $('bPad').classList.remove('on'); this.typed = ''; this.renderTyped(); }
  key(k) {
    if (!this.canAct()) return;
    const p = this.myP(); const st = (p && p.st) || {};
    if (k === 'del') { this.typed = this.typed.slice(0, -1); }
    else if (k === 'clr') { this.typed = ''; }
    else if (/^\d$/.test(k)) {
      if (st.cd > this.gt()) { this.toast('Esperá un segundo…', true); return; }
      if (this.typed.length >= 3) this.typed = '';
      this.typed += k; sfx.beep(false);
      if (this.typed.length === 3) {
        const v = this.typed; this.act('num', v); this.tutData.typed = true; this.me.tagT = 0.45;
        $('kpDisp').classList.add('sent'); setTimeout(() => { $('kpDisp').classList.remove('sent'); this.typed = ''; this.renderTyped(); }, 380);
        this.app.input.vibrate(25);
      }
    }
    this.renderTyped();
  }
  renderTyped() { const d = this.typed.padEnd(3, '·'); $('kpDisp').innerHTML = [...d].map((c) => `<span class="${c === '·' ? 'e' : ''}">${c}</span>`).join(''); }
  toast(text, small = false) {
    const el = document.createElement('div'); el.className = 'toast' + (small ? ' small' : ''); el.textContent = text;
    const box = $('toasts'); box.appendChild(el); while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.remove(), 2300);
  }
  showBanner(html, cls = '', dur = 3.5) { const b = $('banner'); b.className = 'banner on ' + cls; b.innerHTML = html; this.banner.until = performance.now() + dur * 1000; }
  center(big, sub) { const c = $('center'); if (!big) { c.classList.remove('on'); return; } c.classList.add('on'); $('centerBig').innerHTML = big; $('centerSub').innerHTML = sub || ''; }
  itemCard(k) {
    const it = ITEMS[k]; const el = $('itemCard');
    el.className = 'itemCard on ' + it.c;
    el.innerHTML = `<div class="ie">${it.e}</div><div><div class="cat">${it.c === 'leer' ? 'Para leer números' : it.c === 'proteger' ? 'Para protegerte' : 'Caos para todos'}</div><b>${it.n}</b><p>${it.d}</p><small>Tocá el objeto abajo a la derecha para usarlo.</small></div>`;
    clearTimeout(this._icT); this._icT = setTimeout(() => el.classList.remove('on'), 4500);
  }
  // ---------- tutorial ----------
  renderTut() {
    const c = $('coach'); if (!this.tut) { c.classList.remove('on'); return; }
    const s = TUT[this.tut.i]; const touch = document.body.classList.contains('touch');
    c.classList.add('on'); $('coachStep').textContent = `Paso ${this.tut.i + 1} de ${TUT.length}`;
    $('coachTxt').innerHTML = (!touch && s.desk) ? s.desk : s.txt;
    document.querySelectorAll('.hl').forEach((e) => e.classList.remove('hl'));
    if (s.hl) { const e = $(s.hl); if (e) e.classList.add('hl'); }
  }
  updateTut(dt) {
    if (!this.tut) return;
    const s = TUT[this.tut.i]; this.tut.t += dt;
    if ((s.check ? s.check(this) : this.tut.t > s.wait) && this.tut.t > 1.2) { sfx.good(); this.tut.i++; this.tut.t = 0; if (this.tut.i >= TUT.length) this.endTut(); else this.renderTut(); }
  }
  endTut() { this.tut = null; store.set('tutDone2', 1); document.querySelectorAll('.hl').forEach((e) => e.classList.remove('hl')); $('coach').classList.remove('on'); }

  // ---------- acciones ----------
  myP() { const G = this.G; return G && G.pl ? G.pl[this.myId] : null; }
  canAct() { const p = this.myP(); const t = this.gt(); if (!p || p.sp || t < 0 || this.G.ph !== 'play') return false; const st = p.st || {}; if (st.r > t || st.h > t) return false; return true; }
  useSlot(i) {
    if (!this.canAct()) return;
    const p = this.myP(); const inv = p.inv || []; const k = inv[i]; if (!k) return;
    const me = this.me; const fx = Math.sin(me.cy), fz = Math.cos(me.cy);
    let args = [];
    if (k === 'hum') args = [me.x + fx * 5, me.z + fz * 5, me.y];
    else if (k === 'ban') args = [me.x - fx * 0.6, me.z - fz * 0.6, me.y];
    else if (k === 'cam') { this.photoReq = true; }
    this.act('us', i, ...args);
    if (this.app.onItemUsed) this.app.onItemUsed(k);
    sfx.use(); this.app.input.vibrate(20); this.tutData.used = true;
    const msg = {
      bin: '🔭 <b>Binoculares listos.</b> Tocá 🔍 para hacer zoom y leer de lejos (20 s).',
      cam: '📸 <b>¡Foto!</b> Quedó guardada: tocá 🖼️ para verla con zoom.',
      liq: '💥 <b>¡Liquidación!</b> Todos los carteles brillan 8 s… ¡también el tuyo!',
      per: '🐶 <b>¡Perrito suelto!</b> Seguilo: corre hacia el jugador más cercano.',
      box: '📦 <b>Estás en la caja.</b> Nadie ve tu número. Te movés despacio.',
      esp: '🪞 <b>Espejo activado.</b> Arriba ves lo que pasa detrás tuyo.',
      tur: '👟 <b>¡Turbo!</b> Corrés más rápido 10 s.',
      res: '🦘 <b>¡Resorte!</b> Saltá: llegás mucho más alto durante 20 s.',
      rem: '🔁 <b>¡Remarcaste los precios!</b> Todos tienen número nuevo.',
      apa: '🌑 <b>¡Apagón!</b> Solo se ven los carteles.',
      hum: '💨 <b>Bomba de humo</b> tirada adelante tuyo.',
      ban: '🍌 <b>Cáscara en el piso.</b> El que la pise se resbala.',
    }[k];
    if (msg) this.showBanner(msg, 'mustard', 4);
  }
  emote() { const p = this.myP(); if (!p || p.sp || !this.me.grounded) return; this.me.emoT = 2.6; this.me.emoA = EMO_ANIM[p.em] || 'wave'; sfx.pop(); }
  ctxAction() {
    const c = this.ctx; if (!c || c.disabled) return;
    if (c.kind === 'booth') { this.act('bo', c.id); sfx.curtain(); }
    else if (c.kind === 'unbox') this.act('ubx');
  }

  // ---------- eventos ----------
  processEvents() {
    const G = this.G; if (!G || !G.ev) return;
    const name = (pid) => (G.pl[pid] ? G.pl[pid].n : 'Alguien');
    const W = this.app.W;
    for (const e of G.ev) {
      if (e[0] <= this.lastEv) continue;
      this.lastEv = e[0];
      const [, type, a, b, c] = e; const me = this.myId;
      if (type === 'el') {
        const vc = this.chars.get(b);
        if (vc) this.app.fx.burst(vc.x, vc.y + 1.2, vc.z, this.gt());
        if (a === me) { this.toast(`¡${c} era de ${name(b)}! +100`); sfx.hit(); this.app.input.vibrate([40, 40, 80]); }
        else if (b === me) { sfx.elim(); this.app.input.vibrate([120, 60, 120]); this.killedBy = name(a); }
        else this.toast(`${name(a)} le leyó el número a ${name(b)}`, true);
      } else if (type === 'nx') { if (a === me) { this.toast(`Nadie tiene el ${b}… −25`); sfx.wrong(); this.app.input.vibrate(80); } }
      else if (type === 'nv') { if (a === me) { this.toast('Ese jugador no está a la vista', true); sfx.wrong(); } }
      else if (type === 'mt') { if (a === me) this.toast('¡Es de tu equipo!', true); }
      else if (type === 'pk') { if (a === me) { sfx.pick(); this.itemCard(b); this.tutData.picked = true; } }
      else if (type === 'it') {
        const it = ITEMS[b];
        if (a !== me && it.c === 'caos') this.showBanner(`${it.e} <b>${name(a)}</b> usó <b>${it.n}</b>${b === 'rem' ? ': ¡todos tienen número nuevo!' : ''}`, 'pink', 3.5);
        if (b === 'cam' && a !== me) { const c2 = this.chars.get(a); if (c2) this.app.fx.flashAt(c2.x, c2.y + 1.5, c2.z, this.gt()); }
        if (b === 'rem') sfx.chime();
      } else if (type === 'fl') { if (a === me) sfx.pop(); }
      else if (type === 'sl') { if (a === me) this.showBanner('🍌 <b>¡Te resbalaste!</b>', 'pink', 2.5); sfx.wrong(); }
      else if (type === 'bx') { if (a === me) { const bth = W.booths[b]; Object.assign(this.me, { x: bth.doorX, z: bth.doorZ, y: bth.y || 0 }); this.me.ry = 0; this.toast('¡Número nuevo!'); sfx.curtain(); } }
      else if (type === 'bo') { if (a === me) { const bth = W.booths[b]; Object.assign(this.me, { x: bth.x, z: bth.z, y: bth.y || 0 }); } }
      else if (type === 'rs') { if (a === me) { const s = W.spawns[b]; if (s) Object.assign(this.me, { x: s.x, z: s.z, y: s.y || 0, vy: 0 }); this.toast('¡Volviste con número nuevo!'); } }
      else if (type === 'out') { if (a === me) { this.center('¡Sin vidas!', 'Ahora mirás la partida.'); setTimeout(() => this.center(null), 2600); } else this.toast(`${name(a)} se quedó sin vidas`, true); }
      else if (type === 'lf') this.toast(`${name(a)} se fue`, true);
    }
  }

  // ---------- jugadores ----------
  playerList() {
    const G = this.G; const out = []; const t = this.gt();
    const bp = this.app.hostPresence().bp || {};
    for (const pid in G.pl) {
      const p = G.pl[pid]; let pos;
      if (pid === this.myId) pos = { x: this.me.x, y: this.me.y, z: this.me.z, ry: this.me.ry, a: AI[this.me.anim] || 0, cy: this.me.cy };
      else if (p.bt) { const b = bp[pid]; if (b) pos = { x: b[0], z: b[1], ry: b[2], a: b[3], y: b[4] || 0, cy: b[2] }; }
      else { const pr = this.app.net.peers.get(pid); if (pr && pr.x !== undefined) pos = { x: pr.x, y: pr.y || 0, z: pr.z, ry: pr.ry, a: pr.a, cy: pr.cy, dg: pr.dg }; }
      if (!pos) continue;
      const st = p.st || {};
      const hidden = p.sp || p.gone || st.r > t || st.h > t;
      out.push({ pid, p, st, ...pos, hidden });
    }
    return out;
  }
  // ¿puedo leer el cartel de c? (de frente, cerca, sin paredes ni humo)
  // devuelve: 'hide' (no se ve el cartel), 'blur' (se ve pero no se lee), 'ok', 'glow'
  readable(c, q, t, G) {
    if (q.hidden || q.st.bx > t) return 'hide';
    const me = this.me; const P = this.app.W.P;
    const cam = this.app.camera.position;
    const dc = Math.hypot(cam.x - c.x, cam.y - c.y - 1.6, cam.z - c.z);
    if (dc > SHOW_MAX && !this.zoomOn(t) && !this.photoMode) return 'hide';
    if (P.camRay(cam.x, cam.y, cam.z, c.x, c.y + 1.62, c.z) < 0.95) return 'hide';
    for (const [, s] of this.smokes) { if (segDist(cam, c.x, c.y + 1.6, c.z, s.position) < s.userData.r) return 'hide'; }
    const dx = me.x - c.x, dz = me.z - c.z; const d = Math.hypot(dx, dz, me.y - c.y);
    const slip = q.st.sl > t;
    const facing = slip ? 1 : (dx * Math.sin(c.ry) + dz * Math.cos(c.ry)) / (Math.hypot(dx, dz) || 1);
    const liq = G.fx.liq && t < G.fx.liq[1]; const apa = G.fx.apa && t < G.fx.apa[1];
    const myst = (this.myP() || {}).st || {}; const noct = apa && myst.bi > t;
    const range = this.photoMode ? (liq ? 70 : READ_FAR) : liq ? READ_FAR : this.zoomOn(t) ? READ_ZOOM : noct ? 20 : apa ? READ_DARK : READ;
    if (d > range || facing < 0.3) return 'blur';
    return liq || apa ? 'glow' : 'ok';
  }
  zoomOn(t) { const p = this.myP(); return this.zoom && p && p.st && p.st.bi > t; }
  syncChars(list, dt, t, G) {
    const seen = new Set(); const fx = this.app.fx;
    const doRead = performance.now() - this.readT > 180; if (doRead) this.readT = performance.now();
    let readSomeone = false;
    for (const q of list) {
      seen.add(q.pid);
      let c = this.chars.get(q.pid);
      const look = parseLook(q.p.lk);
      if (!c) { c = { ch: new Character(look, { shadow: this.app.charShadows() }), x: q.x, y: q.y, z: q.z, ry: q.ry, key: '' }; this.app.scene.add(c.ch.root); this.chars.set(q.pid, c); }
      const isMe = q.pid === this.myId;
      if (isMe) { c.x = q.x; c.y = q.y; c.z = q.z; c.ry = q.ry; }
      else {
        // predicción suave: estimamos la velocidad con las últimas muestras y avanzamos un poco
        const now = performance.now();
        if (c.sx !== q.x || c.sz !== q.z || c.sy !== q.y) {
          if (c.st) { const dtS = Math.max(0.03, Math.min(0.5, (now - c.st) / 1000)); let vx = (q.x - c.sx) / dtS, vz = (q.z - c.sz) / dtS; const sp = Math.hypot(vx, vz); if (sp > 10) { vx *= 10 / sp; vz *= 10 / sp; } c.vx = (c.vx || 0) * 0.35 + vx * 0.65; c.vz = (c.vz || 0) * 0.35 + vz * 0.65; }
          c.sx = q.x; c.sz = q.z; c.sy = q.y; c.st = now;
        }
        const age = Math.min(0.22, (now - (c.st || now)) / 1000);
        const moving = q.a === 1 || q.a === 2;
        const px = q.x + (moving ? (c.vx || 0) * age : 0), pz = q.z + (moving ? (c.vz || 0) * age : 0);
        if (Math.hypot(px - c.x, pz - c.z) > 4 || Math.abs(q.y - c.y) > 3) { c.x = px; c.z = pz; c.y = q.y; }
        const k = 1 - Math.exp(-dt * 16);
        c.x += (px - c.x) * k; c.z += (pz - c.z) * k; c.y += (q.y - c.y) * (1 - Math.exp(-dt * 12)); c.ry = lerpAng(c.ry, q.ry, 1 - Math.exp(-dt * 14));
      }
      if (q.p.lk !== c.key) { c.key = q.p.lk; c.ch.setLook(look, false); }
      const inBox = q.st.bx > t && !q.hidden;
      c.ch.root.visible = !q.hidden && !inBox && !(isMe && this.selfHidden);
      c.ch.root.position.set(c.x, c.y, c.z); c.ch.root.rotation.set(q.st.sl > t ? -1.35 : 0, c.ry, 0);
      if (q.st.sl > t) c.ch.root.position.y = c.y + 0.25;
      let anim = ANIMS[q.a] || 'idle';
      if (q.st.sl > t) anim = 'idle';
      const moving = anim === 'walk' || anim === 'run';
      c.ch.update(dt, anim, moving ? (anim === 'run' ? 4.4 : 2) : 0, t, { danceOffset: 1 });
      // cartel
      if (isMe) c.ch.setTag(tagMaterial(q.p.num || '000', q.p.ts, q.p.tm || ''));
      else {
        if (doRead || c.read === undefined) c.read = this.readable(c, q, t, G);
        if (c.read === 'hide') c.ch.hideTag();
        else {
          c.ch.setTag(tagMaterial(q.p.num || '000', q.p.ts, q.p.tm || '', c.read === 'ok' ? '' : c.read));
          // de lejos el cartel se agranda para que se pueda leer en el celular
          const cp = this.app.camera.position; const dcam = Math.hypot(cp.x - c.x, cp.y - c.y - 1.6, cp.z - c.z);
          c.ch.tag.scale.setScalar(this.zoomOn(t) ? 1.1 : clamp(dcam / 6, 1, 1.45));
        }
        if (c.read === 'ok' || c.read === 'glow') readSomeone = true;
      }
      // caja de cartón
      let bx = this.boxes.get(q.pid);
      if (inBox) {
        if (!bx) { bx = makeBox(); this.app.scene.add(bx); this.boxes.set(q.pid, bx); }
        bx.visible = true; bx.position.set(c.x, c.y, c.z); bx.rotation.y = c.ry; bx.position.y += Math.abs(Math.sin(t * 9)) * (moving ? 0.04 : 0);
      } else if (bx) bx.visible = false;
      fx.setArrow(q.pid, false);
    }
    if (readSomeone) this.tutData.read = (this.tutData.read || 0) + dt;
    for (const [pid, c] of this.chars) if (!seen.has(pid)) { this.app.scene.remove(c.ch.root); c.ch.dispose(); this.chars.delete(pid); const bx = this.boxes.get(pid); if (bx) bx.visible = false; }
  }
  syncObjs(G, t) {
    const seenS = new Set(), seenB = new Set();
    for (const o of G.ob) {
      const [id, k, x, z, y] = o;
      if (k === 'hum') { seenS.add(id); if (!this.smokes.has(id)) { const s = makeSmoke(); s.position.set(x, y + 1.6, z); this.app.scene.add(s); this.smokes.set(id, s); sfx.rain(); } const s = this.smokes.get(id); s.rotation.y = t * 0.2; s.children.forEach((b, i) => { b.position.y = Math.sin(t + i) * 0.15; }); }
      if (k === 'ban') { seenB.add(id); if (!this.bananas.has(id)) { const b = makeBanana(); b.position.set(x, y + 0.03, z); this.app.scene.add(b); this.bananas.set(id, b); } }
    }
    for (const [id, s] of this.smokes) if (!seenS.has(id)) { this.app.scene.remove(s); this.smokes.delete(id); }
    for (const [id, b] of this.bananas) if (!seenB.has(id)) { this.app.scene.remove(b); this.bananas.delete(id); }
  }

  // ---------- movimiento ----------
  moveMe(dt, t, locked, st, input) {
    const me = this.me; const P = this.app.W.P;
    let mv = { x: 0, y: 0, run: false };
    if (!locked) mv = input.move();
    const look = input.look();
    const zk = this.zoomOn(t) ? 0.35 : 1;
    if (Math.abs(look.dx) + Math.abs(look.dy) > 0.0005) { this.lastLookT = t; this.tutData.looked = (this.tutData.looked || 0) + Math.abs(look.dx); }
    me.cy += look.dx * zk; me.cp = clamp(me.cp + look.dy * zk, -0.45, 0.85);
    const jump = (input.jump() || this.jumpReq); this.jumpReq = false;
    let want = 0, dx = 0, dz = 0;
    const slip = st.sl > t, inBox = st.bx > t, turbo = st.tu > t;
    if (!locked && !slip) {
      const mag = Math.min(1, Math.hypot(mv.x, mv.y));
      if (mag > 0.08) {
        const fx = Math.sin(me.cy), fz = Math.cos(me.cy), rx = -Math.cos(me.cy), rz = Math.sin(me.cy);
        dx = fx * mv.y + rx * mv.x; dz = fz * mv.y + rz * mv.x; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
        const run = mv.run || mag > 0.93;
        want = (inBox && !turbo) ? 1.3 : (run ? (turbo && !inBox ? 8 : 4.8) : 2.4 * Math.max(0.45, mag) * (turbo && !inBox ? 1.6 : 1));
      }
    }
    const acc = me.grounded ? 16 : 5; const k = 1 - Math.exp(-acc * dt);
    me.vx += (dx * want - me.vx) * k; me.vz += (dz * want - me.vz) * k;
    const sp = Math.hypot(me.vx, me.vz);
    if (sp > 0.05) {
      let nx = me.x + me.vx * dt, nz = me.z + me.vz * dt;
      [nx, nz] = P.slide(me.x, me.z, me.y, nx, nz, 0.3);
      this.tutData.walked = (this.tutData.walked || 0) + Math.hypot(nx - me.x, nz - me.z);
      me.x = nx; me.z = nz;
      if (want > 0) me.ry = lerpAng(me.ry, Math.atan2(dx, dz), 1 - Math.exp(-dt * 14));
    }
    const g = P.groundAt(me.x, me.z, me.y);
    if (jump && me.grounded && !locked && !slip && !inBox) { me.vy = st.rs > t ? SUPER_V : JUMP_V; me.grounded = false; sfx.pop(); if (st.rs > t && turbo) { me.vx += Math.sin(me.ry) * 8; me.vz += Math.cos(me.ry) * 8; } }
    if (!me.grounded || me.y > g + 0.02) {
      me.vy -= GRAV * dt; me.y += me.vy * dt;
      const g2 = P.groundAt(me.x, me.z, me.y);
      if (me.y <= g2) { me.y = g2; me.vy = 0; me.grounded = true; } else me.grounded = false;
    } else if (g > me.y) { me.y += (g - me.y) * Math.min(1, dt * 22); if (g - me.y < 0.01) me.y = g; me.grounded = true; }
    else { me.y = g; me.grounded = true; }
    if (want > 0 && t - this.lastLookT > 1.6 && mv.y > 0.2 && !this.zoom) { const d = angDiff(me.cy, me.ry); me.cy += d * Math.min(1, dt * 1.2) * Math.min(1, Math.abs(Math.sin(d)) * 2); }
    if (this.zoomOn(t)) me.ry = lerpAng(me.ry, me.cy, 0.3);
    me.speed = sp;
    me.anim = locked ? 'idle' : !me.grounded ? 'jump' : sp > 3.2 ? 'run' : sp > 0.3 ? 'walk' : 'idle';
  }

  update(dt) {
    const G = this.G; if (!G || !this.started) return;
    const t = this.gt();
    this.processEvents();
    const p = this.myP(); const st = (p && p.st) || {};
    const list = this.playerList(); const me = this.me; const input = this.app.input;
    playMusic('feria');
    // apagón
    const apa = G.fx.apa && t < G.fx.apa[1];
    this.app.setDark(apa ? 1 : 0, dt);
    const alive = p && !p.sp && G.ph === 'play';
    const locked = !alive || t < 0 || st.r > t || st.h > t;
    this.moveMe(dt, t, locked, st, input);
    if (me.tagT > 0) { me.tagT -= dt; if (me.grounded) me.anim = 'tag'; }
    if (me.emoT > 0) { me.emoT -= dt; if (me.anim === 'idle') me.anim = me.emoA; else me.emoT = 0; }
    // objetos del piso
    if (alive && !locked && (p.inv || []).length < 2) {
      for (const it of G.it) if (Math.hypot(it[2] - me.x, it[3] - me.z) < 1.25 && Math.abs((it[4] || 0) - me.y) < 1.3 && (!this.lastPick[it[0]] || performance.now() - this.lastPick[it[0]] > 1200)) { this.lastPick[it[0]] = performance.now(); this.act('pk', it[0]); }
    }
    this.updateDog(dt, t, st, list, G);
    this.app.net.setPresence({ x: Math.round(me.x * 100) / 100, z: Math.round(me.z * 100) / 100, y: Math.round(me.y * 100) / 100, ry: Math.round(me.ry * 100) / 100, a: AI[me.anim] || 0, cy: Math.round(me.cy * 100) / 100, dg: this.dog ? [Math.round(this.dog.x * 10) / 10, Math.round(this.dog.z * 10) / 10, Math.round(this.dog.ry * 10) / 10, this.dog.bark > 0 ? 1 : 0, Math.round(this.dog.y * 10) / 10] : null });
    this.syncChars(list, dt, t, G);
    this.syncObjs(G, t);
    this.app.fx.syncItems(G.it, t);
    const dogs = [];
    for (const q of list) { if (q.pid === this.myId) { if (this.dog) dogs.push({ pid: q.pid, x: this.dog.x, z: this.dog.z, y: this.dog.y, ry: this.dog.ry, bark: this.dog.bark > 0 }); } else if (q.dg) dogs.push({ pid: q.pid, x: q.dg[0], z: q.dg[1], ry: q.dg[2], bark: q.dg[3], y: q.dg[4] || 0 }); }
    this.app.fx.syncDogs(dogs, t, dt);
    this.app.fx.update(t, dt);
    this.app.W.booths.forEach((b, i) => { const occ = G.bo && G.bo[i] && G.bo[i][1] > t; b.open += ((occ ? 1 : 0.18) - b.open) * Math.min(1, dt * 6); b.curtain.userData.cloth.scale.x = b.open; });
    const blobs = []; for (const [, c] of this.chars) if (c.ch.root.visible) blobs.push({ x: c.x, z: c.z, y: this.app.W.P.groundAt(c.x, c.z, c.y + 0.05) });
    this.app.fx.setBlobs(blobs);
    this.app.fx.selRing.visible = false;
    this.computeCtx(t, st, p);
    this.updateCamera(dt, list, t, p);
    this.updateTut(dt);
    // flash recibido
    $('flashW').classList.toggle('on', st.fl > t);
    // combinaciones activas
    const act = { apa: G.fx.apa && t < G.fx.apa[1], liq: G.fx.liq && t < G.fx.liq[1], bin: st.bi > t, tur: st.tu > t, res: st.rs > t, box: st.bx > t, cam: this.photoMode };
    for (const c of COMBOS) { const on = !!(act[c.a] && act[c.b]); if (on && !this.combo[c.id]) { this.showBanner(`✨ <b>¡Combo! ${c.n}</b><br>${c.d}`, 'mustard', 4.5); sfx.fanfare(); } this.combo[c.id] = on; }
    if (performance.now() - this.lastHud > 100) { this.lastHud = performance.now(); this.updateHud(t, p, st, list, G); }
  }

  updateDog(dt, t, st, list, G) {
    const me = this.me; const W = this.app.W;
    if (st.d > t) {
      if (!this.dog) this.dog = { x: me.x + 0.8, z: me.z, y: me.y, ry: 0, bark: 0, nextBark: t + 1.5, path: [], repath: 0 };
      const d = this.dog; let best = null, bd = 1e9; const p = this.myP();
      for (const q of list) { if (q.pid === this.myId || q.hidden) continue; if (G.cfg.mode === 'teams' && q.p.tm === p.tm) continue; const dd = Math.hypot(q.x - d.x, q.z - d.z); if (dd < bd) { bd = dd; best = q; } }
      const tx = best ? best.x : me.x, tz = best ? best.z : me.z, ty = best ? best.y : me.y;
      if (t > d.repath) { d.path = navPath(W.nav, W.P, nearestNode(W.nav, d.x, d.z, d.y), nearestNode(W.nav, tx, tz, ty)); d.repath = t + 1.2; }
      const dist = Math.hypot(tx - d.x, tz - d.z);
      if (dist > 1.8 && d.path.length) {
        const q = d.path[0]; const ex = q.x - d.x, ez = q.z - d.z; const el = Math.hypot(ex, ez);
        if (el < 0.4) d.path.shift(); else { const sp = 3.8; let nx = d.x + (ex / el) * sp * dt, nz = d.z + (ez / el) * sp * dt; [nx, nz] = W.P.slide(d.x, d.z, d.y, nx, nz, 0.25); d.x = nx; d.z = nz; d.y = W.P.groundAt(d.x, d.z, d.y + 0.05); d.ry = lerpAng(d.ry, Math.atan2(ex, ez), 0.2); }
      } else d.ry = lerpAng(d.ry, Math.atan2(tx - d.x, tz - d.z), 0.1);
      if (t > d.nextBark) { d.nextBark = t + (dist < 9 ? 1.4 : 3.5); d.bark = 0.8; sfx.bark(); }
      d.bark -= dt;
    } else if (this.dog) this.dog = null;
  }
  computeCtx(t, st, p) {
    const G = this.G; const me = this.me; const W = this.app.W; let ctx = null;
    if (p && !p.sp && G.ph === 'play' && t >= 0 && !(st.r > t) && !(st.h > t)) {
      if (st.bx > t) ctx = { kind: 'unbox', label: '📦 Salir de la caja' };
      else for (const b of W.booths) {
        if (Math.hypot(b.doorX - me.x, b.doorZ - me.z) < 2.0 && me.y < 0.5) {
          const occ = G.bo && G.bo[b.id] && G.bo[b.id][1] > t;
          ctx = occ ? { kind: 'booth', id: b.id, label: '🚪 Ocupado', disabled: true } : { kind: 'booth', id: b.id, label: '🚪 Cambiar mi número' };
          break;
        }
      }
    }
    this.ctx = ctx;
  }
  updateCamera(dt, list, t, p) {
    const cam = this.app.camera; const me = this.me; const P = this.app.W.P;
    let fx = me.x, fy = me.y, fz = me.z; const yaw = me.cy, pitch = me.cp;
    if (p && p.sp) { const alive = list.filter((q) => q.pid !== this.myId && !q.hidden); if (alive.length) { const q = alive[this.spectIdx % alive.length]; const c = this.chars.get(q.pid); if (c) { fx = c.x; fy = c.y; fz = c.z; } this.spectName = q.p.n; } }
    const cfx = Math.sin(yaw), cfz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
    const zoom = this.zoomOn(t);
    if (zoom) {
      // vista de binoculares: desde la cabeza
      cam.position.set(fx, fy + 1.62, fz);
      this.camLook.set(fx + cfx * 10 * Math.cos(pitch), fy + 1.62 - Math.sin(pitch) * 10, fz + cfz * 10 * Math.cos(pitch));
      cam.lookAt(this.camLook); cam.fov += (16 - cam.fov) * Math.min(1, dt * 10); cam.updateProjectionMatrix();
      this.camPos.copy(cam.position);
    } else {
      const dist = this.app.settings.cam === 'near' ? 2.5 : 3.7;
      const tx = fx, ty = fy + 1.5, tz = fz; const sh = 0.42;
      let px = tx - cfx * dist * Math.cos(pitch) + rx * sh, py = ty + dist * Math.sin(pitch) + 0.2, pz = tz - cfz * dist * Math.cos(pitch) + rz * sh;
      const free = P.camRay(tx, ty, tz, px, py, pz);
      px = tx + (px - tx) * free; py = ty + (py - ty) * free; pz = tz + (pz - tz) * free;
      py = Math.max(py, P.groundAt(px, pz, py) + 0.35);
      if (this.camPos.lengthSq() === 0) this.camPos.set(px, py, pz);
      const k = 1 - Math.exp(-dt * 14);
      this.camPos.x += (px - this.camPos.x) * k; this.camPos.z += (pz - this.camPos.z) * k; this.camPos.y += (py - this.camPos.y) * (1 - Math.exp(-dt * 9));
      if (free < 0.99) this.camPos.set(px, py, pz);
      // si la cámara quedó pegada a la espalda, ocultamos tu personaje para que no tape la vista
      this.selfHidden = Math.hypot(px - tx, pz - tz) < 1.05;
      cam.position.copy(this.camPos);
      this.camLook.set(tx + cfx * 2 + rx * sh, ty + 0.1 - Math.sin(pitch) * 1.2, tz + cfz * 2 + rz * sh);
      cam.lookAt(this.camLook);
      const tf = me.anim === 'run' ? 70 : 62; cam.fov += (tf - cam.fov) * Math.min(1, dt * 6); cam.updateProjectionMatrix();
    }
    // espejo: cámara mirando hacia atrás
    const st = (p && p.st) || {};
    this.mirrorOn = st.mi > t;
    if (this.mirrorOn) { const mc = this.mirrorCam; mc.position.set(fx, fy + 1.7, fz); mc.lookAt(fx - cfx * 10, fy + 1.3, fz - cfz * 10); }
  }
  // foto: el anfitrión de la pantalla llama esto justo después de dibujar
  afterRender(canvas) {
    if (this.photoShoot) {
      this.photoShoot = false;
      try { const url = canvas.toDataURL('image/jpeg', 0.85); this.photos.push(url); if (this.photos.length > 6) this.photos.shift(); this.renderPhotos(); this.showSnap(url); this.app.fx.flashAt(this.me.x, this.me.y + 1.5, this.me.z, this.gt()); } catch (e) { }
      this.photoMode = false; for (const [, c] of this.chars) c.read = undefined;
    }
    if (this.photoReq) { this.photoReq = false; this.photoShoot = true; this.readT = 0; this.photoMode = true; for (const [, c] of this.chars) c.read = undefined; }
  }
  // la foto recién sacada aparece unos segundos; tocándola se abre en grande
  showSnap(url) {
    let el = $('snap');
    if (!el) { el = document.createElement('button'); el.id = 'snap'; el.className = 'snap pe'; el.innerHTML = '<img alt="Foto"><span>Tocá para ver con zoom</span>'; $('hud').appendChild(el); el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.classList.remove('on'); this.openPhotos(); }); }
    el.querySelector('img').src = url; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    clearTimeout(this._snapT); this._snapT = setTimeout(() => el.classList.remove('on'), 5000);
  }
  renderPhotos() { const b = $('bPhotos'); b.classList.toggle('hidden', !this.photos.length); b.querySelector('b').textContent = this.photos.length; }
  openPhotos() { if (!this.photos.length) return; this.photoIdx = this.photos.length - 1; this.phZ = 1; $('photoView').classList.add('on'); this.showPhoto(); }
  showPhoto() { const img = $('phImg'); img.src = this.photos[this.photoIdx]; img.style.transform = `scale(${this.phZ || 1})`; $('phCount').textContent = `${this.photoIdx + 1} / ${this.photos.length}`; $('phZoom').textContent = `🔍 x${this.phZ || 1}`; }

  updateHud(t, p, st, list, G) {
    if (!p) return;
    const lv = $('lives'); const n = G.cfg.lives;
    if (lv.dataset.k !== p.lv + '/' + n) { lv.dataset.k = p.lv + '/' + n; lv.innerHTML = Array.from({ length: n }, (_, i) => HEART.replace('<svg', `<svg class="${i < p.lv ? '' : 'lost'}"`)).join(''); }
    $('score').textContent = p.sc;
    const left = G.cfg.dur - Math.max(0, t);
    const tm = $('timer'); tm.textContent = t < 0 ? fmtTime(G.cfg.dur) : fmtTime(left); tm.classList.toggle('low', left < 30 && t > 0);
    if (G.cfg.mode === 'teams') { $('tsR').textContent = G.tsc.r || 0; $('tsB').textContent = G.tsc.b || 0; $('myTeam').textContent = p.tm === 'r' ? 'Sos del equipo ROJO' : 'Sos del equipo AZUL'; $('myTeam').className = 'myTeam ' + p.tm; }
    // mi número
    const mt = $('myTag'); const key = (p.num || '') + p.ts + (p.tm || '');
    if (mt.dataset.k !== key) { mt.dataset.k = key; const sty = TAG_STYLES[p.ts] || TAG_STYLES.tag_clasico; mt.innerHTML = `<small>TU NÚMERO</small><b>${p.num || '···'}</b>`; mt.className = 'myTag ' + (p.ts || 'tag_clasico') + (p.tm ? ' team-' + p.tm : ''); void sty; }
    mt.classList.toggle('hiddenTag', st.bx > t);
    if (t < 0 && t > -4) { const c = Math.ceil(-t); this.center(`<span class="count">${c}</span>`, 'Leé los números de los demás… y que no te lean el tuyo'); if (this._cd !== c) { this._cd = c; sfx.beep(false); } }
    else if (t >= 0 && t < 1.2 && this._cd) { this._cd = 0; this.center('<span class="count">¡YA!</span>', ''); sfx.beep(true); setTimeout(() => this.center(null), 900); }
    else if (st.r > t && !p.sp) this.center('¡Te leyeron el número!', `${this.killedBy ? this.killedBy + ' te marcó. ' : ''}Volvés en ${Math.ceil(st.r - t)}…`);
    else if (st.h > t) this.center('🚪 Probador', 'Cambiando tu número…');
    else if (!(t < 1.2 && t >= 0) && $('center').classList.contains('on') && !$('centerBig').textContent.includes('Sin vidas')) this.center(null);
    // objetos
    const inv = p.inv || [];
    for (const i of [0, 1]) { const el = $('slot' + i); const k = inv[i]; if (el.dataset.k !== (k || '')) { el.dataset.k = k || ''; el.className = 'slot' + (k ? ' full ' + ITEMS[k].c : ''); el.innerHTML = `<span class="k">${i ? 'X' : 'Z'}</span>${k ? ITEMS[k].e : ''}<span class="nm">${k ? ITEMS[k].n : 'vacío'}</span>`; } }
    $('bZoom').classList.toggle('hidden', !(st.bi > t)); $('bZoom').classList.toggle('on', this.zoomOn(t));
    $('scope').classList.toggle('on', this.zoomOn(t));
    $('bPad').classList.toggle('cd', st.cd > t);
    const cb = $('bCtx'); if (this.ctx) { cb.classList.remove('hidden'); cb.textContent = this.ctx.label; cb.disabled = !!this.ctx.disabled; } else cb.classList.add('hidden');
    $('mirror').classList.toggle('on', !!this.mirrorOn);
    // estados activos
    const chips = [];
    const add = (until, e, n) => { if (until > t) chips.push(`<span>${e} ${n} ${Math.ceil(until - t)}s</span>`); };
    add(st.bi, '🔭', 'Binoculares'); add(st.bx, '📦', 'Caja'); add(st.tu, '👟', 'Turbo'); add(st.rs, '🦘', 'Resorte'); add(st.mi, '🪞', 'Espejo'); add(st.d, '🐶', 'Perrito');
    if (G.fx.liq && t < G.fx.liq[1]) chips.push(`<span class="hot">💥 Liquidación ${Math.ceil(G.fx.liq[1] - t)}s</span>`);
    if (G.fx.apa && t < G.fx.apa[1]) chips.push(`<span class="hot">🌑 Apagón ${Math.ceil(G.fx.apa[1] - t)}s</span>`);
    $('effects').innerHTML = chips.join('');
    if (performance.now() > this.banner.until) $('banner').classList.remove('on');
    const sp = $('spect'); if (p.sp) { sp.classList.add('on'); $('spectTxt').textContent = `Mirando a ${this.spectName || '—'}`; } else sp.classList.remove('on');
  }
}

// ---- objetos visuales ----
function segDist(a, bx, by, bz, c) {
  const vx = bx - a.x, vy = by - a.y, vz = bz - a.z; const wx = c.x - a.x, wy = c.y - a.y, wz = c.z - a.z;
  const L = vx * vx + vy * vy + vz * vz || 1; let k = (wx * vx + wy * vy + wz * vz) / L; k = Math.max(0, Math.min(1, k));
  return Math.hypot(a.x + vx * k - c.x, a.y + vy * k - c.y, a.z + vz * k - c.z);
}
function makeBox() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0xc89a62, roughness: 0.9 });
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.15, 0.85), m); b.position.y = 0.58; b.castShadow = true; g.add(b);
  const tape = new THREE.Mesh(new THREE.BoxGeometry(0.97, 0.08, 0.87), new THREE.MeshStandardMaterial({ color: 0xa87a42 })); tape.position.y = 0.95; g.add(tape);
  for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.02, 0.42), m); f.position.set(0, 1.18, s * 0.33); f.rotation.x = s * 0.5; g.add(f); }
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.07, 0.02), new THREE.MeshBasicMaterial({ color: 0x1a0d22 })); eye.position.set(0, 0.85, 0.43); g.add(eye);
  return g;
}
function makeSmoke() {
  const g = new THREE.Group(); g.userData.r = 4.2;
  const m = new THREE.MeshStandardMaterial({ color: 0xe9e4ef, transparent: true, opacity: 0.86, roughness: 1, depthWrite: false });
  for (let i = 0; i < 16; i++) { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4 + Math.random() * 1.1, 1), m); s.position.set((Math.random() - 0.5) * 5.5, (Math.random() - 0.4) * 2.2, (Math.random() - 0.5) * 5.5); const w = new THREE.Group(); w.add(s); g.add(w); }
  return g;
}
function makeBanana() {
  const g = new THREE.Group(); const m = new THREE.MeshStandardMaterial({ color: 0xffd23a, roughness: 0.6 });
  for (let i = 0; i < 4; i++) { const p = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.22, 3, 6), m); p.rotation.z = Math.PI / 2; p.rotation.y = (i / 4) * Math.PI * 2; p.position.set(Math.cos((i / 4) * Math.PI * 2) * 0.12, 0.03, -Math.sin((i / 4) * Math.PI * 2) * 0.12); g.add(p); }
  const c = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshStandardMaterial({ color: 0x6b4a1f })); c.position.y = 0.05; g.add(c);
  return g;
}
export { makeDog };
