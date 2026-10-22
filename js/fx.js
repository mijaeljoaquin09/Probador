// Objetos visuales: bolsas de objetos, espejo, globo, chicle, ovillo, perrito, lluvia, huellas, indicadores
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { makeDog } from './character.js';
import { ITEMS } from './rules.js';
import { COLORS } from './look.js';
import { mulberry32 } from './util.js';
import { blobTexture } from './world.js';

const CAT_COLOR = { leer: 0x1fb5a8, proteger: 0x8a4fc7, caos: 0xff4f8b, buscar: 0x1fb5a8, esconder: 0x8a4fc7 };
const texCache = new Map();
export function emojiTexture(e, size = 128, ring) {
  const k = e + size + (ring || '');
  if (texCache.has(k)) return texCache.get(k);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  if (ring) { g.fillStyle = ring; g.beginPath(); g.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 6; g.stroke(); }
  g.font = `${size * 0.6}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, size / 2, size / 2 + size * 0.04);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(k, t); return t;
}
function sprite(tex, s = 0.6) { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false })); m.scale.set(s, s, s); return m; }

function bagMesh(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.48, 0.18), new THREE.MeshStandardMaterial({ color, roughness: 0.5, emissive: color, emissiveIntensity: 0.25 }));
  body.position.y = 0.24; body.castShadow = true; g.add(body);
  const h = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.018, 6, 16, Math.PI), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  h.position.y = 0.48; g.add(h);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.08, 0.185), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }));
  band.position.y = 0.32; g.add(band);
  return g;
}

export class FX {
  constructor(scene, renderer, opts) {
    this.scene = scene; this.renderer = renderer; this.opts = opts; // opts: { quality, crowd(), charsVisible(bool) }
    this.items = new Map(); this.objs = new Map(); this.dogs = new Map();
    this.rains = []; this.prints = []; this.confetti = [];
    this.root = new THREE.Group(); scene.add(this.root);
    this.flashLight = new THREE.PointLight(0xffffff, 0, 14, 1.6); this.root.add(this.flashLight); this.flashT = -99;
    // anillo de selección
    const ringGeo = new THREE.RingGeometry(0.42, 0.55, 40);
    this.selRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.95, depthWrite: false }));
    this.selRing.rotation.x = -Math.PI / 2; this.selRing.visible = false; this.selRing.renderOrder = 3; this.root.add(this.selRing);
    // flechas de expuesto
    this.arrows = new Map();
    // sombras blob
    const bt = blobTexture();
    this.blobs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: bt, transparent: true, depthWrite: false }), 160);
    this.blobs.count = 0; this.blobs.renderOrder = 1; this.blobs.frustumCulled = false; this.root.add(this.blobs);
    this.blobM = new THREE.Matrix4();
    // huellas
    this.printGeo = new THREE.CircleGeometry(0.09, 10).rotateX(-Math.PI / 2).scale(1, 1, 1.6);
    // hilo
    this.yarnLines = new Map();
  }
  // ---- sombras ----
  setBlobs(list) {
    let i = 0;
    for (const p of list) { if (i >= 160) break; this.blobM.makeScale(p.s || 0.95, 1, p.s || 0.95); this.blobM.setPosition(p.x, (p.y || 0) + 0.03, p.z); this.blobs.setMatrixAt(i++, this.blobM); }
    this.blobs.count = i; this.blobs.instanceMatrix.needsUpdate = true;
  }
  // ---- ítems en el piso ----
  syncItems(list, t) {
    const seen = new Set();
    for (const [id, k, x, z, y = 0] of list) {
      seen.add(id);
      let o = this.items.get(id);
      if (!o) {
        const it = ITEMS[k];
        const g = new THREE.Group();
        const bag = bagMesh(CAT_COLOR[it.c]); g.add(bag);
        const sp = sprite(emojiTexture(it.e, 128, '#' + CAT_COLOR[it.c].toString(16).padStart(6, '0')), 0.55); sp.position.y = 1.0; g.add(sp);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: CAT_COLOR[it.c], transparent: true, opacity: 0.7, depthWrite: false }));
        ring.position.y = 0.02; g.add(ring);
        g.position.set(x, y + 0.02, z);
        this.root.add(g);
        o = { g, bag, sp, ring, born: t };
        this.items.set(id, o);
      }
      const s = Math.min(1, (t - o.born) * 3 + 0.01);
      o.bag.rotation.y = t * 1.6; o.bag.position.y = 0.15 + Math.sin(t * 3 + id) * 0.08; o.bag.scale.setScalar(s);
      o.sp.position.y = 1.05 + Math.sin(t * 3 + id) * 0.08;
      o.ring.scale.setScalar(1 + Math.sin(t * 4) * 0.08);
    }
    for (const [id, o] of this.items) if (!seen.has(id)) { this.root.remove(o.g); this.items.delete(id); }
  }
  // ---- objetos colocados ----
  syncObjects(list, t, ctx) {
    const seen = new Set();
    for (const ob of list) {
      const [id, k, x, z, ry, until, own] = ob;
      seen.add(id);
      let o = this.objs.get(id);
      if (!o) { o = this.makeObj(k, x, z, k === 'chi' ? 0 : ry); if (k === 'chi') o.g.position.y = ry; o.k = k; this.objs.set(id, o); this.root.add(o.g); if (o.onAdd) o.onAdd(); }
      if (o.update) o.update(t, ob, ctx);
    }
    for (const [id, o] of this.objs) if (!seen.has(id)) { this.root.remove(o.g); if (o.dispose) o.dispose(); this.objs.delete(id); }
  }
  makeObj(k, x, z, ry) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
    if (k === 'esp') {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.25, 2.1, 0.08), new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.6, roughness: 0.3 }));
      frame.position.y = 1.15; frame.castShadow = true; g.add(frame);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.5), frame.material); foot.position.y = 0.03; g.add(foot);
      let surf;
      const hq = this.opts.quality() !== 'baja';
      if (hq) {
        surf = new Reflector(new THREE.PlaneGeometry(1.08, 1.92), { textureWidth: 384, textureHeight: 640, color: 0xd9e6f2 });
        const crowdFn = this.opts.crowd; const self = this;
        const orig = surf.onBeforeRender.bind(surf);
        surf.onBeforeRender = function (r, s, c) {
          const crowd = crowdFn(); const hidden = [];
          if (crowd) for (const n of crowd.npcs) if (n.ch.root.visible) { n.ch.root.visible = false; hidden.push(n.ch.root); }
          const mans = self.opts.mannequins ? self.opts.mannequins() : []; for (const m of mans) if (m.root.visible) { m.root.visible = false; hidden.push(m.root); }
          self.root.visible = false;
          orig(r, s, c);
          self.root.visible = true;
          for (const h of hidden) h.visible = true;
        };
      } else {
        surf = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 1.92), new THREE.MeshStandardMaterial({ color: 0xbcd7ee, metalness: 0.9, roughness: 0.08, emissive: 0x335577, emissiveIntensity: 0.3 }));
      }
      surf.position.set(0, 1.15, 0.045); g.add(surf);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 1.92), new THREE.MeshStandardMaterial({ color: 0x5a4632 })); back.position.set(0, 1.15, -0.045); back.rotation.y = Math.PI; g.add(back);
      const sp = sprite(emojiTexture('✨', 128), 0.5); sp.position.y = 2.45; g.add(sp);
      return { g, update: (t) => { sp.material.rotation = t; }, dispose: () => { if (surf.dispose) surf.dispose(); } };
    }
    if (k === 'glo') {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 16), new THREE.MeshStandardMaterial({ color: 0xff4f8b, roughness: 0.25, metalness: 0.05 }));
      ball.scale.set(1, 1.18, 1); ball.castShadow = true;
      const pivot = new THREE.Group(); pivot.position.y = 0.25; g.add(pivot);
      ball.position.y = 2.2; pivot.add(ball);
      const knot = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.1, 8), ball.material); knot.position.y = 1.82; knot.rotation.x = Math.PI; pivot.add(knot);
      const str = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1.8, 4), new THREE.MeshBasicMaterial({ color: 0xffffff })); str.position.y = 0.9; pivot.add(str);
      const weight = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.25, 0.22), new THREE.MeshStandardMaterial({ color: 0x24112f })); weight.position.y = 0.12; g.add(weight);
      const alarm = sprite(emojiTexture('❗', 128), 0.7); alarm.position.y = 3.2; alarm.visible = false; g.add(alarm);
      return {
        g, update: (t, ob, ctx) => {
          const own = ob[6];
          let near = null, nd = 5.2;
          for (const p of ctx.players) { if (p.pid === own || p.hidden) continue; const d = Math.hypot(p.x - ob[2], p.z - ob[3]); if (d < nd) { nd = d; near = p; } }
          if (near) {
            const a = Math.atan2(near.x - ob[2], near.z - ob[3]);
            g.rotation.y = a; pivot.rotation.x += (0.55 - pivot.rotation.x) * 0.15;
            ball.material.color.setHex(Math.sin(t * 16) > 0 ? 0xff2a2a : 0xffc93c); alarm.visible = true; alarm.position.y = 3.2 + Math.sin(t * 10) * 0.08;
            if (!this._gloSnd || t - this._gloSnd > 1.5) { this._gloSnd = t; ctx.sound && ctx.sound('pop'); }
          } else { pivot.rotation.x *= 0.9; pivot.rotation.z = Math.sin(t * 1.3) * 0.08; ball.material.color.setHex(0xff4f8b); alarm.visible = false; }
        },
      };
    }
    if (k === 'chi') {
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.32, 12).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xff7fb6, roughness: 0.4 }));
      m.position.y = 0.015;
      const p = m.geometry.attributes.position; for (let i = 1; i < p.count; i++) { const k2 = 0.7 + Math.random() * 0.5; p.setX(i, p.getX(i) * k2); p.setZ(i, p.getZ(i) * k2); }
      g.add(m);
      const blob = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), m.material); blob.scale.y = 0.4; blob.position.y = 0.03; g.add(blob);
      return { g };
    }
    if (k === 'ovi') {
      const tex = new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#e8384f'; x.fillRect(0, 0, 64, 64); x.strokeStyle = '#ff9aa8'; x.lineWidth = 3; for (let i = 0; i < 10; i++) { x.beginPath(); x.moveTo(0, i * 7); x.lineTo(64, i * 7 + 20); x.stroke(); } return c; })());
      tex.colorSpace = THREE.SRGBColorSpace;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
      ball.castShadow = true; ball.position.y = 0.2;
      const holder = new THREE.Group(); g.add(holder); holder.add(ball);
      g.rotation.y = 0;
      return {
        g, update: (t, ob) => {
          const el = Math.max(0, Math.min(4, t - ob[7])); const sp = 6.5 * (1 - el / 9);
          g.position.set(ob[2] + Math.sin(ob[4]) * sp * el, 0, ob[3] + Math.cos(ob[4]) * sp * el);
          ball.rotation.x += 0.3; holder.rotation.y = ob[4];
        },
      };
    }
    return { g };
  }
  // ---- perritos (los simula el dueño, todos los ven) ----
  syncDogs(list, t, dt) {
    const seen = new Set();
    for (const d of list) {
      seen.add(d.pid);
      let o = this.dogs.get(d.pid);
      if (!o) { const dog = makeDog(); dog.scale.setScalar(1.2); this.root.add(dog); const bub = sprite(emojiTexture('💬', 128), 0.8); bub.visible = false; dog.add(bub); bub.position.y = 1.1; o = { dog, bub, x: d.x, z: d.z, ry: d.ry }; this.dogs.set(d.pid, o); }
      const moving = Math.hypot(d.x - o.x, d.z - o.z) > 0.01;
      o.x += (d.x - o.x) * Math.min(1, dt * 10); o.z += (d.z - o.z) * Math.min(1, dt * 10);
      o.y = o.y === undefined ? (d.y || 0) : o.y + ((d.y || 0) - o.y) * Math.min(1, dt * 10);
      o.dog.position.set(o.x, o.y, o.z); o.dog.rotation.y = d.ry;
      o.dog.userData.animate(dt, moving);
      o.bub.visible = !!d.bark;
      if (d.bark) o.bub.material.map = emojiTexture('🐾', 128);
    }
    for (const [pid, o] of this.dogs) if (!seen.has(pid)) { this.root.remove(o.dog); this.dogs.delete(pid); }
  }
  // ---- lluvia de tintura ----
  addRain(d, t) {
    const [t0, x, z, r, seed] = d;
    if (this.rains.some((q) => q.t0 === t0 && q.x === x)) return;
    const n = this.opts.quality() === 'baja' ? 500 : 1400;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), vel = new Float32Array(n);
    const rng = mulberry32(seed);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * r;
      pos[i * 3] = x + Math.cos(a) * rr; pos[i * 3 + 1] = 6 + rng() * 10; pos[i * 3 + 2] = z + Math.sin(a) * rr;
      c.setHex(COLORS[Math.floor(rng() * COLORS.length)].hex); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      vel[i] = 7 + rng() * 5;
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, depthWrite: false }));
    this.root.add(pts);
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.25, r, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff4f8b, transparent: true, opacity: 0.8, depthWrite: false }));
    ring.position.set(x, 0.03, z); this.root.add(ring);
    const cloud = new THREE.Group();
    for (let i = 0; i < 9; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(1.4 + rng(), 12, 10), new THREE.MeshStandardMaterial({ color: COLORS[i % 12].hex, transparent: true, opacity: 0.85, roughness: 1 })); s.position.set((rng() - 0.5) * r * 1.4, 0, (rng() - 0.5) * r * 1.4); s.scale.y = 0.55; cloud.add(s); }
    cloud.position.set(x, 13, z); this.root.add(cloud);
    this.rains.push({ t0, x, pts, vel, ring, cloud, start: t });
  }
  // ---- huellas ----
  addPrint(x, z, ry, color, t, y = 0) {
    const m = new THREE.Mesh(this.printGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
    m.position.set(x, y + 0.03, z); m.rotation.y = ry; m.renderOrder = 2; this.root.add(m);
    this.prints.push({ m, t });
    if (this.prints.length > 220) { const p = this.prints.shift(); this.root.remove(p.m); p.m.material.dispose(); }
  }
  // ---- confeti ----
  burst(x, y, z, t) {
    const n = 120; const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), v = [];
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) { pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; c.setHex(COLORS[i % 10].hex); col.set([c.r, c.g, c.b], i * 3); v.push([(Math.random() - 0.5) * 6, 3 + Math.random() * 5, (Math.random() - 0.5) * 6]); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.14, vertexColors: true, transparent: true }));
    this.root.add(pts); this.confetti.push({ pts, v, t });
  }
  // ---- flash de cámara ----
  flashAt(x, y, z, t) {
    if (!this.flashLight) { this.flashLight = new THREE.PointLight(0xffffff, 0, 14, 1.6); this.root.add(this.flashLight); }
    this.flashLight.position.set(x, y, z); this.flashLight.intensity = 60; this.flashT = t;
  }
  // ---- flecha de expuesto ----
  setArrow(pid, on, x, y, z, t, color = 0xff2a6d) {
    let a = this.arrows.get(pid);
    if (!on) { if (a) a.g.visible = false; return; }
    if (!a) {
      const g = new THREE.Group();
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 4), new THREE.MeshBasicMaterial({ color })); cone.rotation.x = Math.PI; g.add(cone);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.68, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
      g.add(ring); this.root.add(g); a = { g, cone, ring }; this.arrows.set(pid, a);
    }
    a.g.visible = true;
    a.g.position.set(x, y - 2.0, z);
    a.cone.position.y = 2.5 + Math.abs(Math.sin(t * 5)) * 0.25; a.cone.rotation.y = t * 3;
    a.ring.position.y = 2.03; a.ring.scale.setScalar(1 + Math.sin(t * 8) * 0.1);
  }
  // ---- hilo colgando ----
  setYarn(pid, on, trail) {
    let l = this.yarnLines.get(pid);
    if (!on) { if (l) l.visible = false; return; }
    if (!l) { l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(trail.map((p) => new THREE.Vector3(p.x, p.y, p.z))), new THREE.LineBasicMaterial({ color: 0xe8384f, linewidth: 2 })); this.root.add(l); this.yarnLines.set(pid, l); l.frustumCulled = false; }
    l.visible = true;
    const pa = l.geometry.attributes.position;
    if (pa.count !== trail.length) { l.geometry.dispose(); l.geometry = new THREE.BufferGeometry().setFromPoints(trail.map((p) => new THREE.Vector3(p.x, p.y, p.z))); }
    else { trail.forEach((p, i) => pa.setXYZ(i, p.x, p.y, p.z)); pa.needsUpdate = true; }
  }
  update(t, dt) {
    if (this.flashLight && this.flashLight.intensity > 0) this.flashLight.intensity = Math.max(0, 60 - (t - this.flashT) * 240);
    for (let i = this.rains.length - 1; i >= 0; i--) {
      const r = this.rains[i]; const el = t - r.start;
      const pa = r.pts.geometry.attributes.position;
      for (let k = 0; k < r.vel.length; k++) { let y = pa.getY(k) - r.vel[k] * dt; if (y < 0) y = el < 2.4 ? 12 + Math.random() * 3 : -10; pa.setY(k, y); }
      pa.needsUpdate = true;
      r.cloud.position.y = 13 + Math.sin(el * 2) * 0.2; r.cloud.rotation.y += dt * 0.3;
      r.ring.material.opacity = Math.max(0, 0.8 - el * 0.12);
      if (el > 3.2) r.cloud.children.forEach((s) => { s.material.opacity = Math.max(0, 0.85 - (el - 3.2)); });
      if (el > 6) { this.root.remove(r.pts); this.root.remove(r.ring); this.root.remove(r.cloud); this.rains.splice(i, 1); }
    }
    for (let i = this.prints.length - 1; i >= 0; i--) { const p = this.prints[i]; const age = t - p.t; p.m.material.opacity = Math.max(0, 0.9 - age / 9); if (age > 9) { this.root.remove(p.m); p.m.material.dispose(); this.prints.splice(i, 1); } }
    for (let i = this.confetti.length - 1; i >= 0; i--) {
      const c = this.confetti[i]; const pa = c.pts.geometry.attributes.position;
      for (let k = 0; k < c.v.length; k++) { const v = c.v[k]; v[1] -= 9 * dt; pa.setXYZ(k, pa.getX(k) + v[0] * dt, Math.max(0.02, pa.getY(k) + v[1] * dt), pa.getZ(k) + v[2] * dt); if (pa.getY(k) <= 0.02) { v[0] *= 0.8; v[2] *= 0.8; } }
      pa.needsUpdate = true;
      if (t - c.t > 4) { this.root.remove(c.pts); this.confetti.splice(i, 1); }
    }
  }
  clearAll() {
    for (const [, o] of this.items) this.root.remove(o.g); this.items.clear();
    for (const [, o] of this.objs) { this.root.remove(o.g); if (o.dispose) o.dispose(); } this.objs.clear();
    for (const [, o] of this.dogs) this.root.remove(o.dog); this.dogs.clear();
    for (const r of this.rains) { this.root.remove(r.pts); this.root.remove(r.ring); this.root.remove(r.cloud); } this.rains = [];
    for (const p of this.prints) this.root.remove(p.m); this.prints = [];
    for (const [, a] of this.arrows) a.g.visible = false;
    for (const [, l] of this.yarnLines) l.visible = false;
    this.selRing.visible = false;
  }
}
