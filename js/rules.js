// Reglas del juego de números (las corre el anfitrión). Estado compacto para que viaje por la red.
import { randomLook } from './look.js';
import { mulberry32, shuffle, uid } from './util.js';
import { navPath, nearestNode } from './phys.js';

export const ITEMS = {
  bin: { n: 'Binoculares', e: '🔭', c: 'leer', d: 'Durante 20 segundos podés hacer zoom y leer carteles lejanos.' },
  cam: { n: 'Cámara de fotos', e: '📸', c: 'leer', d: 'Sacás una foto que queda guardada para mirar los números con calma. El flash encandila a quien tengas cerca.' },
  liq: { n: '¡Liquidación!', e: '💥', c: 'leer', d: 'Durante 8 segundos todos los carteles brillan y se leen desde lejos. ¡También el tuyo!' },
  per: { n: 'Perrito', e: '🐶', c: 'leer', d: 'Corre hacia el jugador más cercano y ladra.' },
  box: { n: 'Caja de cartón', e: '📦', c: 'proteger', d: 'Te metés adentro y nadie ve tu cartel. Te movés despacito. Dura 25 segundos.' },
  esp: { n: 'Espejo de mano', e: '🪞', c: 'proteger', d: 'Durante 12 segundos ves quién está detrás tuyo.' },
  tur: { n: 'Zapatillas turbo', e: '👟', c: 'proteger', d: 'Corrés mucho más rápido durante 10 segundos.' },
  res: { n: 'Resorte', e: '🦘', c: 'proteger', d: 'Súper saltos durante 20 segundos: subite a techos y toldos.' },
  rem: { n: 'Remarcar precios', e: '🔁', c: 'caos', d: 'Cambian los números de todos. ¡A volver a leer!' },
  apa: { n: 'Apagón', e: '🌑', c: 'caos', d: 'Se apagan las luces 10 segundos. Solo brillan los carteles.' },
  hum: { n: 'Bomba de humo', e: '💨', c: 'caos', d: 'Una nube de humo tapa la vista en una zona por 15 segundos.' },
  ban: { n: 'Cáscara de banana', e: '🍌', c: 'caos', d: 'La dejás en el piso: quien la pise se resbala y queda boca arriba.' },
};
export const ITEM_POOL = Object.keys(ITEMS);
// combinaciones: si tenés los dos efectos activos a la vez, pasa algo extra
export const COMBOS = [
  { id: 'noct', a: 'apa', b: 'bin', n: 'Visión nocturna', d: 'Con los binoculares activos durante un apagón, leés a 20 m sin hacer zoom y los carteles brillan.' },
  { id: 'cang', a: 'tur', b: 'res', n: 'Salto canguro', d: 'Turbo + resorte: cada salto te lanza lejos hacia adelante.' },
  { id: 'flash', a: 'liq', b: 'cam', n: 'Foto de liquidación', d: 'Una foto durante la liquidación lee carteles hasta 70 m.' },
  { id: 'cajav', a: 'box', b: 'tur', n: 'Caja veloz', d: 'Con turbo, dentro de la caja te movés a velocidad normal.' },
];
const pickLo = (lo) => (Array.isArray(lo) ? lo.filter((k) => ITEMS[k]).slice(0, 2) : []);
export const ITEM_KEYS = ITEM_POOL;
export const CFG = { RESPAWN: 3, HIT: 100, WRONG: 25, BONUS: 0, RANGE: 16, RANGE_BIN: 45, BOOTH_T: 3, ITEMS_ON_GROUND: 0 };

export const lookStr = (l) => l.map((v) => v.toString(36)).join('');
export const parseLook = (s) => (s ? [...s].map((c) => parseInt(c, 36)) : null);
const r1 = (v) => Math.round(v * 10) / 10;

export class HostRules {
  constructor(ctx) {
    this.ctx = ctx; // { W, now(): ms, onEnd(G) }
    this.G = { ph: 'lobby', cfg: { max: 6, dur: 300, lives: 3, mode: 'ffa' }, t0: 0, pl: {}, it: [], ob: [], fx: {}, bo: [], ev: [], full: [], res: null, evn: 0, tsc: { r: 0, b: 0 }, name: '' };
    this.lastSeq = {}; this.bots = {}; this.pending = []; this.itemId = 1; this.botN = 0;
    this.rng = mulberry32((Math.random() * 1e9) | 0);
  }
  gt() { return this.G.t0 ? (this.ctx.now() - this.G.t0) / 1000 : 0; }
  ev(...a) { this.G.evn++; this.G.ev.push([this.G.evn, ...a]); while (this.G.ev.length > 10) this.G.ev.shift(); }
  // ---- lobby ----
  syncLobby(peers, hostId) {
    const G = this.G;
    if (G.ph !== 'lobby') {
      for (const pid in G.pl) { const p = G.pl[pid]; if (!p.bt && !peers.has(pid) && !p.gone) { p.gone = 1; p.sp = 1; this.ev('lf', pid); if (G.ph === 'play') this.checkEnd(); } }
      const full = []; for (const [id, pr] of peers) if (!G.pl[id] && pr && pr.n) full.push(id);
      G.full = full; return;
    }
    const ids = []; for (const [id, pr] of peers) if (pr && pr.n) ids.push(id);
    for (const pid in G.pl) if (!G.pl[pid].bt && !ids.includes(pid)) delete G.pl[pid];
    const full = [];
    for (const id of ids) {
      const pr = peers.get(id);
      const info = { n: String(pr.n).slice(0, 14), lk: pr.lk0 || lookStr(randomLook()), ts: pr.ts || 'tag_clasico', nc: pr.nc || 'nc_blanco', em: pr.em || 'emo_saludo', uid: pr.uid || '', lo: pickLo(pr.lo) };
      if (!G.pl[id]) {
        if (Object.keys(G.pl).length >= G.cfg.max) { full.push(id); continue; }
        G.pl[id] = { ...info, lv: G.cfg.lives, sc: 0, h: id === hostId ? 1 : 0 };
      } else Object.assign(G.pl[id], info);
    }
    G.full = full;
  }
  addBot() {
    const G = this.G; if (Object.keys(G.pl).length >= G.cfg.max) return;
    const names = ['Rulo', 'Tita', 'Coco', 'Lola', 'Pipo', 'Mimi', 'Toto', 'Kika', 'Nacho'];
    const id = 'bot' + (++this.botN) + '-' + uid().slice(0, 3);
    const lo = shuffle(this.rng, ITEM_POOL.slice()).slice(0, 2);
    G.pl[id] = { n: names[(this.botN - 1) % names.length] + ' 🤖', lk: lookStr(randomLook()), ts: 'tag_clasico', nc: 'nc_blanco', em: 'emo_saludo', lv: G.cfg.lives, sc: 0, bt: 1, lo };
  }
  removeBot() { const ids = Object.keys(this.G.pl).filter((k) => this.G.pl[k].bt); if (ids.length) delete this.G.pl[ids[ids.length - 1]]; }
  setCfg(cfg) { Object.assign(this.G.cfg, cfg); for (const p of Object.values(this.G.pl)) p.lv = this.G.cfg.lives; }
  newNum(exclude) {
    const used = new Set(Object.values(this.G.pl).map((p) => p.num)); if (exclude) used.add(exclude);
    let n; do { n = 100 + Math.floor(this.rng() * 900); } while (used.has(n));
    return n;
  }
  start() {
    const G = this.G; const ids = Object.keys(G.pl);
    if (ids.length < 2) return false;
    G.t0 = this.ctx.now() + 4000; G.ph = 'play';
    G.it = []; G.ob = []; G.fx = {}; G.bo = this.ctx.W.booths.map(() => 0); G.res = null; G.ev = []; G.tsc = { r: 0, b: 0 };
    const spawns = shuffle(this.rng, this.ctx.W.spawns.map((_, i) => i));
    const order = shuffle(this.rng, ids.slice());
    order.forEach((pid, k) => {
      const p = G.pl[pid];
      Object.assign(p, { lv: G.cfg.lives, sc: 0, sp: 0, lost: 0, finds: 0, inv: (p.lo || []).slice(), st: {}, si: spawns[k % spawns.length], gone: 0, num: 0, tm: G.cfg.mode === 'teams' ? (k % 2 ? 'b' : 'r') : '' });
    });
    for (const pid of ids) G.pl[pid].num = this.newNum();
    for (const pid of ids) if (G.pl[pid].bt) this.bots[pid] = this.newBot(pid, this.ctx.W.spawns[G.pl[pid].si]);
    this.lastSeq = {};
    for (let i = 0; i < CFG.ITEMS_ON_GROUND; i++) this.spawnItem();
    this.ev('go');
    return true;
  }
  backToLobby() {
    const G = this.G; G.ph = 'lobby'; G.t0 = 0; G.it = []; G.ob = []; G.fx = {}; G.res = null;
    for (const p of Object.values(G.pl)) { p.lv = G.cfg.lives; p.sc = 0; delete p.st; delete p.inv; p.sp = 0; }
    this.bots = {}; this.ev('lobby');
  }
  alive() { return Object.keys(this.G.pl).filter((k) => { const p = this.G.pl[k]; return p.lv > 0 && !p.sp && !p.gone; }); }
  spawnItem() {
    const W = this.ctx.W; const G = this.G;
    for (let tries = 0; tries < 12; tries++) {
      const s = W.itemSpots[Math.floor(this.rng() * W.itemSpots.length)];
      if (G.it.some((i) => Math.hypot(i[2] - s.x, i[3] - s.z) < 4)) continue;
      const k = ITEM_POOL[Math.floor(this.rng() * ITEM_POOL.length)];
      G.it.push([this.itemId++, k, r1(s.x), r1(s.z), r1(s.y || 0)]); return;
    }
  }
  posOf(pid, peers) { if (this.bots[pid]) return this.bots[pid]; const pr = peers.get(pid); return pr && pr.x !== undefined ? pr : null; }
  // ¿a se puede ver a b? (distancia y sin paredes en el medio)
  canSee(a, b, range) {
    const d = Math.hypot(a.x - b.x, a.z - b.z, (a.y || 0) - (b.y || 0)); if (d > range) return false;
    const P = this.ctx.W.P;
    const free = P.camRay(a.x, (a.y || 0) + 1.55, a.z, b.x, (b.y || 0) + 1.6, b.z);
    return free > 0.93;
  }
  // ---- acciones ----
  handleActions(peers) {
    for (const pid in this.G.pl) {
      const pr = this.bots[pid] ? this.bots[pid].pres : peers.get(pid);
      if (!pr || !pr.ac) continue;
      const last = this.lastSeq[pid] || 0; let max = last;
      for (const a of pr.ac) { if (a[0] > last) { this.action(pid, a, peers); if (a[0] > max) max = a[0]; } }
      this.lastSeq[pid] = max;
    }
  }
  action(pid, a, peers) {
    const G = this.G; const p = G.pl[pid]; if (!p || G.ph !== 'play') return;
    const t = this.gt(); if (t < 0) return;
    const st = p.st || (p.st = {});
    const type = a[1]; const me = this.posOf(pid, peers);
    if (p.sp || p.lv <= 0 || (st.r && st.r > t)) return;
    if (type === 'num') {
      if (st.cd && st.cd > t) return;
      const val = parseInt(a[2], 10);
      const vid = Object.keys(G.pl).find((k) => k !== pid && G.pl[k].num === val && !G.pl[k].sp && !G.pl[k].gone);
      if (!vid) { p.sc = Math.max(0, p.sc - CFG.WRONG); st.cd = r1(t + 2); this.ev('nx', pid, val); return; }
      const v = G.pl[vid]; const vst = v.st || {};
      if (G.cfg.mode === 'teams' && v.tm === p.tm) { st.cd = r1(t + 1); this.ev('mt', pid); return; }
      if ((vst.r && vst.r > t) || (vst.h && vst.h > t)) { st.cd = r1(t + 1); this.ev('nv', pid); return; }
      const vp = this.posOf(vid, peers);
      const range = (G.fx.liq && t < G.fx.liq[1]) ? 75 : st.bi > t ? CFG.RANGE_BIN : CFG.RANGE;
      if (!me || !vp || !this.canSee(me, vp, range)) { st.cd = r1(t + 1); this.ev('nv', pid); return; }
      this.eliminate(pid, vid);
    } else if (type === 'pk') {
      const idx = G.it.findIndex((i) => i[0] === a[2]);
      if (idx < 0 || (p.inv || []).length >= 2) return;
      const it = G.it[idx];
      if (me && (Math.hypot(me.x - it[2], me.z - it[3]) > 2.8 || Math.abs((me.y || 0) - (it[4] || 0)) > 1.6)) return;
      G.it.splice(idx, 1); (p.inv || (p.inv = [])).push(it[1]);
      this.ev('pk', pid, it[1]);
      this.pending.push([t + 8, () => this.spawnItem()]);
    } else if (type === 'us') {
      const inv = p.inv || []; const k = inv[a[2]]; if (!k) return;
      inv.splice(a[2], 1); this.useItem(pid, k, a.slice(3), t, peers);
    } else if (type === 'bo') {
      const b = this.ctx.W.booths[a[2]]; if (!b) return;
      if (G.bo[a[2]] && G.bo[a[2]][1] > t) return;
      if (me && Math.hypot(me.x - b.doorX, me.z - b.doorZ) > 3) return;
      G.bo[a[2]] = [pid, r1(t + CFG.BOOTH_T)]; st.h = r1(t + CFG.BOOTH_T);
      this.ev('bo', pid, a[2]);
      this.pending.push([t + CFG.BOOTH_T, () => { if (!G.pl[pid]) return; G.pl[pid].num = this.newNum(G.pl[pid].num); G.bo[a[2]] = 0; this.ev('bx', pid, a[2]); }]);
    } else if (type === 'ubx') { st.bx = 0; }
  }
  useItem(pid, k, args, t, peers) {
    const G = this.G; const p = G.pl[pid]; const st = p.st; const me = this.posOf(pid, peers) || { x: 0, z: 0, y: 0 };
    const id = this.itemId++;
    if (k === 'bin') st.bi = r1(t + 20);
    else if (k === 'cam') {
      // flash: encandila a quien esté adelante y cerca
      const ry = me.cy ?? me.ry ?? 0; const fx = Math.sin(ry), fz = Math.cos(ry);
      for (const q in G.pl) { if (q === pid) continue; const qp = this.posOf(q, peers); if (!qp) continue; const dx = qp.x - me.x, dz = qp.z - me.z; const d = Math.hypot(dx, dz); if (d < 9 && d > 0.2 && (dx * fx + dz * fz) / d > 0.5) { (G.pl[q].st || (G.pl[q].st = {})).fl = r1(t + 2.2); this.ev('fl', q); } }
    }
    else if (k === 'liq') G.fx.liq = [r1(t), r1(t + 8)];
    else if (k === 'per') st.d = r1(t + 20);
    else if (k === 'box') st.bx = r1(t + 25);
    else if (k === 'esp') st.mi = r1(t + 12);
    else if (k === 'tur') st.tu = r1(t + 10);
    else if (k === 'res') st.rs = r1(t + 20);
    else if (k === 'rem') { for (const q in G.pl) G.pl[q].num = 0; for (const q in G.pl) G.pl[q].num = this.newNum(); }
    else if (k === 'apa') G.fx.apa = [r1(t), r1(t + 10)];
    else if (k === 'hum') G.ob.push([id, 'hum', r1(args[0] ?? me.x), r1(args[1] ?? me.z), r1(args[2] ?? me.y ?? 0), r1(t + 15), pid]);
    else if (k === 'ban') G.ob.push([id, 'ban', r1(args[0] ?? me.x), r1(args[1] ?? me.z), r1(args[2] ?? me.y ?? 0), r1(t + 60), pid]);
    this.ev('it', pid, k);
  }
  eliminate(hid, vid) {
    const G = this.G; const h = G.pl[hid], v = G.pl[vid]; const t = this.gt();
    h.sc += CFG.HIT; h.finds = (h.finds || 0) + 1; v.lv -= 1; v.lost = (v.lost || 0) + 1;
    if (G.cfg.mode === 'teams' && h.tm) G.tsc[h.tm] = (G.tsc[h.tm] || 0) + 1;
    v.st = { r: r1(t + CFG.RESPAWN) }; v.inv = [];
    this.ev('el', hid, vid, v.num);
    if (v.lv <= 0) { v.sp = 1; this.ev('out', vid); }
    else {
      const si = Math.floor(this.rng() * this.ctx.W.spawns.length); v.si = si;
      this.pending.push([t + CFG.RESPAWN, () => {
        if (!G.pl[vid]) return;
        G.pl[vid].num = this.newNum(G.pl[vid].num);
        // vuelve con los objetos de la mochila (si todavía le quedan)
        const pr = this.lastPeers && this.lastPeers.get(vid); if (pr && pr.lo) G.pl[vid].lo = pickLo(pr.lo);
        G.pl[vid].inv = (G.pl[vid].lo || []).slice();
        this.ev('rs', vid, si);
        if (this.bots[vid]) { const s = this.ctx.W.spawns[si]; Object.assign(this.bots[vid], { x: s.x, z: s.z, y: s.y || 0, path: [], seen: {} }); }
      }]);
    }
    this.checkEnd();
  }
  checkEnd() {
    const G = this.G; if (G.ph !== 'play') return;
    const a = this.alive();
    const humans = Object.keys(G.pl).filter((k) => !G.pl[k].bt && !G.pl[k].gone);
    let over = this.gt() >= G.cfg.dur || humans.length === 0;
    if (G.cfg.mode === 'teams') { const r = a.filter((k) => G.pl[k].tm === 'r').length, b = a.filter((k) => G.pl[k].tm === 'b').length; if (!r || !b) over = true; }
    else if (a.length <= 1) over = true;
    if (over) this.finish();
  }
  finish() {
    const G = this.G; G.ph = 'end';
    G.res = Object.keys(G.pl).sort((a, b) => G.pl[b].sc - G.pl[a].sc || (G.pl[b].lv - G.pl[a].lv));
    if (G.cfg.mode === 'teams') { const r = G.tsc.r || 0, b = G.tsc.b || 0; G.win = r > b ? 'r' : b > r ? 'b' : ''; }
    else G.win = G.res[0];
    this.ev('end');
  }
  // ---- tick ----
  tick(dt, peers) {
    this.lastPeers = peers;
    const G = this.G; if (G.ph !== 'play') return;
    const t = this.gt(); if (t < 0) return;
    this.handleActions(peers);
    const due = this.pending.filter((p) => p[0] <= t); this.pending = this.pending.filter((p) => p[0] > t);
    due.forEach((p) => p[1]());
    if (G.ph !== 'play') return;
    G.ob = G.ob.filter((o) => o[5] > t);
    for (const o of [...G.ob]) {
      if (o[1] !== 'ban') continue;
      for (const pid in G.pl) {
        if (pid === o[6]) continue; const q = G.pl[pid]; if (q.sp) continue;
        const pos = this.posOf(pid, peers); if (!pos) continue;
        if (Math.hypot(pos.x - o[2], pos.z - o[3]) < 0.7 && Math.abs((pos.y || 0) - o[4]) < 0.8) { (q.st || (q.st = {})).sl = r1(t + 2.5); this.ev('sl', pid); G.ob = G.ob.filter((b) => b !== o); break; }
      }
    }
    if (G.fx.liq && t > G.fx.liq[1]) delete G.fx.liq;
    if (G.fx.apa && t > G.fx.apa[1]) delete G.fx.apa;
    for (const bid in this.bots) this.botTick(bid, dt, t, peers);
    this.checkEnd();
  }
  // ---- bots ----
  newBot(pid, s) { return { pid, x: s.x, z: s.z, y: s.y || 0, ry: 0, a: 0, path: [], wait: 0, seq: 0, pres: { ac: [] }, cy: 0, useAt: 12 + Math.random() * 20, seen: {}, thinkAt: 0 }; }
  botAct(b, ...a) { b.seq++; b.pres.ac.push([b.seq, ...a]); while (b.pres.ac.length > 6) b.pres.ac.shift(); }
  botTick(bid, dt, t, peers) {
    const G = this.G; const p = G.pl[bid]; const b = this.bots[bid]; const W = this.ctx.W;
    if (!p || p.sp) { b.a = 0; return; }
    const st = p.st || {};
    if ((st.r && st.r > t) || (st.h && st.h > t) || (st.sl && st.sl > t)) { b.a = st.sl > t ? 7 : 0; return; }
    // mirar alrededor: si ve de frente a alguien cerca, "lee" su número
    if (t > b.thinkAt) {
      b.thinkAt = t + 0.4;
      for (const q in G.pl) {
        if (q === bid) continue; const qq = G.pl[q]; if (qq.sp || (G.cfg.mode === 'teams' && qq.tm === p.tm)) continue;
        const qs = qq.st || {}; if ((qs.r && qs.r > t) || (qs.bx && qs.bx > t) || (qs.h && qs.h > t)) continue;
        const qp = this.posOf(q, peers); if (!qp) continue;
        const dx = b.x - qp.x, dz = b.z - qp.z; const d = Math.hypot(dx, dz);
        const facing = (dx * Math.sin(qp.ry || 0) + dz * Math.cos(qp.ry || 0)) / (d || 1);
        if (d < 8 && facing > 0.4 && this.canSee(b, qp, 10)) { b.seen[q] = (b.seen[q] || 0) + 0.4; b.ry = Math.atan2(qp.x - b.x, qp.z - b.z); }
        else b.seen[q] = Math.max(0, (b.seen[q] || 0) - 0.2);
        if (b.seen[q] > 2.6 + this.rng() * 3 && !(st.cd > t)) {
          b.seen[q] = 0;
          const val = this.rng() < 0.85 ? qq.num : 100 + Math.floor(this.rng() * 900);
          this.botAct(b, 'num', String(val)); b.a = 3; return;
        }
      }
    }
    // objetos
    if (!b.path.length && (p.inv || []).length < 2) { const it = G.it.find((i) => Math.hypot(i[2] - b.x, i[3] - b.z) < 7); if (it) b.path = this.findPath(b.x, b.z, b.y, it[2], it[3], it[4] || 0); }
    for (const it of G.it) if (Math.hypot(it[2] - b.x, it[3] - b.z) < 1.2 && (p.inv || []).length < 2) { this.botAct(b, 'pk', it[0]); break; }
    if ((p.inv || []).length && t > b.useAt) { b.useAt = t + 18 + this.rng() * 20; this.botAct(b, 'us', 0, b.x, b.z, b.y); }
    if (b.wait > 0) { b.wait -= dt; b.a = 0; return; }
    if (!b.path.length) {
      if (this.rng() < 0.2) { b.wait = 1 + this.rng() * 3; return; }
      // a veces ir hacia un jugador
      let tgt = -1;
      if (this.rng() < 0.45) { const others = Object.keys(G.pl).filter((q) => q !== bid && !G.pl[q].sp); const q = others[Math.floor(this.rng() * others.length)]; const qp = q && this.posOf(q, peers); if (qp) tgt = nearestNode(W.nav, qp.x, qp.z, qp.y || 0); }
      if (tgt < 0 && W.pois.length) { const poi = W.pois[Math.floor(this.rng() * W.pois.length)]; tgt = nearestNode(W.nav, poi.x, poi.z, poi.y); }
      b.path = tgt >= 0 ? navPath(W.nav, W.P, nearestNode(W.nav, b.x, b.z, b.y), tgt).map((q) => [q.x, q.z]) : [];
      if (!b.path.length) { b.wait = 2; return; }
    }
    const [tx, tz] = b.path[0]; const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
    const sp = st.tu > t ? 4.5 : 2.0;
    if (d < 0.3) { b.path.shift(); return; }
    b.x += (dx / d) * sp * dt; b.z += (dz / d) * sp * dt; b.y = W.P.groundAt(b.x, b.z, b.y + 0.05); b.ry = Math.atan2(dx, dz); b.a = sp > 3 ? 2 : 1; b.cy = b.ry;
  }
  findPath(x0, z0, y0, x1, z1, y1) { const W = this.ctx.W; const p = navPath(W.nav, W.P, nearestNode(W.nav, x0, z0, y0), nearestNode(W.nav, x1, z1, y1)).map((q) => [q.x, q.z]); p.push([x1, z1]); return p; }
  botPresence() { const out = {}; for (const bid in this.bots) { const b = this.bots[bid]; out[bid] = [r1(b.x), r1(b.z), Math.round(b.ry * 100) / 100, b.a, Math.round(b.y * 100) / 100]; } return out; }
}
