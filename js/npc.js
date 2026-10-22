// Multitud determinística: todos los celulares calculan lo mismo a partir de la semilla.
// Cada persona elige puntos de interés (puestos, mesas, escenario, entrepiso…) y camina por la red de caminos.
import { Character } from './character.js';
import { randomLook, L, COLORS, lookMatches } from './look.js';
import { mulberry32, lerpAng } from './util.js';
import { navPath, nearestNode } from './phys.js';

const A = { WALK: 0, BROWSE: 1, IDLE: 2, PHONE: 3, TALK: 4 };
const ANIM_NAME = ['walk', 'browse', 'idle', 'phone', 'talk'];

class Planner {
  constructor(W, rng, t0) {
    this.W = W; this.rng = rng;
    const ok = W.nav.nodes.map((n, i) => (n.ok ? i : -1)).filter((i) => i >= 0);
    this.ok = ok;
    this.cur = ok[Math.floor(rng() * ok.length)];
    const n = W.nav.nodes[this.cur];
    this.px = n.x; this.pz = n.z; this.py = n.y;
    this.t = t0 - rng() * 25;
    this.speed = 1.05 + rng() * 0.4;
    this.legs = [];
  }
  walkTo(x, z, y) {
    const d = Math.hypot(x - this.px, z - this.pz);
    if (d < 0.02) { this.px = x; this.pz = z; this.py = y; return; }
    const dt = d / this.speed;
    this.legs.push({ t0: this.t, t1: this.t + dt, x0: this.px, z0: this.pz, y0: this.py, x1: x, z1: z, y1: y, ry: Math.atan2(x - this.px, z - this.pz), a: A.WALK });
    this.t += dt; this.px = x; this.pz = z; this.py = y;
  }
  dwell(dur, a, ry) { this.legs.push({ t0: this.t, t1: this.t + dur, x0: this.px, z0: this.pz, y0: this.py, x1: this.px, z1: this.pz, y1: this.py, ry, a }); this.t += dur; }
  step() {
    const { W, rng } = this; const nav = W.nav; const P = W.P;
    const r = rng();
    let target = null, poi = null;
    if (r < 0.68 && W.pois.length) { poi = W.pois[Math.floor(rng() * W.pois.length)]; target = nearestNode(nav, poi.x, poi.z, poi.y); }
    else target = this.ok[Math.floor(rng() * this.ok.length)];
    const path = navPath(nav, P, this.cur, target);
    if (!path.length) { this.dwell(2, A.IDLE, rng() * 6); return; }
    for (let i = 1; i < path.length; i++) this.walkTo(path[i].x, path[i].z, path[i].y);
    this.cur = target;
    if (poi) {
      const y = P.walkable(this.px, this.pz, this.py, poi.x, poi.z);
      const node = nav.nodes[target];
      if (y !== null && Math.abs(y - poi.y) < 0.1) {
        this.walkTo(poi.x, poi.z, poi.y);
        const a = poi.kind === 'browse' ? (rng() < 0.85 ? A.BROWSE : A.TALK) : poi.kind === 'dance' ? A.TALK : (rng() < 0.5 ? A.PHONE : A.IDLE);
        this.dwell(3 + rng() * 7, a, poi.face);
        this.walkTo(node.x, node.z, node.y);
      } else this.dwell(2 + rng() * 3, A.IDLE, rng() * 6);
    } else if (rng() < 0.35) this.dwell(1 + rng() * 3, rng() < 0.5 ? A.PHONE : A.IDLE, rng() * 6);
  }
  ensure(t) { let guard = 0; while (this.t < t + 20 && guard++ < 40) this.step(); }
}

function sample(pl, t, out) {
  pl.ensure(t);
  const legs = pl.legs;
  if (!legs.length || t <= legs[0].t0) { out.x = pl.px; out.z = pl.pz; out.y = pl.py; out.ry = 0; out.a = A.IDLE; out.moving = false; return out; }
  let lo = 0, hi = legs.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (legs[mid].t0 <= t) lo = mid; else hi = mid - 1; }
  const l = legs[lo];
  const k = l.t1 > l.t0 ? Math.min(1, (t - l.t0) / (l.t1 - l.t0)) : 1;
  out.x = l.x0 + (l.x1 - l.x0) * k; out.z = l.z0 + (l.z1 - l.z0) * k; out.y = l.y0 + (l.y1 - l.y0) * k; out.ry = l.ry; out.a = l.a;
  out.moving = l.a === A.WALK && k < 1;
  // descartar tramos ya usados (más de 60 s atrás)
  if (lo > 40) { legs.splice(0, lo - 20); }
  return out;
}

export class Crowd {
  constructor(W, scene, seed, count, opts = {}) {
    this.W = W; this.scene = scene; this.seed = seed; this.count = count;
    this.npcs = [];
    this.shadow = !!opts.shadow;
    for (let i = 0; i < count; i++) {
      const rng = mulberry32(seed * 7919 + i * 104729 + 13);
      const look = randomLook(rng);
      const plan = new Planner(W, rng, -60);
      const ch = new Character(look, { shadow: this.shadow });
      scene.add(ch.root);
      this.npcs.push({ i, baseLook: look, look: look.slice(), lookKey: '', plan, ch, ry: 0, x: plan.px, z: plan.pz, y: plan.py, danceOff: rng() * 6, trendDelay: rng() * 5, visible: true });
    }
    this.flashes = [];
  }
  dispose() { for (const n of this.npcs) { this.scene.remove(n.ch.root); n.ch.dispose(); } this.npcs = []; }
  setShadow(v) { this.shadow = v; for (const n of this.npcs) n.ch.setShadow(v); }
  effTime(t) {
    let te = t;
    for (const [a, b] of this.flashes) { const s = a + 1, e = b - 1; if (t > s) te -= Math.min(t, e) - s; }
    return te;
  }
  dancing(t) { for (const [a, b] of this.flashes) if (t > a + 1 && t < b - 1) return true; return false; }
  posAt(i, t, out = {}) { return sample(this.npcs[i].plan, this.effTime(t), out); }
  computeLook(n, t, mods) {
    let look = n.baseLook.slice();
    if (mods.dye) for (const d of mods.dye) { if (d.applied && t >= d.t0 + 2 && d.applied.has(n.i)) { const v = d.applied.get(n.i); look[L.TOPC] = v[0]; look[L.BOTC] = v[1]; } }
    if (mods.swapped && mods.swapped.has(n.i)) look = mods.swapped.get(n.i).slice();
    if (mods.trend) { const [t0, t1, hat, hatC] = mods.trend; if (t > t0 + 0.6 + n.trendDelay && t < t1) { look[L.HAT] = hat; look[L.HATC] = hatC; } }
    return look;
  }
  update(t, dt, mods = {}) {
    const tmp = this._tmp || (this._tmp = {});
    const dancing = this.dancing(t);
    const P = this.W.P;
    const te = this.effTime(t);
    for (const n of this.npcs) {
      sample(n.plan, te, tmp);
      const gy = P.groundAt(tmp.x, tmp.z, tmp.y + 0.05);
      n.x = tmp.x; n.z = tmp.z; n.y = Math.abs(gy - tmp.y) < 0.6 ? gy : tmp.y;
      const ch = n.ch;
      ch.root.position.set(n.x, n.y, n.z);
      let anim = ANIM_NAME[tmp.a];
      if (tmp.a === A.WALK && !tmp.moving) anim = 'idle';
      let targetRy = tmp.ry;
      if (dancing) anim = 'dance';
      else if (mods.alto && mods.alto.active) { const p = mods.alto.pointAt(n); if (p) { anim = 'point'; targetRy = Math.atan2(p.x - n.x, p.z - n.z); } }
      n.ry = lerpAng(n.ry, targetRy, 1 - Math.exp(-dt * 8));
      ch.root.rotation.y = n.ry;
      const look = this.computeLook(n, t, mods);
      const key = look.join(',');
      if (key !== n.lookKey) { n.lookKey = key; n.look = look; ch.setLook(look); }
      const cam = mods.camPos;
      const far = cam ? (n.x - cam.x) ** 2 + (n.z - cam.z) ** 2 > (mods.cull || 60) ** 2 : false;
      ch.root.visible = n.visible && !far;
      if (ch.root.visible) ch.update(dt, anim, 1.3, t, { danceOffset: n.danceOff });
    }
  }
  applyDye(d) {
    if (d.applied) return;
    d.applied = new Map();
    const rng = mulberry32(d.seed);
    const tmp = {};
    for (const n of this.npcs) {
      const p = this.posAt(n.i, d.t0 + 2, tmp);
      const c1 = Math.floor(rng() * COLORS.length), c2 = Math.floor(rng() * COLORS.length);
      if (Math.hypot(p.x - d.x, p.z - d.z) < d.r) d.applied.set(n.i, [c1, c2]);
    }
  }
}
export { lookMatches };
