// Personajes procedurales con ropa intercambiable y animación por código
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS, TOPS, BOTS, HAIR_COLORS, SKINS, L } from './look.js';

let SHARED_MAT = null;
export function charMaterial() {
  if (SHARED_MAT) return SHARED_MAT;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.0 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float pat;\nvarying float vPat;\nvarying vec3 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPat = pat;\nvLocal = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vPat;\nvarying vec3 vLocal;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      if (vPat > 0.5) {
        vec3 base = diffuseColor.rgb;
        float lum = dot(base, vec3(0.299,0.587,0.114));
        vec3 alt = lum > 0.55 ? base * 0.45 : mix(base, vec3(1.0), 0.6);
        float m = 0.0;
        if (vPat < 1.5) { m = step(0.5, fract(vLocal.y * 13.0)); }
        else if (vPat < 2.5) { vec3 q = fract(vLocal * 11.0) - 0.5; m = 1.0 - step(0.2, length(q)); }
        else if (vPat < 3.5) { float a = step(0.5, fract(vLocal.x * 8.0)); float b = step(0.5, fract(vLocal.y * 8.0 + vLocal.z * 8.0)); m = abs(a - b) * 0.8; }
        else { alt = mix(base, vec3(1.0), 0.88); m = step(0.5, fract(vLocal.x * 1.6 + vLocal.z * 1.6)); }
        diffuseColor.rgb = mix(base, alt, m);
      }`);
  };
  SHARED_MAT = m;
  return m;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();

// Acumulador de piezas para fusionar en una sola geometría con colores
class PartBuilder {
  constructor() { this.list = []; }
  add(geo, color, pat = 0, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) {
    const g = geo.clone();
    if (g.attributes.uv) g.deleteAttribute('uv');
    if (g.attributes.uv1) g.deleteAttribute('uv1');
    if (!g.index) { // indexar
      const n = g.attributes.position.count;
      const idx = new Uint16Array(n); for (let i = 0; i < n; i++) idx[i] = i;
      g.setIndex(new THREE.BufferAttribute(idx, 1));
    }
    tmpE.set(rot[0], rot[1], rot[2]);
    tmpQ.setFromEuler(tmpE);
    tmpV.set(pos[0], pos[1], pos[2]);
    tmpS.set(scl[0], scl[1], scl[2]);
    tmpM.compose(tmpV, tmpQ, tmpS);
    g.applyMatrix4(tmpM);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const p = new Float32Array(n).fill(pat);
    g.setAttribute('pat', new THREE.BufferAttribute(p, 1));
    this.list.push(g);
    return this;
  }
  build() {
    if (!this.list.length) return null;
    const m = mergeGeometries(this.list, false);
    this.list.forEach((g) => g.dispose());
    this.list = [];
    m.computeBoundingSphere();
    return m;
  }
}

// geometrías base compartidas
const G = {};
function lathe(profile, seg = 18) { return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg); }
function geos() {
  if (G.ready) return G;
  G.sphere = new THREE.SphereGeometry(1, 16, 12);
  G.sphereLo = new THREE.SphereGeometry(1, 8, 6);
  G.cap = (r, l) => new THREE.CapsuleGeometry(r, l, 3, 10);
  G.cyl = new THREE.CylinderGeometry(1, 1, 1, 14);
  G.cone = (r0, r1) => new THREE.CylinderGeometry(r1, r0, 1, 14, 1, true);
  G.box = new THREE.BoxGeometry(1, 1, 1);
  G.rbox = new THREE.CapsuleGeometry(0.5, 0.5, 2, 8);
  G.hemi = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
  G.hairCap = new THREE.SphereGeometry(1, 16, 9, 0, Math.PI * 2, 0, Math.PI * 0.58);
  G.torus = new THREE.TorusGeometry(1, 0.28, 6, 16);
  G.ring = new THREE.TorusGeometry(1, 0.12, 5, 18);
  G.mouth = new THREE.TorusGeometry(0.045, 0.012, 4, 10, Math.PI);
  // cuerpo: tronco redondeado
  G.torsoLow = lathe([[0, -0.07], [0.175, -0.06], [0.198, 0.02], [0.204, 0.14], [0, 0.14]]);
  G.torsoUp = lathe([[0, 0.1], [0.205, 0.1], [0.212, 0.22], [0.214, 0.34], [0.2, 0.43], [0.16, 0.5], [0.09, 0.55], [0, 0.56]]);
  G.shell = lathe([[0.2, -0.13], [0.218, 0.02], [0.222, 0.2], [0.226, 0.34], [0.212, 0.43], [0.17, 0.5], [0.095, 0.55], [0.0, 0.56]]);
  // pollera con pliegues
  const sk = []; const n = 22;
  for (let i = 0; i <= 8; i++) { const t = i / 8; sk.push([0.2 + t * t * 0.17 + 0.03 * t, 0.12 - t * 0.44]); }
  sk.push([0.0, -0.32]);
  G.skirt = lathe(sk, 32);
  { const p = G.skirt.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), y = p.getY(i); const a = Math.atan2(z, x); const t = Math.max(0, (0.12 - y) / 0.44); const k = 1 + Math.sin(a * 12) * 0.05 * t; p.setX(i, x * k); p.setZ(i, z * k); } G.skirt.computeVertexNormals(); }
  G.ready = true;
  return G;
}

const MANNEQUIN_SKIN = 0xf3efe8;
function lighten(hex, k) { const c = new THREE.Color(hex); c.lerp(new THREE.Color(0xffffff), k); return c.getHex(); }
function darken(hex, k) { const c = new THREE.Color(hex); c.multiplyScalar(1 - k); return c.getHex(); }

// Construye las geometrías de cada parte según el look (prendas con forma propia)
function buildParts(look, opts = {}) {
  const g = geos();
  const mann = !!opts.mannequin;
  const skin = mann ? MANNEQUIN_SKIN : SKINS[look[L.SKIN]];
  const T = look[L.TOP], top = TOPS[T];
  const Bt = look[L.BOT], bot = BOTS[Bt];
  const topC = COLORS[look[L.TOPC]].hex, topP = look[L.TOPP];
  const botC = COLORS[look[L.BOTC]].hex, botP = look[L.BOTP] ? 3 : 0;
  const shoeC = COLORS[look[L.SHOE]].hex;
  const hairC = mann ? MANNEQUIN_SKIN : HAIR_COLORS[look[L.HAIRC]];
  const trim = darken(topC, 0.18), btrim = darken(botC, 0.22);
  const out = {};
  const acc = look[L.ACC], accC = COLORS[look[L.ACCC]].hex;

  // ---------- TORSO (origen en la cadera) ----------
  let b = new PartBuilder();
  // cintura/cadera = parte de abajo
  b.add(g.torsoLow, botC, botP, [0, 0, 0], [0, 0, 0], [1, 1, 0.8]);
  // pecho = piel (se cubre con la prenda)
  b.add(g.torsoUp, skin, 0, [0, 0, 0], [0, 0, 0], [0.97, 1, 0.78]);
  b.add(g.cyl, skin, 0, [0, 0.6, 0], [0, 0, 0], [0.07, 0.14, 0.066]);
  // prenda de arriba
  if (T === 1) { // musculosa
    b.add(g.shell, topC, topP, [0, 0, 0], [0, 0, 0], [0.98, 0.94, 0.8]);
    b.add(g.sphere, skin, 0, [0, 0.47, 0.095], [0.5, 0, 0], [0.11, 0.07, 0.06]);
    for (const sx of [-1, 1]) b.add(g.box, topC, 0, [0.1 * sx, 0.5, 0], [0, 0, 0.25 * sx], [0.05, 0.12, 0.3]);
  } else {
    const thick = T === 2 || T === 3 ? 1.07 : 1.02;
    b.add(g.shell, topC, topP, [0, 0, 0], [0, 0, 0], [thick, 1, 0.8 * thick]);
    if (T === 0) { b.add(g.ring, trim, 0, [0, 0.545, 0.0], [Math.PI / 2, 0, 0], [0.085, 0.07, 0.4]); b.add(g.ring, trim, 0, [0, -0.115, 0], [Math.PI / 2, 0, 0], [0.205, 0.165, 0.5]); }
    if (T === 2) { // buzo con capucha, bolsillo canguro y puños
      b.add(g.sphere, darken(topC, 0.1), topP, [0, 0.54, -0.13], [0.3, 0, 0], [0.17, 0.13, 0.11]);
      b.add(g.box, darken(topC, 0.12), 0, [0, 0.15, 0.17], [-0.08, 0, 0], [0.24, 0.14, 0.03]);
      b.add(g.cyl, 0xffffff, 0, [0.045, 0.43, 0.165], [0.1, 0, 0], [0.008, 0.14, 0.008]);
      b.add(g.cyl, 0xffffff, 0, [-0.045, 0.43, 0.165], [0.1, 0, 0], [0.008, 0.14, 0.008]);
      b.add(g.ring, darken(topC, 0.15), 1, [0, -0.11, 0], [Math.PI / 2, 0, 0], [0.225, 0.18, 0.7]);
    }
    if (T === 3) { // campera abierta con remera blanca adentro
      b.add(g.box, 0xf6f3ec, 0, [0, 0.24, 0.165], [-0.04, 0, 0], [0.11, 0.5, 0.03]);
      b.add(g.box, darken(topC, 0.25), 0, [0.06, 0.24, 0.175], [-0.04, 0, 0], [0.012, 0.5, 0.02]);
      b.add(g.box, darken(topC, 0.25), 0, [-0.06, 0.24, 0.175], [-0.04, 0, 0], [0.012, 0.5, 0.02]);
      for (const sx of [-1, 1]) b.add(g.box, darken(topC, 0.12), 0, [0.075 * sx, 0.47, 0.13], [0.5, 0, -0.45 * sx], [0.09, 0.15, 0.03]);
      b.add(g.ring, darken(topC, 0.15), 0, [0, -0.12, 0], [Math.PI / 2, 0, 0], [0.23, 0.185, 0.6]);
      b.add(g.box, darken(topC, 0.2), 0, [0.13, 0.12, 0.14], [0, 0.6, 0], [0.08, 0.06, 0.02]);
      b.add(g.box, darken(topC, 0.2), 0, [-0.13, 0.12, 0.14], [0, -0.6, 0], [0.08, 0.06, 0.02]);
    }
    if (T === 4) { // camisa con cuello, botones y bolsillo
      for (const sx of [-1, 1]) b.add(g.box, lighten(topC, 0.25), 0, [0.055 * sx, 0.55, 0.075], [0.6, 0, -0.55 * sx], [0.09, 0.025, 0.08]);
      b.add(g.box, lighten(topC, 0.12), 0, [0, 0.26, 0.17], [-0.05, 0, 0], [0.035, 0.52, 0.012]);
      for (let i = 0; i < 4; i++) b.add(g.sphereLo, 0xffffff, 0, [0, 0.47 - i * 0.12, 0.178], [0, 0, 0], [0.012, 0.012, 0.007]);
      b.add(g.box, darken(topC, 0.1), topP, [0.1, 0.36, 0.168], [0, 0.3, 0], [0.07, 0.08, 0.012]);
    }
  }
  if (bot.skirt) b.add(g.skirt, botC, botP, [0, 0, 0], [0, 0, 0], [1, 1, 0.84]);
  else { // cinturón
    b.add(g.ring, Bt === 3 ? darken(botC, 0.15) : 0x3b2a1e, 0, [0, 0.07, 0], [Math.PI / 2, 0, 0], [0.205, 0.165, 0.45]);
    if (Bt !== 3) b.add(g.box, 0xd9b44a, 0, [0, 0.07, 0.17], [0, 0, 0], [0.05, 0.035, 0.015]);
    else { b.add(g.cyl, 0xffffff, 0, [0.03, 0.02, 0.165], [0, 0, 0], [0.006, 0.1, 0.006]); b.add(g.cyl, 0xffffff, 0, [-0.03, 0.02, 0.165], [0, 0, 0], [0.006, 0.1, 0.006]); }
  }
  // accesorios de torso
  if (acc === 2) { b.add(g.torus, accC, 1, [0, 0.58, 0.0], [Math.PI / 2, 0, 0], [0.12, 0.12, 0.22]); b.add(g.box, accC, 1, [0.07, 0.42, 0.16], [0.15, 0, 0.12], [0.075, 0.26, 0.035]); b.add(g.box, darken(accC, 0.2), 0, [0.075, 0.28, 0.165], [0.15, 0, 0.12], [0.075, 0.03, 0.036]); }
  else if (acc === 3) {
    b.add(g.cap(0.15, 0.14), accC, 0, [0, 0.3, -0.24], [0, 0, 0], [1.05, 1, 0.62]);
    b.add(g.box, darken(accC, 0.2), 0, [0, 0.22, -0.33], [0, 0, 0], [0.2, 0.12, 0.05]);
    b.add(g.box, 0xffffff, 0, [0, 0.43, -0.34], [0, 0, 0], [0.14, 0.012, 0.012]);
    for (const sx of [-1, 1]) b.add(g.box, darken(accC, 0.35), 0, [0.11 * sx, 0.36, 0.02], [0, 0, 0], [0.035, 0.3, 0.36]);
  } else if (acc === 4) {
    b.add(g.rbox, accC, 0, [0.25, 0.0, 0.05], [0, 0, Math.PI / 2], [0.16, 0.12, 0.22]);
    b.add(g.box, darken(accC, 0.3), 0, [0.25, 0.03, 0.13], [0, 0, 0], [0.12, 0.03, 0.01]);
    b.add(g.box, darken(accC, 0.25), 0, [0.02, 0.28, 0.0], [0, 0, -0.62], [0.022, 0.72, 0.36]);
  }
  if (acc === 5) { // cadena dorada
    b.add(g.ring, 0xffc93c, 0, [0, 0.5, 0.05], [Math.PI / 2 - 0.5, 0, 0], [0.13, 0.13, 0.5]);
    b.add(g.sphereLo, 0xffc93c, 0, [0, 0.4, 0.17], [0, 0, 0], [0.03, 0.035, 0.012]);
  } else if (acc === 6) { // alitas
    for (const sx of [-1, 1]) { b.add(g.sphere, accC, 0, [0.16 * sx, 0.42, -0.26], [0.2, 0.4 * sx, 0.7 * sx], [0.17, 0.08, 0.02]); b.add(g.sphere, lighten(accC, 0.3), 0, [0.21 * sx, 0.33, -0.25], [0.2, 0.4 * sx, 0.9 * sx], [0.12, 0.06, 0.021]); }
  } else if (acc === 7) { // riñonera
    b.add(g.rbox, accC, 0, [0.0, 0.05, 0.2], [0, 0, Math.PI / 2], [0.12, 0.2, 0.09]);
    b.add(g.box, darken(accC, 0.3), 0, [0, 0.07, 0.25], [0, 0, 0], [0.16, 0.012, 0.01]);
  }
  out.torso = b.build();

  // ---------- CABEZA (origen en la base del cuello) ----------
  b = new PartBuilder();
  const HY = 0.22;
  b.add(g.sphere, skin, 0, [0, HY, 0], [0, 0, 0], [0.235, 0.228, 0.215]);
  b.add(g.sphereLo, skin, 0, [0.228, HY - 0.01, 0], [0, 0, 0], [0.04, 0.06, 0.03]);
  b.add(g.sphereLo, skin, 0, [-0.228, HY - 0.01, 0], [0, 0, 0], [0.04, 0.06, 0.03]);
  if (!mann) {
    for (const sx of [-1, 1]) {
      b.add(g.sphereLo, 0xffffff, 0, [0.082 * sx, HY + 0.01, 0.188], [0, 0, 0], [0.048, 0.058, 0.025]);
      b.add(g.sphereLo, 0x2a1d24, 0, [0.08 * sx, HY + 0.0, 0.205], [0, 0, 0], [0.03, 0.04, 0.016]);
      b.add(g.sphereLo, 0xffffff, 0, [0.07 * sx + 0.012, HY + 0.018, 0.218], [0, 0, 0], [0.01, 0.012, 0.005]);
      b.add(g.box, darken(hairC, 0.15), 0, [0.085 * sx, HY + 0.085, 0.192], [0.25, 0, -0.14 * sx], [0.075, 0.016, 0.014]);
      b.add(g.sphereLo, 0xf08d97, 0, [0.14 * sx, HY - 0.05, 0.168], [0, 0.6 * sx, 0], [0.036, 0.022, 0.008]);
    }
    b.add(g.sphereLo, darken(skin, 0.1), 0, [0, HY - 0.035, 0.215], [0, 0, 0], [0.025, 0.022, 0.02]);
    b.add(g.mouth, 0x8e2f3a, 0, [0, HY - 0.09, 0.196], [Math.PI, 0, 0], [1, 1, 1]);
  }
  const hair = look[L.HAIR], hat = look[L.HAT];
  if (!mann && hair !== 5) {
    const cs = hair === 4 ? 0.252 : 0.24;
    b.add(g.hairCap, hairC, 0, [0, HY + 0.01, -0.012], [-0.22, 0, 0], [cs, cs * 1.02, cs]);
    if (hat === 0 || hat === 4) b.add(g.sphere, hairC, 0, [0.04, HY + 0.15, 0.15], [0.3, 0, -0.3], [0.14, 0.05, 0.07]);
    if (hair === 1) b.add(g.cap(0.14, 0.22), hairC, 0, [0, HY - 0.08, -0.13], [0.15, 0, 0], [1.5, 1, 0.55]);
    if (hair === 2) { b.add(g.sphereLo, hairC, 0, [0, HY + 0.13, -0.23], [0, 0, 0], [0.065, 0.065, 0.065]); b.add(g.cap(0.055, 0.2), hairC, 0, [0, HY - 0.03, -0.27], [0.25, 0, 0], [1, 1, 1]); }
    if (hair === 3 && hat === 0) b.add(g.sphere, hairC, 0, [0, HY + 0.24, -0.06], [0, 0, 0], [0.1, 0.09, 0.1]);
    if (hair === 4) for (let i = 0; i < 12; i++) { const a = -0.3 + (i / 11) * (Math.PI + 0.6); b.add(g.sphereLo, hairC, 0, [Math.cos(a) * 0.22, HY + 0.03 + (i % 2) * 0.09, -Math.sin(a) * 0.205 - 0.03], [0, 0, 0], [0.085, 0.085, 0.085]); }
  }
  const hatC = COLORS[look[L.HATC]].hex;
  if (hat === 1) { b.add(g.hemi, hatC, 0, [0, HY + 0.04, -0.005], [-0.1, 0, 0], [0.248, 0.23, 0.248]); b.add(g.cyl, darken(hatC, 0.1), 0, [0, HY + 0.065, 0.22], [0.2, 0, 0], [0.17, 0.02, 0.15]); b.add(g.sphereLo, darken(hatC, 0.25), 0, [0, HY + 0.27, -0.02], [0, 0, 0], [0.028, 0.022, 0.028]); }
  else if (hat === 2) { b.add(g.cyl, hatC, 0, [0, HY + 0.13, 0], [-0.08, 0, 0], [0.42, 0.022, 0.4]); b.add(g.cyl, hatC, 0, [0, HY + 0.23, -0.005], [-0.08, 0, 0], [0.205, 0.19, 0.195]); b.add(g.cyl, darken(hatC, 0.45), 0, [0, HY + 0.16, -0.002], [-0.08, 0, 0], [0.21, 0.045, 0.2]); }
  else if (hat === 3) { b.add(g.hemi, hatC, 1, [0, HY + 0.03, -0.01], [-0.12, 0, 0], [0.252, 0.3, 0.252]); b.add(g.cyl, darken(hatC, 0.15), 1, [0, HY + 0.05, -0.01], [-0.12, 0, 0], [0.256, 0.07, 0.256]); b.add(g.sphere, lighten(hatC, 0.45), 0, [0, HY + 0.34, -0.05], [0, 0, 0], [0.07, 0.07, 0.07]); }
  else if (hat === 4) { b.add(g.sphere, hatC, 0, [0.035, HY + 0.17, -0.01], [0.05, 0, -0.25], [0.27, 0.085, 0.255]); b.add(g.sphereLo, darken(hatC, 0.3), 0, [0.07, HY + 0.25, 0], [0, 0, 0], [0.016, 0.022, 0.016]); }
  if (hat === 5) { // corona
    const gold = 0xffc93c;
    b.add(g.cyl, gold, 0, [0, HY + 0.2, -0.01], [-0.1, 0, 0], [0.2, 0.08, 0.19]);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; b.add(g.sphereLo, gold, 0, [Math.sin(a) * 0.19, HY + 0.28, Math.cos(a) * 0.18 - 0.01], [0, 0, 0], [0.035, 0.07, 0.035]); b.add(g.sphereLo, [0xe8384f, 0x2f8fd0, 0x3fa34d][i % 3], 0, [Math.sin(a) * 0.2, HY + 0.2, Math.cos(a) * 0.19 - 0.01], [0, 0, 0], [0.022, 0.022, 0.012]); }
  } else if (hat === 6) { // orejas de gato
    for (const sx of [-1, 1]) { b.add(g.cone(0.09, 0.0), hatC, 0, [0.13 * sx, HY + 0.27, -0.02], [0.1, 0, -0.35 * sx], [1, 0.16, 0.6]); b.add(g.cone(0.055, 0.0), 0xf5a3b7, 0, [0.13 * sx, HY + 0.26, 0.0], [0.1, 0, -0.35 * sx], [1, 0.11, 0.4]); }
    b.add(g.ring, hatC, 0, [0, HY + 0.12, -0.01], [0.25, 0, 0], [0.24, 0.24, 0.35]);
  } else if (hat === 7) { // vincha con moño
    b.add(g.ring, hatC, 0, [0, HY + 0.12, -0.02], [0.35, 0, 0], [0.245, 0.245, 0.5]);
    for (const sx of [-1, 1]) b.add(g.sphere, hatC, 1, [0.15 + sx * 0.06, HY + 0.22, 0.1], [0, 0, 0.4 * sx], [0.065, 0.045, 0.03]);
    b.add(g.sphereLo, darken(hatC, 0.2), 0, [0.15, HY + 0.22, 0.11], [0, 0, 0], [0.025, 0.025, 0.025]);
  } else if (hat === 8) { // auriculares
    b.add(g.torus, hatC, 0, [0, HY + 0.02, -0.01], [0, Math.PI / 2, 0], [0.245, 0.245, 0.06]);
    for (const sx of [-1, 1]) { b.add(g.cyl, hatC, 0, [0.245 * sx, HY - 0.0, 0], [0, 0, Math.PI / 2], [0.075, 0.05, 0.075]); b.add(g.cyl, 0x222226, 0, [0.27 * sx, HY - 0.0, 0], [0, 0, Math.PI / 2], [0.06, 0.02, 0.06]); }
  }
  if (acc === 1 && !mann) {
    for (const sx of [-1, 1]) b.add(g.cyl, 0x111216, 0, [0.082 * sx, HY + 0.01, 0.214], [Math.PI / 2, 0, 0], [0.06, 0.014, 0.05]);
    b.add(g.box, 0x111216, 0, [0, HY + 0.02, 0.218], [0, 0, 0], [0.05, 0.014, 0.01]);
    for (const sx of [-1, 1]) b.add(g.box, 0x111216, 0, [0.17 * sx, HY + 0.02, 0.11], [0, 0.3 * sx, 0], [0.01, 0.014, 0.19]);
  }
  out.head = b.build();

  // ---------- BRAZOS ----------
  const sleeve = top.sleeve;
  for (const side of ['L', 'R']) {
    b = new PartBuilder();
    b.add(g.cap(0.064, 0.17), sleeve === 2 ? topC : skin, sleeve === 2 ? topP : 0, [0, -0.12, 0]);
    if (sleeve === 1) { b.add(g.cone(0.08, 0.092), topC, topP, [0, -0.08, 0], [0, 0, 0], [1, 0.16, 1]); b.add(g.ring, trim, 0, [0, -0.16, 0], [Math.PI / 2, 0, 0], [0.09, 0.09, 0.4]); b.add(g.sphere, topC, topP, [0, 0, 0], [0, 0, 0], [0.076, 0.062, 0.076]); }
    if (sleeve === 2) b.add(g.sphere, topC, topP, [0, 0, 0], [0, 0, 0], [0.074, 0.06, 0.074]);
    out['ua' + side] = b.build();
    b = new PartBuilder();
    b.add(g.cap(0.058, 0.15), sleeve === 2 ? topC : skin, sleeve === 2 ? topP : 0, [0, -0.1, 0]);
    if (sleeve === 2) b.add(g.cyl, T === 2 ? darken(topC, 0.15) : trim, T === 2 ? 1 : 0, [0, -0.2, 0], [0, 0, 0], [0.066, 0.05, 0.066]);
    b.add(g.sphere, skin, 0, [0, -0.27, 0.01], [0, 0, 0], [0.068, 0.075, 0.058]);
    b.add(g.cap(0.022, 0.04), skin, 0, [side === 'L' ? -0.045 : 0.045, -0.25, 0.04], [0.3, 0, 0], [1, 1, 1]);
    out['la' + side] = b.build();
  }
  // ---------- PIERNAS ----------
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1;
    b = new PartBuilder();
    if (bot.skirt) b.add(g.cap(0.082, 0.2), skin, 0, [0, -0.18, 0]);
    else if (Bt === 1) { b.add(g.cone(0.112, 0.1), botC, botP, [0, -0.13, 0], [0, 0, 0], [1, 0.27, 1]); b.add(g.cap(0.082, 0.2), skin, 0, [0, -0.18, 0]); b.add(g.ring, btrim, 0, [0, -0.26, 0], [Math.PI / 2, 0, 0], [0.108, 0.108, 0.3]); }
    else { b.add(g.cone(0.104, 0.094), botC, botP, [0, -0.17, 0], [0, 0, 0], [1, 0.36, 1]); b.add(g.sphere, botC, botP, [0, 0, 0], [0, 0, 0], [0.104, 0.06, 0.104]); }
    if (Bt === 3) b.add(g.box, 0xffffff, 0, [0.1 * sx, -0.17, 0], [0, 0, 0], [0.012, 0.34, 0.03]);
    if (Bt === 0) b.add(g.box, lighten(botC, 0.3), 0, [0.095 * sx, -0.17, 0], [0, 0, 0], [0.006, 0.34, 0.01]);
    out['ul' + side] = b.build();
    b = new PartBuilder();
    if (bot.len === 2) {
      b.add(g.cone(0.094, Bt === 3 ? 0.092 : 0.098), botC, botP, [0, -0.16, 0], [0, 0, 0], [1, 0.32, 1]);
      if (Bt === 3) { b.add(g.ring, btrim, 1, [0, -0.32, 0], [Math.PI / 2, 0, 0], [0.085, 0.085, 0.6]); b.add(g.box, 0xffffff, 0, [0.095 * sx, -0.15, 0], [0, 0, 0], [0.012, 0.3, 0.03]); }
      else { b.add(g.ring, btrim, 0, [0, -0.315, 0], [Math.PI / 2, 0, 0], [0.098, 0.098, 0.35]); b.add(g.box, lighten(botC, 0.3), 0, [0.093 * sx, -0.16, 0], [0, 0, 0], [0.006, 0.3, 0.01]); }
    } else b.add(g.cap(0.072, 0.2), skin, 0, [0, -0.17, 0]);
    // zapatilla
    b.add(g.rbox, shoeC, 0, [0, -0.375, 0.045], [Math.PI / 2, 0, 0], [0.135, 0.19, 0.1]);
    b.add(g.rbox, 0xf7f5ef, 0, [0, -0.415, 0.045], [Math.PI / 2, 0, 0], [0.145, 0.2, 0.04]);
    b.add(g.sphere, 0xf7f5ef, 0, [0, -0.39, 0.15], [0, 0, 0], [0.062, 0.04, 0.05]);
    for (let i = 0; i < 3; i++) b.add(g.box, 0xffffff, 0, [0, -0.33 + i * 0.0, 0.05 + i * 0.03], [0.6, 0, 0], [0.07, 0.01, 0.012]);
    b.add(g.box, darken(shoeC, 0.25), 0, [0, -0.33, -0.05], [0, 0, 0], [0.05, 0.06, 0.02]);
    out['ll' + side] = b.build();
  }
  return out;
}

const TAG_GEO = new THREE.PlaneGeometry(0.3, 0.15);
const TAG_BACK = new THREE.MeshStandardMaterial({ color: 0xe9e2d4, roughness: 0.8 });
const TAG_BAND = new THREE.TorusGeometry(0.237, 0.008, 4, 28);
TAG_BAND.rotateX(Math.PI / 2);

// Esqueleto: cada parte va rígida a un hueso -> 1 sola malla por personaje
const JOINTS = ['hips', 'torso', 'head', 'shL', 'shR', 'elL', 'elR', 'hipL', 'hipR', 'knL', 'knR'];
const PARENT = { hips: null, torso: 'hips', head: 'torso', shL: 'torso', shR: 'torso', elL: 'shL', elR: 'shR', hipL: 'hips', hipR: 'hips', knL: 'hipL', knR: 'hipR' };
const LOCALPOS = { hips: [0, 0.78, 0], torso: [0, 0, 0], head: [0, 0.58, 0], shL: [0.235, 0.47, 0], shR: [-0.235, 0.47, 0], elL: [0, -0.25, 0], elR: [0, -0.25, 0], hipL: [0.1, 0, 0], hipR: [-0.1, 0, 0], knL: [0, -0.36, 0], knR: [0, -0.36, 0] };
const PART_BONE = { torso: 'torso', head: 'head', uaL: 'shL', uaR: 'shR', laL: 'elL', laR: 'elR', ulL: 'hipL', ulR: 'hipR', llL: 'knL', llR: 'knR' };
const BIND = {};
for (const j of JOINTS) { const p = LOCALPOS[j]; const par = PARENT[j] ? BIND[PARENT[j]] : [0, 0, 0]; BIND[j] = [par[0] + p[0], par[1] + p[1], par[2] + p[2]]; }

function assemble(parts) {
  const list = [];
  for (const k in PART_BONE) {
    const g = parts[k]; if (!g) continue;
    const bi = JOINTS.indexOf(PART_BONE[k]);
    const bp = BIND[PART_BONE[k]];
    g.translate(bp[0], bp[1], bp[2]);
    const n = g.attributes.position.count;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    if (g.index.array instanceof Uint16Array) g.setIndex(new THREE.BufferAttribute(new Uint32Array(g.index.array), 1));
    list.push(g);
  }
  const m = mergeGeometries(list, false);
  list.forEach((g) => g.dispose());
  m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.4);
  return m;
}

export class Character {
  constructor(look, opts = {}) {
    this.opts = opts;
    this.root = new THREE.Group();
    const mat = opts.material || charMaterial();
    this.mat = mat;
    const J = (this.j = {});
    const bones = [];
    for (const n of JOINTS) {
      const b = new THREE.Bone(); b.name = n; b.position.set(...LOCALPOS[n]);
      J[n] = b; bones.push(b);
      if (PARENT[n]) J[PARENT[n]].add(b);
    }
    this.skeleton = new THREE.Skeleton(bones);
    this.mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), mat);
    this.mesh.add(J.hips);
    this.mesh.castShadow = !!opts.shadow;
    this.mesh.frustumCulled = true;
    this.root.add(this.mesh);
    this.rot = {};
    for (const k of JOINTS) this.rot[k] = [0, 0, 0];
    this.phase = Math.random() * 10;
    this.idleSeed = Math.random() * 100;
    this.anim = 'idle';
    this.trembling = 0;
    this.mannequin = !!opts.mannequin;
    this._bound = false;
    this.setLook(look);
  }
  setLook(look, mannequin = this.mannequin) {
    this.look = look.slice();
    this.mannequin = mannequin;
    const geo = assemble(buildParts(look, { mannequin }));
    const old = this.mesh.geometry;
    this.mesh.geometry = geo;
    if (old) old.dispose();
    if (!this._bound) {
      // bind en pose de reposo
      for (const n of JOINTS) this.j[n].rotation.set(0, 0, 0);
      this.mesh.updateMatrixWorld(true);
      this.mesh.bind(this.skeleton);
      this._bound = true;
    }
  }
  setShadow(v) { this.mesh.castShadow = v; }
  // cartel con número en la frente (se mueve con la cabeza)
  setTag(material) {
    if (!this.tag) {
      const g = new THREE.Group(); g.position.set(0, 0.315, 0.205); g.rotation.x = -0.18;
      const card = new THREE.Mesh(TAG_GEO, material); card.renderOrder = 2; g.add(card);
      const back = new THREE.Mesh(TAG_GEO, TAG_BACK); back.rotation.y = Math.PI; back.position.z = -0.003; g.add(back);
      const band = new THREE.Mesh(TAG_BAND, TAG_BACK); band.position.set(0, -0.005, -0.205); band.rotation.x = 0.18; g.add(band);
      this.j.head.add(g); this.tag = g; this.tagCard = card;
    }
    if (this.tagCard.material !== material) this.tagCard.material = material;
    this.tag.visible = true;
  }
  hideTag() { if (this.tag) this.tag.visible = false; }
  // anim: idle | walk | run | browse | dance | point | mannequin | tag | talk | wave
  update(dt, anim, speed = 0, time = 0, extra = {}) {
    this.anim = anim;
    const T = this._T || (this._T = {});
    for (const k of JOINTS) { if (!T[k]) T[k] = [0, 0, 0]; T[k][0] = 0; T[k][1] = 0; T[k][2] = 0; }
    let bob = 0, hipsY = 0;
    const s = this.idleSeed;
    if (anim === 'walk' || anim === 'run') {
      const run = anim === 'run';
      this.phase += dt * (run ? 11 : 7.2) * Math.max(0.6, Math.min(1.4, speed / (run ? 5 : 2.2)));
      const p = this.phase;
      const A = run ? 0.9 : 0.55;
      T.hipL[0] = Math.sin(p) * A; T.hipR[0] = -Math.sin(p) * A;
      T.knL[0] = Math.max(0, -Math.cos(p)) * (run ? 1.3 : 0.75);
      T.knR[0] = Math.max(0, Math.cos(p)) * (run ? 1.3 : 0.75);
      T.shL[0] = -Math.sin(p) * (run ? 0.9 : 0.5); T.shR[0] = Math.sin(p) * (run ? 0.9 : 0.5);
      T.shL[2] = 0.08; T.shR[2] = -0.08;
      T.elL[0] = run ? -1.2 : -0.35; T.elR[0] = run ? -1.2 : -0.35;
      T.torso[0] = run ? 0.2 : 0.04; T.torso[1] = Math.sin(p) * 0.08;
      T.head[0] = run ? -0.12 : 0;
      bob = Math.abs(Math.cos(p)) * (run ? 0.07 : 0.035);
      hipsY = -0.015;
    } else if (anim === 'dance') {
      const p = time * 8.4 + (extra.danceOffset || 0);
      T.shL[2] = 2.4 + Math.sin(p) * 0.4; T.shR[2] = -2.4 - Math.sin(p) * 0.4;
      T.elL[0] = -0.6; T.elR[0] = -0.6;
      T.hips[1] = Math.sin(p / 2) * 0.35; T.torso[2] = Math.sin(p / 2) * 0.15;
      T.hipL[2] = 0.15; T.hipR[2] = -0.15;
      T.knL[0] = Math.max(0, Math.sin(p)) * 0.5; T.knR[0] = Math.max(0, -Math.sin(p)) * 0.5;
      T.head[2] = Math.sin(p / 2) * 0.2;
      bob = Math.abs(Math.sin(p)) * 0.08;
    } else if (anim === 'jump') {
      T.hipL[0] = -0.7; T.knL[0] = 1.0; T.hipR[0] = 0.25; T.knR[0] = 0.5;
      T.shL[2] = 0.9; T.shR[2] = -0.9; T.shL[0] = -0.4; T.shR[0] = -0.4; T.elL[0] = -0.4; T.elR[0] = -0.4; T.torso[0] = 0.08;
    } else if (anim === 'stumble') {
      const p = time * 10;
      T.torso[0] = 0.5; T.torso[2] = Math.sin(p) * 0.3; T.shL[2] = 1.4; T.shR[2] = -1.4; T.head[0] = 0.3;
      T.hipL[0] = -0.4; T.knL[0] = 0.6;
    } else if (anim === 'point') {
      T.shR[0] = -1.5; T.shR[2] = -0.1; T.elR[0] = -0.05;
      T.shL[0] = 0.1; T.shL[2] = 0.15; T.elL[0] = -0.3;
      T.torso[1] = -0.15; T.head[0] = -0.05;
    } else if (anim === 'browse') {
      const p = time * 1.3 + s;
      T.shR[0] = -0.9 + Math.sin(p) * 0.15; T.elR[0] = -0.5; T.shR[2] = 0.2;
      T.shL[0] = -0.2; T.elL[0] = -0.9;
      T.head[0] = 0.25 + Math.sin(p * 0.7) * 0.08; T.head[1] = Math.sin(p * 0.5) * 0.25;
      T.torso[0] = 0.12;
    } else if (anim === 'mannequin') {
      T.shL[2] = 0.55; T.elL[0] = -1.4; T.elL[1] = 0.5;
      T.shR[2] = -0.25; T.shR[0] = -0.2;
      T.hipL[2] = 0.1; T.hipR[0] = 0.05; T.head[1] = 0.25; T.head[2] = 0.08;
    } else if (anim === 'tag') {
      T.shR[0] = -1.45; T.elR[0] = -0.15; T.torso[0] = 0.22; T.torso[1] = -0.3;
      T.shL[0] = 0.4; T.hipL[0] = -0.3; T.knR[0] = 0.3;
    } else if (anim === 'talk') {
      const p = time * 3 + s;
      T.shL[0] = -0.4 + Math.sin(p) * 0.25; T.elL[0] = -1.1 + Math.sin(p * 1.3) * 0.3;
      T.shR[0] = -0.2 + Math.sin(p * 0.8 + 1) * 0.2; T.elR[0] = -0.8;
      T.head[1] = Math.sin(p * 0.4) * 0.3; T.head[0] = Math.sin(p * 0.9) * 0.08;
    } else if (anim === 'phone') {
      T.shR[0] = -0.5; T.elR[0] = -1.9; T.shR[2] = 0.35; T.head[0] = 0.35; T.shL[2] = 0.1; T.elL[0] = -0.2;
    } else if (anim === 'wave') {
      const p = time * 9;
      T.shR[2] = -2.6; T.elR[2] = Math.sin(p) * 0.5 - 0.3;
      T.shL[2] = 0.1; T.head[2] = 0.1;
    } else if (anim === 'cheer') {
      const p = time * 7;
      T.shL[2] = 2.7 + Math.sin(p) * 0.2; T.shR[2] = -2.7 - Math.sin(p) * 0.2; T.elL[0] = -0.3; T.elR[0] = -0.3;
      T.knL[0] = T.knR[0] = Math.max(0, Math.sin(p)) * 0.5; T.hipL[0] = T.hipR[0] = -Math.max(0, Math.sin(p)) * 0.25;
      T.head[0] = -0.2; bob = Math.max(0, Math.sin(p)) * 0.16;
    } else if (anim === 'pose') {
      T.shL[2] = 0.9; T.elL[0] = -1.6; T.elL[1] = 0.6; T.shR[0] = -0.2; T.shR[2] = -0.6; T.elR[0] = -1.9;
      T.hips[1] = 0.35; T.torso[1] = -0.25; T.head[1] = -0.45; T.head[2] = 0.15; T.hipL[0] = -0.15; T.knL[0] = 0.35; T.hipR[2] = -0.08;
    } else { // idle
      const p = time + s;
      T.shL[2] = 0.1 + Math.sin(p * 1.6) * 0.02; T.shR[2] = -0.1 - Math.sin(p * 1.6) * 0.02;
      T.elL[0] = -0.15; T.elR[0] = -0.15;
      T.head[1] = Math.sin(p * 0.37) * 0.45 * Math.max(0, Math.sin(p * 0.21));
      T.head[0] = Math.sin(p * 0.5) * 0.05;
      T.torso[0] = Math.sin(p * 1.6) * 0.015;
      bob = Math.sin(p * 1.6) * 0.004;
    }
    if (extra.lookYaw !== undefined) T.head[1] = extra.lookYaw;
    const k = anim === 'mannequin' && extra.snap ? 1 : 1 - Math.exp(-dt * 14);
    const J = this.j;
    for (const n of JOINTS) {
      const r = this.rot[n], t = T[n];
      r[0] += (t[0] - r[0]) * k; r[1] += (t[1] - r[1]) * k; r[2] += (t[2] - r[2]) * k;
      J[n].rotation.set(r[0], r[1], r[2]);
    }
    J.hips.position.y = 0.78 + bob + hipsY;
    if (this.trembling > 0) this.mesh.position.set((Math.random() - 0.5) * 0.06, 0, (Math.random() - 0.5) * 0.06);
    else if (this.mesh.position.x !== 0) this.mesh.position.set(0, 0, 0);
  }
  dispose() { this.mesh.geometry.dispose(); this.skeleton.dispose(); }
}

// Perrito procedural
export function makeDog() {
  const g = geos();
  const b = new PartBuilder();
  const fur = 0xc98a4b, dark = 0x6b4123;
  b.add(g.cap(0.14, 0.32), fur, 0, [0, 0.36, 0], [Math.PI / 2, 0, 0], [1, 1, 0.95]);
  b.add(g.sphere, fur, 0, [0, 0.52, 0.3], [0, 0, 0], [0.14, 0.13, 0.15]);
  b.add(g.sphere, 0xf1d3ad, 0, [0, 0.48, 0.42], [0, 0, 0], [0.07, 0.06, 0.07]);
  b.add(g.sphereLo, 0x1a1214, 0, [0, 0.5, 0.49], [0, 0, 0], [0.028, 0.022, 0.02]);
  for (const sx of [-1, 1]) {
    b.add(g.sphereLo, 0x1a1214, 0, [0.06 * sx, 0.56, 0.42], [0, 0, 0], [0.02, 0.025, 0.012]);
    b.add(g.sphere, dark, 0, [0.12 * sx, 0.52, 0.27], [0, 0, 0.5 * sx], [0.04, 0.1, 0.06]);
  }
  b.add(g.cap(0.022, 0.18), dark, 0, [0, 0.47, -0.32], [-0.9, 0, 0], [1, 1, 1]);
  b.add(g.cyl, 0xe8384f, 0, [0, 0.47, 0.22], [0.3, 0, 0], [0.1, 0.03, 0.1]);
  const body = b.build();
  const legGeo = (() => { const lb = new PartBuilder(); lb.add(g.cap(0.04, 0.16), fur, 0, [0, -0.12, 0]); lb.add(g.sphereLo, 0xf1d3ad, 0, [0, -0.24, 0.02], [0, 0, 0], [0.05, 0.035, 0.06]); return lb.build(); })();
  const root = new THREE.Group();
  const bm = new THREE.Mesh(body, charMaterial()); bm.castShadow = true; root.add(bm);
  const legs = [];
  for (const [x, z] of [[0.08, 0.18], [-0.08, 0.18], [0.08, -0.16], [-0.08, -0.16]]) {
    const piv = new THREE.Group(); piv.position.set(x, 0.27, z);
    const lm = new THREE.Mesh(legGeo, charMaterial()); lm.castShadow = true; piv.add(lm); root.add(piv); legs.push(piv);
  }
  root.userData.legs = legs;
  root.userData.phase = 0;
  root.userData.animate = (dt, moving) => {
    root.userData.phase += dt * (moving ? 14 : 0);
    const p = root.userData.phase;
    legs.forEach((l, i) => { l.rotation.x = moving ? Math.sin(p + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.6 : 0; });
    bm.position.y = moving ? Math.abs(Math.sin(p)) * 0.03 : 0;
  };
  return root;
}
