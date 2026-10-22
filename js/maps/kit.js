// Herramientas comunes para construir mapas: material con texturas procedurales, lotes de geometría,
// paredes con puertas, muebles, escaleras, carteles y la red de caminos.
import * as THREE from 'three';
import { mergeGeometries, deinterleaveGeometry } from 'three/addons/utils/BufferGeometryUtils.js';
import { Character } from '../character.js';
import { Phys, buildNav } from '../phys.js';
import { COLORS, randomLook } from '../look.js';
import { mulberry32, pick, shuffle } from '../util.js';

// patrones de superficie (atributo 'pat')
export const PAT = { PLAIN: 0, STRIPE: 1, DOTS: 2, CHECK: 3, AWN: 4, WOOD: 5, PLASTER: 6, TILE: 7, FABRIC: 8, METAL: 9, MARBLE: 10, GLOW: 11, CARPET: 12, BIGTILE: 13, BRICK: 14, HWOOD: 15, GRASS: 16, PAVER: 17 };
// texturas fotográficas (libres) para ladrillo, parquet y pasto
let PHOTO = null;
function photoTextures() {
  if (PHOTO) return PHOTO;
  const L = new THREE.TextureLoader(); const ld = (f) => { const t = L.load(new URL('../../assets/tex/' + f, import.meta.url).href); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  PHOTO = { brick: ld('brick.jpg'), wood: ld('wood.jpg'), grass: ld('grass.jpg') };
  return PHOTO;
}

// ---- texturas livianas generadas una sola vez (en vez de calcular ruido en cada píxel) ----
// texA: R=grano fino · G=tablas de madera · B=baldosas 0.6 · A=baldosas grandes
// texB: R=trama de tela · G=metal cepillado · B=vetas de mármol · A=alfombra
let DETAIL = null;
function detailTextures() {
  if (DETAIL) return DETAIL;
  const N = 256;
  const hash = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
  // ruido continuo repetible (periodo p)
  const vn = (x, y, p, s) => { const xi = Math.floor(x), yi = Math.floor(y); const fx = x - xi, fy = y - yi; const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); const g = (i, j) => hash(((i % p) + p) % p, ((j % p) + p) % p, s); return (g(xi, yi) * (1 - u) + g(xi + 1, yi) * u) * (1 - v) + (g(xi, yi + 1) * (1 - u) + g(xi + 1, yi + 1) * u) * v; };
  const fbm = (x, y, p, s, o = 4) => { let a = 0.5, t = 0, f = 1; for (let i = 0; i < o; i++) { t += a * vn(x * f, y * f, p * f, s + i); f *= 2; a *= 0.5; } return t / 0.9375; };
  const A = new Uint8Array(N * N * 4), Bt = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, i = (y * N + x) * 4;
    // grano: textura de revoque suave
    const grain = 0.55 * fbm(u * 4, v * 4, 4, 1) + 0.45 * fbm(u * 32, v * 32, 32, 2, 3);
    // madera: 5 tablas por tile, vetas a lo largo de x
    const row = Math.floor(v * 5), off = hash(row, 7, 3) * 0.7, pv = (v * 5) % 1;
    const plank = Math.floor(((u + off) % 1) * 1.0);
    const tone = 0.78 + 0.3 * hash(row, plank, 5);
    const vein = fbm(((u + off) % 1) * 3, v * 60, 3, 9, 3);
    const seam = Math.min(1, pv / 0.04, (1 - pv) / 0.04) * Math.min(1, (((u + off) % 1) / 0.006));
    const wood = Math.max(0, Math.min(1, tone * (0.78 + 0.32 * vein) * (0.45 + 0.55 * seam)));
    // baldosas: 4x4 por tile (0.6 m si el tile mide 2.4)
    const tl = (n, gw) => { const fx = (u * n) % 1, fy = (v * n) % 1; const id = Math.floor(u * n) * 31 + Math.floor(v * n); const grout = Math.min(1, fx / gw, (1 - fx) / gw, fy / gw, (1 - fy) / gw); return grout < 1 ? 0.35 + grout * 0.3 : 0.86 + 0.14 * hash(id, 1, 11) + 0.06 * (fbm(u * 8, v * 8, 8, 12) - 0.5); };
    A[i] = grain * 255; A[i + 1] = wood * 255; A[i + 2] = Math.min(1, tl(4, 0.05)) * 255; A[i + 3] = Math.min(1, tl(2, 0.018)) * 255;
    // tela, metal, mármol, alfombra
    const weave = 0.82 + 0.1 * Math.sin(u * N * Math.PI * 0.5) * Math.sin(v * N * Math.PI * 0.5) + 0.16 * (fbm(u * 8, v * 8, 8, 21) - 0.5);
    const brushed = 0.75 + 0.3 * fbm(u * 2, v * 96, 2, 31, 3);
    const mv = fbm(u * 3, v * 3, 3, 41); const mvein = Math.pow(Math.abs(Math.sin((u + v * 0.6) * Math.PI * 4 + mv * 9)), 18);
    const marble = Math.max(0, 0.95 + 0.08 * mv - 0.5 * mvein);
    const carpet = 0.78 + 0.32 * fbm(u * 64, v * 64, 64, 51, 2);
    Bt[i] = Math.min(1, weave) * 255; Bt[i + 1] = Math.min(1, brushed) * 255; Bt[i + 2] = Math.min(1, marble) * 255; Bt[i + 3] = Math.min(1, carpet) * 255;
  }
  const mk = (data) => { const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true; return t; };
  DETAIL = { a: mk(A), b: mk(Bt) };
  return DETAIL;
}

// material del mundo: colores por vértice + detalle de superficie según el patrón (madera, mármol, baldosas, tela, metal…)
export function worldMaterial(levels = [0, 99, 99]) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.0, envMapIntensity: 0.6 });
  const lv = levels.slice(0, 3); while (lv.length < 3) lv.push(99);
  const D = detailTextures(); const PH = photoTextures();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uLevels = { value: lv }; sh.uniforms.tDA = { value: D.a }; sh.uniforms.tDB = { value: D.b }; sh.uniforms.tBrick = { value: PH.brick }; sh.uniforms.tWood = { value: PH.wood }; sh.uniforms.tGrass = { value: PH.grass };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float pat;\nvarying float vPat;\nvarying vec3 vW;\nvarying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPat = pat;\nvW = position;\nvWN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vPat; varying vec3 vW; varying vec3 vWN; uniform float uLevels[3]; uniform sampler2D tDA; uniform sampler2D tDB; uniform sampler2D tBrick; uniform sampler2D tWood; uniform sampler2D tGrass;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      float wRough = -1.0; float wMetal = -1.0; vec3 wEmis = vec3(0.0);
      {
        vec3 base = diffuseColor.rgb; float p = vPat;
        vec3 an = abs(vWN);
        vec2 uvw = an.y > 0.5 ? vW.xz : (an.x > an.z ? vW.zy : vW.xy);
        if (p < 0.5) { base *= 0.9 + 0.16 * texture2D(tDA, uvw * 0.35).r; wRough = 0.8; }
        else if (p < 4.5) {
          float lum = dot(base, vec3(0.299, 0.587, 0.114));
          vec3 alt = lum > 0.55 ? base * 0.45 : mix(base, vec3(1.0), 0.6);
          float mm = 0.0;
          if (p < 1.5) mm = step(0.5, fract(vW.y * 13.0));
          else if (p < 2.5) { vec3 q = fract(vW * 11.0) - 0.5; mm = 1.0 - step(0.2, length(q)); }
          else if (p < 3.5) { float a = step(0.5, fract(uvw.x * 4.0)); float b = step(0.5, fract(uvw.y * 4.0)); mm = abs(a - b) * 0.8; }
          else { alt = mix(base, vec3(1.0), 0.88); mm = step(0.5, fract(vW.x * 1.6 + vW.z * 1.6)); }
          base = mix(base, alt, mm) * (0.92 + 0.12 * texture2D(tDB, uvw * 0.6).r); wRough = 0.85;
        }
        else if (p < 5.5) { base *= 0.25 + 0.9 * texture2D(tDA, uvw / vec2(3.4, 1.05)).g; wRough = 0.55; }
        else if (p < 6.5) { base *= 0.84 + 0.24 * texture2D(tDA, uvw * 0.25).r; wRough = 0.92; }
        else if (p < 7.5) { float t = texture2D(tDA, uvw / 2.4).b; base *= t; wRough = t < 0.7 ? 0.9 : 0.3; }
        else if (p < 8.5) { base *= texture2D(tDB, uvw * 2.0).r; wRough = 1.0; }
        else if (p < 9.5) { base *= texture2D(tDB, uvw * 0.8).g; wRough = 0.32; wMetal = 0.75; }
        else if (p < 10.5) { base *= texture2D(tDB, uvw * 0.22).b; wRough = 0.18; }
        else if (p < 11.5) { wEmis = base * 1.4; wRough = 0.5; }
        else if (p < 12.5) { base *= texture2D(tDB, uvw * 0.5).a; wRough = 1.0; }
        else if (p < 13.5) { float t = texture2D(tDA, uvw / 2.4).a; base *= t; wRough = t < 0.7 ? 0.9 : 0.25; }
        else if (p < 14.5) { base *= texture2D(tBrick, uvw / 2.2).rgb * 1.25; wRough = 0.88; }
        else if (p < 15.5) { base *= texture2D(tWood, uvw / vec2(4.0, 2.0)).rgb * 1.35; wRough = 0.42; }
        else if (p < 16.5) { vec3 g1 = texture2D(tGrass, uvw / 5.0).rgb; vec3 g2 = texture2D(tGrass, uvw / 23.0).rgb; base *= mix(g1, g2, 0.45) * 1.5; wRough = 1.0; }
        else { vec2 g = uvw / vec2(0.4, 0.2); g.x += step(1.0, mod(g.y, 2.0)) * 0.5; vec2 f = fract(g); float e = smoothstep(0.0, 0.06, f.x) * smoothstep(0.0, 0.12, f.y) * smoothstep(1.0, 0.94, f.x) * smoothstep(1.0, 0.88, f.y); float tint = 0.88 + 0.18 * texture2D(tDA, floor(g) * 0.137).r; base *= mix(0.55, tint * (0.9 + 0.12 * texture2D(tDA, uvw * 0.7).r), e); wRough = 0.85; }
        // sombra suave al pie de las paredes
        if (an.y < 0.5) { float ao = 1.0; for (int i = 0; i < 3; i++) { float d = vW.y - uLevels[i]; if (d > -0.02 && d < 1.0) ao = min(ao, mix(0.62, 1.0, smoothstep(0.0, 0.9, d))); } base *= ao; }
        diffuseColor.rgb = base;
      }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nif (wRough >= 0.0) roughnessFactor = wRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nif (wMetal >= 0.0) metalnessFactor = wMetal;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += wEmis;');
  };
  return m;
}

// --- lote estático con colores por vértice ---
export class Batch {
  constructor() { this.parts = []; }
  add(geo, color, pat = 0, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'YXZ')), new THREE.Vector3(...scl));
    this.addMatrix(geo, color, pat, m);
  }
  addMatrix(geo, color, pat, matrix) {
    const g = geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.index) { const n = g.attributes.position.count; const idx = new Uint32Array(n); for (let i = 0; i < n; i++) idx[i] = i; g.setIndex(new THREE.BufferAttribute(idx, 1)); }
    g.applyMatrix4(matrix);
    const n = g.attributes.position.count; const c = new THREE.Color(color);
    const col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('pat', new THREE.BufferAttribute(new Float32Array(n).fill(pat), 1));
    this.parts.push(g);
  }
  build(material, shadow = true) {
    const meshes = []; let chunk = [], count = 0;
    const flush = () => {
      if (!chunk.length) return;
      chunk.forEach((g) => { if (!(g.index.array instanceof Uint32Array)) g.setIndex(new THREE.BufferAttribute(new Uint32Array(g.index.array), 1)); });
      const mesh = new THREE.Mesh(mergeGeometries(chunk, false), material);
      mesh.castShadow = shadow; mesh.receiveShadow = true; meshes.push(mesh);
      chunk.forEach((g) => g.dispose()); chunk = []; count = 0;
    };
    for (const g of this.parts) { chunk.push(g); count += g.attributes.position.count; if (count > 400000) flush(); }
    flush(); this.parts = [];
    return meshes;
  }
}

export function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
export function skyMesh(sunDir = [-0.45, 0.62, 0.4]) {
  const geo = new THREE.SphereGeometry(400, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: new THREE.Vector3(...sunDir).normalize() }, time: { value: 0 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }',
    fragmentShader: `varying vec3 vDir; uniform vec3 sunDir; uniform float time;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*n(p); p*=2.03; a*=0.5; } return v; }
      void main(){
        vec3 d = normalize(vDir); float y = max(d.y, 0.0);
        vec3 col = mix(vec3(0.66,0.8,0.95), vec3(0.1,0.34,0.88), pow(y, 0.38));
        float s = max(dot(d, sunDir), 0.0);
        col += vec3(1.0,0.75,0.45) * pow(s, 12.0) * 0.35 + vec3(1.0,0.95,0.85) * pow(s, 900.0) * 3.0;
        if (d.y > 0.02) { vec2 uv = d.xz / (d.y + 0.15) * 1.6 + vec2(time*0.01, 0.0); float c = smoothstep(0.58, 0.86, fbm(uv)); col = mix(col, vec3(1.0,0.98,0.95), c * 0.85 * smoothstep(0.02, 0.25, d.y)); }
        if (d.y < 0.0) col = mix(vec3(0.66,0.8,0.95), vec3(0.7,0.72,0.74), min(-d.y*4.0,1.0));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = -10;
  return m;
}
function propGeoms(gltf) {
  const map = {};
  for (const sc of gltf.scenes) {
    sc.updateMatrixWorld(true);
    for (const root of sc.children) {
      const list = []; root.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
      root.traverse((o) => { if (o.isMesh) { const g = o.geometry.clone(); deinterleaveGeometry(g); g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)); list.push({ geo: g, mat: o.material }); } });
      map[root.name] = list;
    }
  }
  return map;
}
export function bigSignTex(text, bg, fg, w = 1024, h = 256) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.font = `700 ${Math.round(h * 0.58)}px "Bagel Fat One", "Arial Black", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + h * 0.04, w - 60);
  });
}
export function makeCurtain(color) {
  const geo = new THREE.PlaneGeometry(2.2, 2.4, 40, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, Math.sin(x * 14) * 0.05); p.setX(i, x + 1.1); }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide }));
  const g = new THREE.Group(); m.position.x = -1.1; g.add(m); m.castShadow = true; g.userData.cloth = m; return g;
}

// ===================== kit =====================
// root: grupo donde va todo el mapa. opts: { bounds, levels, seed }
export function makeKit(root, gltf, opts) {
  const bounds = opts.bounds;
  const W = { booths: [], stallFronts: [], spawns: [], itemSpots: [], mannequinSpots: [], anim: [], pois: [], root, bounds };
  const rng = mulberry32(opts.seed || 2026);
  const B = new Batch(); const NB = new Batch(); const GB = new Batch(); // NB: no proyecta sombra (losas, techos) · GB: vidrios
  const P = new Phys(bounds); W.P = P;
  const G = {
    box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(1, 1, 1, 14), cyl24: new THREE.CylinderGeometry(1, 1, 1, 28),
    sphere: new THREE.SphereGeometry(1, 14, 10), cone: new THREE.ConeGeometry(1, 1, 3), cone8: new THREE.ConeGeometry(1, 1, 10), pyr: new THREE.ConeGeometry(1, 1, 4, 1), ico: new THREE.IcosahedronGeometry(1, 1),
    rbox: new THREE.CapsuleGeometry(0.5, 1, 3, 8), torus: new THREE.TorusGeometry(1, 0.045, 8, 40),
  };
  const bulbs = [];
  const solid = (x0, x1, y0, y1, z0, z1, color, pat = 0, flags = {}) => {
    (flags.noShadow ? NB : B).add(G.box, color, pat, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [0, 0, 0], [Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)]);
    if (flags.nocollide) return null;
    return P.add(x0, x1, y0, y1, z0, z1, flags);
  };
  const box = (x, y, z, sx, sy, sz, color, pat = 0, ry = 0, noShadow = false) => (noShadow ? NB : B).add(G.box, color, pat, [x, y, z], [0, ry, 0], [sx, sy, sz]);
  const add = (geo, color, pat, pos, rot, scl) => B.add(G[geo] || geo, color, pat, pos, rot, scl);
  // pared a lo largo de x (en z fijo) con huecos de puerta [[a,b,alto]]
  const wallX = (x0, x1, z, y0, h, th, color, pat, gaps = [], flags = {}) => {
    const g = gaps.slice().sort((a, b) => a[0] - b[0]); let p = x0;
    for (const [a, b, dh = 2.7] of g) {
      if (a > p) solid(p, a, y0, y0 + h, z - th / 2, z + th / 2, color, pat, flags);
      if (dh < h) solid(a, b, y0 + dh, y0 + h, z - th / 2, z + th / 2, color, pat, { ...flags, floor: false });
      p = b;
    }
    if (p < x1) solid(p, x1, y0, y0 + h, z - th / 2, z + th / 2, color, pat, flags);
  };
  const wallZ = (z0, z1, x, y0, h, th, color, pat, gaps = [], flags = {}) => {
    const g = gaps.slice().sort((a, b) => a[0] - b[0]); let p = z0;
    for (const [a, b, dh = 2.7] of g) {
      if (a > p) solid(x - th / 2, x + th / 2, y0, y0 + h, p, a, color, pat, flags);
      if (dh < h) solid(x - th / 2, x + th / 2, y0 + dh, y0 + h, a, b, color, pat, { ...flags, floor: false });
      p = b;
    }
    if (p < z1) solid(x - th / 2, x + th / 2, y0, y0 + h, p, z1, color, pat, flags);
  };
  // marco de puerta decorativo
  const doorFrame = (x, z, y, w, axis, color = 0x3a2b4a) => {
    if (axis === 'x') { box(x - w / 2, y + 1.35, z, 0.12, 2.7, 0.34, color, PAT.WOOD); box(x + w / 2, y + 1.35, z, 0.12, 2.7, 0.34, color, PAT.WOOD); box(x, y + 2.72, z, w + 0.24, 0.12, 0.34, color, PAT.WOOD); }
    else { box(x, y + 1.35, z - w / 2, 0.34, 2.7, 0.12, color, PAT.WOOD); box(x, y + 1.35, z + w / 2, 0.34, 2.7, 0.12, color, PAT.WOOD); box(x, y + 2.72, z, 0.34, 0.12, w + 0.24, color, PAT.WOOD); }
  };

  // ---- props KayKit ----
  const PG = propGeoms(gltf); const texBatches = new Map();
  const placeProp = (name, x, y, z, ry = 0, s = 1) => {
    const list = PG[name]; if (!list) return;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(s, s, s));
    for (const { geo, mat: pm } of list) {
      const key = pm.map ? pm.map.uuid : pm.uuid;
      if (!texBatches.has(key)) texBatches.set(key, { mat: pm, geos: [] });
      const g = geo.clone(); g.applyMatrix4(m);
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      texBatches.get(key).geos.push(g);
    }
  };

  // ---- carteles ----
  const signMats = [];
  const bigSign = (text, x, y, z, ry, w, h, bg, fg, both = false, glow = false) => {
    const m = new THREE.MeshStandardMaterial({ map: bigSignTex(text, bg, fg, 1024, Math.round(1024 * h / w)), roughness: 0.55 });
    if (glow) { m.emissive = new THREE.Color(0xffffff); m.emissiveMap = m.map; m.emissiveIntensity = 0.55; }
    signMats.push(m);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); s.position.set(x, y, z); s.rotation.y = ry; root.add(s);
    if (both) { const s2 = s.clone(); s2.rotation.y = ry + Math.PI; root.add(s2); }
    else { const c = Math.cos(ry), sn = Math.sin(ry); box(x - sn * 0.03, y, z - c * 0.03, (Math.abs(c) > 0.5 ? w + 0.1 : 0.05), h + 0.1, (Math.abs(c) > 0.5 ? 0.05 : w + 0.1), new THREE.Color(bg).multiplyScalar(0.6).getHex()); }
    return s;
  };
  // póster (imagen dibujada a mano en canvas)
  const poster = (x, y, z, ry, w, h, draw) => {
    const t = canvasTex(256, Math.round(256 * h / w), draw);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 }));
    m.position.set(x, y, z); m.rotation.y = ry; root.add(m); signMats.push(m.material);
  };

  // ---- ropa ----
  const CLOTH = COLORS.slice(0, 18).map((c) => c.hex);
  const clothColor = () => CLOTH[Math.floor(rng() * CLOTH.length)];
  const cpat = () => { const r = rng(); return r < 0.18 ? 1 : r < 0.3 ? 2 : r < 0.42 ? 3 : PAT.FABRIC; };
  const hangShirt = (x, y, z, ry, col, pat) => {
    const c = Math.cos(ry), s = Math.sin(ry);
    box(x, y, z, 0.42, 0.52, 0.05, col, pat, ry);
    B.add(G.box, col, pat, [x + c * 0.25, y + 0.17, z - s * 0.25], [0, ry, -0.55], [0.2, 0.13, 0.05]);
    B.add(G.box, col, pat, [x - c * 0.25, y + 0.17, z + s * 0.25], [0, ry, 0.55], [0.2, 0.13, 0.05]);
    box(x, y + 0.31, z, 0.012, 0.12, 0.012, 0x8d8f96, PAT.METAL);
  };
  const hangPants = (x, y, z, ry, col, pat) => {
    const c = Math.cos(ry), s = Math.sin(ry);
    box(x + c * 0.1, y - 0.1, z - s * 0.1, 0.17, 0.68, 0.05, col, pat, ry); box(x - c * 0.1, y - 0.1, z + s * 0.1, 0.17, 0.68, 0.05, col, pat, ry);
    box(x, y + 0.22, z, 0.38, 0.1, 0.05, col, pat, ry);
  };
  const hangDress = (x, y, z, ry, col, pat) => { B.add(G.pyr, col, pat, [x, y - 0.1, z], [0, ry + Math.PI / 4, 0], [0.3, 0.8, 0.12]); box(x, y + 0.22, z, 0.22, 0.2, 0.06, col, pat, ry); };
  // perchero (barra en x local) — sólido para caminar, NO tapa la cámara
  const rack = (x, y, z, ry, len = 2.4, n = 6, collide = true) => {
    const c = Math.cos(ry), s = Math.sin(ry);
    B.add(G.cyl, 0xb9bcc4, PAT.METAL, [x, y + 1.6, z], [0, ry, Math.PI / 2], [0.025, len + 0.2, 0.025]);
    for (const e of [-1, 1]) { box(x + c * e * len / 2, y + 0.8, z - s * e * len / 2, 0.05, 1.6, 0.05, 0x6d6f76, PAT.METAL); box(x + c * e * len / 2, y + 0.02, z - s * e * len / 2, 0.06, 0.04, 0.6, 0x6d6f76, PAT.METAL, ry); }
    for (let i = 0; i < n; i++) {
      const t = -len / 2 + 0.25 + i * (len - 0.5) / Math.max(1, n - 1);
      const px = x + c * t, pz = z - s * t; const col = clothColor(); const r = rng(); const pat = cpat();
      if (r < 0.55) hangShirt(px, y + 1.25, pz, ry + Math.PI / 2 + (rng() - 0.5) * 0.3, col, pat);
      else if (r < 0.8) hangPants(px, y + 1.2, pz, ry + Math.PI / 2 + (rng() - 0.5) * 0.3, col, pat === 2 ? 3 : pat);
      else hangDress(px, y + 1.2, pz, ry + Math.PI / 2, col, pat);
    }
    if (collide) { const hx = Math.abs(c) * len / 2 + Math.abs(s) * 0.3, hz = Math.abs(s) * len / 2 + Math.abs(c) * 0.3; P.add(x - hx, x + hx, y, y + 1.7, z - hz, z + hz, { cam: false, floor: false }); }
  };
  // perchero redondo (escondite)
  const roundRack = (x, z, y = 0) => {
    B.add(G.cyl, 0xb9bcc4, PAT.METAL, [x, y + 1.45, z], [0, 0, 0], [0.75, 0.03, 0.75]);
    box(x, y + 0.72, z, 0.06, 1.45, 0.06, 0x6d6f76, PAT.METAL); B.add(G.cyl, 0x6d6f76, PAT.METAL, [x, y + 0.03, z], [0, 0, 0], [0.45, 0.06, 0.45]);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const col = clothColor(); const pat = cpat(); const px = x + Math.cos(a) * 0.72, pz = z + Math.sin(a) * 0.72; if (rng() < 0.6) hangShirt(px, y + 1.1, pz, -a, col, pat); else hangDress(px, y + 1.05, pz, -a, col, pat); }
    P.add(x - 0.8, x + 0.8, y, y + 1.5, z - 0.8, z + 0.8, { cam: false, floor: false });
  };
  // mesa con ropa doblada (se puede subir)
  const table = (x, y, z, ry, len = 2.4, dep = 0.7, top = 0x9b6b43) => {
    const c = Math.cos(ry), s = Math.sin(ry);
    box(x, y + 0.4, z, len, 0.78, dep, top, PAT.WOOD, ry);
    for (let i = 0; i < Math.floor(len / 0.5); i++) {
      const h = 2 + Math.floor(rng() * 3); const t = -len / 2 + 0.3 + i * 0.5;
      for (let k = 0; k < h; k++) box(x + c * t, y + 0.83 + k * 0.075, z - s * t, 0.38, 0.07, 0.32, clothColor(), rng() < 0.3 ? 1 : PAT.FABRIC, ry + (rng() - 0.5) * 0.2);
    }
    const hx = Math.abs(c) * len / 2 + Math.abs(s) * dep / 2, hz = Math.abs(s) * len / 2 + Math.abs(c) * dep / 2;
    P.add(x - hx, x + hx, y, y + 0.8, z - hz, z + hz, { cam: false });
  };
  // góndola alta (tapa la vista)
  const shelf = (x, y, z, ry, len = 3, h = 2.1, color = 0xf3ece0) => {
    const c = Math.cos(ry), s = Math.sin(ry);
    box(x, y + h / 2, z, len, h, 0.5, color, PAT.PLASTER, ry);
    for (let k = 0; k < 4; k++) {
      const yy = y + 0.3 + k * 0.48;
      box(x, yy, z, len - 0.06, 0.03, 0.62, 0xc9ccd3, PAT.METAL, ry);
      for (const side of [-1, 1]) for (let i = 0; i < Math.floor(len / 0.32); i++) {
        const t = -len / 2 + 0.2 + i * 0.32; if (rng() < 0.15) continue;
        const hh = 0.14 + rng() * 0.18;
        box(x + c * t + s * side * 0.22, yy + 0.02 + hh / 2, z - s * t + c * side * 0.22, 0.26, hh, 0.16, rng() < 0.5 ? clothColor() : 0xfff4e0, rng() < 0.4 ? PAT.FABRIC : 0, ry);
      }
    }
    const hx = Math.abs(c) * len / 2 + Math.abs(s) * 0.32, hz = Math.abs(s) * len / 2 + Math.abs(c) * 0.32;
    P.add(x - hx, x + hx, y, y + h, z - hz, z + hz);
  };
  const counter = (x, y, z, ry, len = 2.6, color = 0xff4f8b) => {
    const c = Math.cos(ry), s = Math.sin(ry);
    box(x, y + 0.55, z, len, 1.1, 0.7, color, PAT.PLASTER, ry);
    box(x, y + 1.13, z, len + 0.1, 0.06, 0.8, 0xece6dc, PAT.MARBLE, ry);
    box(x + c * (len / 2 - 0.4), y + 1.32, z - s * (len / 2 - 0.4), 0.36, 0.32, 0.06, 0x24242c, PAT.METAL, ry); // caja registradora
    const hx = Math.abs(c) * len / 2 + Math.abs(s) * 0.4, hz = Math.abs(s) * len / 2 + Math.abs(c) * 0.4;
    P.add(x - hx, x + hx, y, y + 1.15, z - hz, z + hz, { cam: false });
  };
  const plant = (x, z, y = 0, s = 1) => {
    B.add(G.cyl, 0xd8cbb8, PAT.PLASTER, [x, y + 0.32 * s, z], [0, 0, 0], [0.32 * s, 0.64 * s, 0.32 * s]);
    box(x, y + 0.64 * s, z, 0.5 * s, 0.03, 0.5 * s, 0x4a3020);
    const greens = [0x3f8a34, 0x5fae45, 0x4f9a3c, 0x2f7a3a];
    for (let i = 0; i < 7; i++) { const a = rng() * Math.PI * 2; const r = 0.15 + rng() * 0.25; B.add(G.sphere, greens[i % 4], 0, [x + Math.cos(a) * r * s, y + (0.95 + rng() * 0.75) * s, z + Math.sin(a) * r * s], [rng(), rng(), 0], [0.32 * s, 0.14 * s, 0.22 * s]); }
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; B.add(G.cone, greens[i % 4], 0, [x + Math.cos(a) * 0.35 * s, y + 1.25 * s, z + Math.sin(a) * 0.35 * s], [Math.cos(a) * 1.1, 0, -Math.sin(a) * 1.1], [0.14 * s, 0.8 * s, 0.05 * s]); }
    P.add(x - 0.33 * s, x + 0.33 * s, y, y + 1.6 * s, z - 0.33 * s, z + 0.33 * s, { cam: false, floor: false });
  };
  const palm = (x, z, y = 0) => {
    for (let i = 0; i < 8; i++) B.add(G.cyl, 0x8a6a45, PAT.WOOD, [x + Math.sin(i * 0.4) * 0.05, y + 0.35 + i * 0.42, z], [0, 0, 0.04], [0.16 - i * 0.008, 0.44, 0.16 - i * 0.008]);
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; B.add(G.cone, i % 2 ? 0x3f8a34 : 0x5fae45, 0, [x + Math.cos(a) * 0.9, y + 3.55, z + Math.sin(a) * 0.9], [Math.cos(a) * 1.25, -a, -Math.sin(a) * 1.25], [0.28, 2.0, 0.04]); }
  };
  const bench = (x, z, ry, y = 0, color = 0x9b6b43) => {
    const c = Math.cos(ry), s = Math.sin(ry);
    box(x, y + 0.45, z, 1.8, 0.08, 0.5, color, PAT.WOOD, ry);
    box(x - s * 0.22, y + 0.75, z - c * 0.22, 1.8, 0.4, 0.06, color, PAT.WOOD, ry);
    for (const e of [-0.75, 0.75]) box(x + c * e, y + 0.22, z - s * e, 0.08, 0.44, 0.45, 0x2b2b33, PAT.METAL, ry);
    const hx = Math.abs(c) * 0.9 + Math.abs(s) * 0.3, hz = Math.abs(s) * 0.9 + Math.abs(c) * 0.3;
    P.add(x - hx, x + hx, y, y + 0.5, z - hz, z + hz, { cam: false });
  };
  const sofa = (x, z, ry, y = 0, color = 0x8a4fc7) => {
    const c = Math.cos(ry), s = Math.sin(ry);
    box(x, y + 0.25, z, 2.0, 0.5, 0.85, color, PAT.FABRIC, ry);
    box(x - s * 0.36, y + 0.7, z - c * 0.36, 2.0, 0.6, 0.18, color, PAT.FABRIC, ry);
    for (const e of [-1, 1]) box(x + c * e * 0.92, y + 0.5, z - s * e * 0.92, 0.2, 0.5, 0.85, color, PAT.FABRIC, ry);
    const hx = Math.abs(c) * 1.0 + Math.abs(s) * 0.45, hz = Math.abs(s) * 1.0 + Math.abs(c) * 0.45;
    P.add(x - hx, x + hx, y, y + 0.55, z - hz, z + hz, { cam: false });
  };
  const column = (x, z, y0, y1, color = 0xf1e6d6, r = 0.32) => { B.add(G.cyl24, color, PAT.MARBLE, [x, (y0 + y1) / 2, z], [0, 0, 0], [r, y1 - y0, r]); B.add(G.cyl24, 0xc9a24a, PAT.METAL, [x, y0 + 0.08, z], [0, 0, 0], [r + 0.06, 0.16, r + 0.06]); P.add(x - r, x + r, y0, y1, z - r, z + r, { floor: false }); };
  // panel de luz en el techo (brilla)
  const lightPanel = (x, y, z, w, d) => { NB.add(G.box, 0xfff3d6, PAT.GLOW, [x, y, z], [0, 0, 0], [w, 0.04, d]); };
  const spot = (x, y, z, s = 1) => bulbs.push([x, y, z, s]);
  // escalera (sube en la dirección dada)
  const stairs = (x0, z0, dir, w, y0, h, n, color = 0xd8cbb8, rails = true, pat = PAT.TILE) => {
    const sd = 0.5, sh = h / n;
    for (let i = 1; i <= n; i++) {
      const a = (i - 1) * sd, b = i * sd; const top = y0 + i * sh;
      let bx0, bx1, bz0, bz1;
      if (dir === '+x') { bx0 = x0 + a; bx1 = x0 + b; bz0 = z0 - w / 2; bz1 = z0 + w / 2; }
      if (dir === '-x') { bx0 = x0 - b; bx1 = x0 - a; bz0 = z0 - w / 2; bz1 = z0 + w / 2; }
      if (dir === '+z') { bz0 = z0 + a; bz1 = z0 + b; bx0 = x0 - w / 2; bx1 = x0 + w / 2; }
      if (dir === '-z') { bz0 = z0 - b; bz1 = z0 - a; bx0 = x0 - w / 2; bx1 = x0 + w / 2; }
      solid(bx0, bx1, y0, top, bz0, bz1, i % 2 ? color : new THREE.Color(color).multiplyScalar(0.94).getHex(), pat);
      box((bx0 + bx1) / 2, top + 0.006, (bz0 + bz1) / 2, bx1 - bx0, 0.012, bz1 - bz0, i === n ? 0xffc93c : new THREE.Color(color).multiplyScalar(0.97).getHex(), pat, 0, true);
      // baranda: colisión invisible por escalón (sin sobresalir del piso de arriba)
      if (rails && i < n) {
        if (dir.includes('x')) { for (const zz of [bz0, bz1]) P.add(bx0, bx1, top, top + 0.95, zz - 0.05, zz + 0.05, { floor: false, cam: false }); }
        else { for (const xx of [bx0, bx1]) P.add(xx - 0.05, xx + 0.05, top, top + 0.95, bz0, bz1, { floor: false, cam: false }); }
      }
    }
    // pasamanos inclinado continuo + postes
    if (rails) {
      const run = n * sd; const ang = Math.atan2(h, run); const len = Math.hypot(run, h);
      const sx = dir === '+x' ? 1 : dir === '-x' ? -1 : 0, sz = dir === '+z' ? 1 : dir === '-z' ? -1 : 0;
      for (const side of [-1, 1]) {
        const ox = sx ? 0 : side * w / 2, oz = sz ? 0 : side * w / 2;
        const cx = x0 + sx * run / 2 + ox, cz = z0 + sz * run / 2 + oz;
        const ry = sx ? (sx > 0 ? Math.PI / 2 : -Math.PI / 2) : (sz > 0 ? 0 : Math.PI);
        B.add(G.box, 0xc9a24a, PAT.METAL, [cx, y0 + h / 2 + 0.95, cz], [-ang, ry, 0], [0.07, 0.06, len]);
        for (let k = 0; k <= 4; k++) { const t = k / 4; box(x0 + sx * run * t + ox, y0 + h * t + 0.48, z0 + sz * run * t + oz, 0.05, 0.95, 0.05, 0x9aa0a8, PAT.METAL); }
        railGlass.push([cx, y0 + h / 2 + 0.5, cz, ry, len, -ang]);
      }
    }
  };
  // baranda de vidrio con pasamanos
  const railing = (x0, z0, x1, z1, y, glass = true) => {
    const len = Math.hypot(x1 - x0, z1 - z0); const n = Math.max(1, Math.round(len / 1.5));
    for (let i = 0; i <= n; i++) { const t = i / n; box(x0 + (x1 - x0) * t, y + 0.5, z0 + (z1 - z0) * t, 0.06, 1.0, 0.06, 0x9aa0a8, PAT.METAL); }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2; const ry = Math.atan2(x1 - x0, z1 - z0);
    B.add(G.box, 0xc9a24a, PAT.METAL, [cx, y + 1.02, cz], [0, ry, 0], [0.09, 0.06, len]);
    if (glass) railGlass.push([cx, y + 0.52, cz, ry, len]);
    else B.add(G.box, 0x9aa0a8, PAT.METAL, [cx, y + 0.5, cz], [0, ry, 0], [0.03, 0.03, len]);
    P.add(Math.min(x0, x1) - 0.06, Math.max(x0, x1) + 0.06, y, y + 1.05, Math.min(z0, z1) - 0.06, Math.max(z0, z1) + 0.06, { floor: false, cam: false });
  };
  const railGlass = [];
  const crate = (x, z, y, s = 0.9) => { const h = s * 0.8; solid(x - s / 2, x + s / 2, y, y + h, z - s / 2, z + s / 2, 0xb98a55, PAT.WOOD); for (const d of [-1, 1]) { box(x, y + h / 2, z + d * (s / 2 + 0.005), s * 0.96, 0.08, 0.01, 0x8a5a33, PAT.WOOD); box(x + d * (s / 2 + 0.005), y + h / 2, z, 0.01, 0.08, s * 0.96, 0x8a5a33, PAT.WOOD); } };
  const cardbox = (x, z, y, s = 0.6, ry = 0) => { box(x, y + s * 0.4, z, s, s * 0.8, s * 0.8, 0xc89a62, 0, ry); box(x, y + s * 0.8 + 0.005, z, s * 0.15, 0.01, s * 0.82, 0xa87a42, 0, ry); };
  // probador: cabina con cortina. dir = hacia dónde abre (+1 = +z, -1 = -z)
  const booths = (x0, z, dir, n, y = 0, colors = [0xc0263e, 0x2f5fd0, 0x3fa34d, 0xf07c28, 0x8a4fc7]) => {
    const depth = 2.2; const zb = z - dir * depth; // fondo
    const wcol = 0xf1e3cc;
    for (let i = 0; i < n; i++) {
      const x = x0 + 1.25 + i * 2.5;
      solid(x - 1.25, x - 1.13, y, y + 2.6, Math.min(z, zb), Math.max(z, zb), wcol, PAT.PLASTER);
      if (i === n - 1) solid(x + 1.13, x + 1.25, y, y + 2.6, Math.min(z, zb), Math.max(z, zb), wcol, PAT.PLASTER);
      box(x, y + 2.68, (z + zb) / 2, 2.5, 0.16, depth + 0.2, 0x8a4fc7, PAT.WOOD);
      box(x, y + 1.3, zb + dir * 0.08, 0.7, 1.5, 0.03, 0xdbe9f5, PAT.METAL); box(x, y + 1.3, zb + dir * 0.06, 0.8, 1.6, 0.02, 0xc9a24a, PAT.METAL);
      box(x + 0.7, y + 0.25, zb + dir * 0.35, 0.6, 0.5, 0.4, 0x9b6b43, PAT.WOOD);
      box(x, y + 2.45, z, 2.2, 0.04, 0.04, 0xc9a24a, PAT.METAL);
      const curtain = makeCurtain(colors[i % colors.length]); curtain.position.set(x, y + 1.2, z); if (dir < 0) curtain.rotation.y = Math.PI; root.add(curtain);
      W.booths.push({ id: W.booths.length, x, z: (z + zb) / 2, y, dir, doorX: x, doorZ: z + dir * 1.0, curtain, open: 1 });
      P.add(x - 1.1, x + 1.1, y, y + 2.5, Math.min(zb, zb + dir * 0.2), Math.max(zb, zb + dir * 0.2), { floor: false });
      spot(x, y + 2.5, (z + zb) / 2, 0.9);
    }
  };
  // ventana de vidrio con marco (axis 'x' = en una pared a lo largo de x)
  const windowPane = (x, y, z, w, h, axis, frame = 0x3a2f2a, sill = true) => {
    if (axis === 'x') { GB.add(G.box, 0x9fb4c4, 0, [x, y, z], [0, 0, 0], [w, h, 0.04]); box(x, y + h / 2, z, w + 0.12, 0.08, 0.16, frame, PAT.METAL); box(x, y - h / 2, z, w + 0.12, 0.08, 0.16, frame, PAT.METAL); box(x - w / 2, y, z, 0.08, h, 0.16, frame, PAT.METAL); box(x + w / 2, y, z, 0.08, h, 0.16, frame, PAT.METAL); box(x, y, z, 0.05, h, 0.12, frame, PAT.METAL); if (sill) box(x, y - h / 2 - 0.06, z, w + 0.3, 0.06, 0.34, 0xe8e0d2, PAT.PLASTER); }
    else { GB.add(G.box, 0x9fb4c4, 0, [x, y, z], [0, 0, 0], [0.04, h, w]); box(x, y + h / 2, z, 0.16, 0.08, w + 0.12, frame, PAT.METAL); box(x, y - h / 2, z, 0.16, 0.08, w + 0.12, frame, PAT.METAL); box(x, y, z - w / 2, 0.16, h, 0.08, frame, PAT.METAL); box(x, y, z + w / 2, 0.16, h, 0.08, frame, PAT.METAL); box(x, y, z, 0.12, h, 0.05, frame, PAT.METAL); if (sill) box(x, y - h / 2 - 0.06, z, 0.34, 0.06, w + 0.3, 0xe8e0d2, PAT.PLASTER); }
  };
  // árbol con copa en racimos (colores variados)
  const tree2 = (x, z, y = 0, s = 1, kind = 0) => {
    const trunk = 0x6b4a32;
    B.add(G.cyl, trunk, PAT.WOOD, [x, y + 1.3 * s, z], [0, 0, 0.03], [0.17 * s, 2.6 * s, 0.17 * s]);
    for (let i = 0; i < 3; i++) { const a = rng() * Math.PI * 2; B.add(G.cyl, trunk, PAT.WOOD, [x + Math.cos(a) * 0.35 * s, y + (2.3 + i * 0.3) * s, z + Math.sin(a) * 0.35 * s], [Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7], [0.07 * s, 1.1 * s, 0.07 * s]); }
    const greens = kind === 1 ? [0xd9a33a, 0xc98a2a, 0xe8b84a, 0xb97a28] : [0x4f8a3a, 0x5f9e45, 0x3f7a34, 0x6aa84f];
    const n = 9;
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + rng(); const r = (0.5 + rng() * 0.9) * s; const hh = (3.0 + rng() * 1.5) * s; const k = (0.75 + rng() * 0.55) * s; B.add(G.ico, greens[i % greens.length], PAT.FABRIC, [x + Math.cos(a) * r, y + hh, z + Math.sin(a) * r], [rng(), rng(), rng()], [k, k * 0.85, k]); }
    B.add(G.ico, greens[0], PAT.FABRIC, [x, y + 4.4 * s, z], [0, 0, 0], [1.0 * s, 0.9 * s, 1.0 * s]);
    P.add(x - 0.2 * s, x + 0.2 * s, y, y + 2.6 * s, z - 0.2 * s, z + 0.2 * s, { cam: false, floor: false });
  };
  // reja de barrotes
  const fence = (x0, z0, x1, z1, h = 2.4, color = 0x2f3a3a) => {
    const len = Math.hypot(x1 - x0, z1 - z0); const n = Math.round(len / 0.18); const ry = Math.atan2(x1 - x0, z1 - z0);
    for (let i = 0; i <= n; i++) { const t = i / n; B.add(G.box, color, PAT.METAL, [x0 + (x1 - x0) * t, h / 2, z0 + (z1 - z0) * t], [0, ry, 0], [0.04, h, 0.04]); }
    for (const yy of [0.15, h - 0.1]) B.add(G.box, color, PAT.METAL, [(x0 + x1) / 2, yy, (z0 + z1) / 2], [0, ry, 0], [0.07, 0.07, len]);
    for (let i = 0; i <= Math.round(len / 3); i++) { const t = i / Math.max(1, Math.round(len / 3)); B.add(G.box, color, PAT.METAL, [x0 + (x1 - x0) * t, h / 2, z0 + (z1 - z0) * t], [0, ry, 0], [0.12, h + 0.1, 0.12]); }
    P.add(Math.min(x0, x1) - 0.08, Math.max(x0, x1) + 0.08, 0, h, Math.min(z0, z1) - 0.08, Math.max(z0, z1) + 0.08, { cam: false });
  };
  const mannequin = (x, z, y, ry) => { W.mannequinSpots.push({ x, z, y, ry }); P.add(x - 0.3, x + 0.3, y, y + 1.75, z - 0.3, z + 0.3, { cam: false, floor: false }); B.add(G.cyl, 0x2b2b33, PAT.METAL, [x, y + 0.03, z], [0, 0, 0], [0.32, 0.06, 0.32]); };
  const poi = (x, z, y, face, kind = 'look') => W.pois.push({ x, z, y, face, kind });
  const rug = (x, z, y, w, d, color, pat = PAT.CARPET) => box(x, y + 0.012, z, w, 0.02, d, color, pat);

  // ---------- terminar ----------
  const finish = ({ levels = [0], floorMax = 8, spawnMin = 5, itemMin = 4.5, avoid = null } = {}) => {
    const mat = worldMaterial(opts.levels || levels);
    for (const m of B.build(mat, true)) root.add(m);
    for (const m of NB.build(mat, false)) root.add(m);
    if (GB.parts.length) { const gm = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.06, metalness: 0.65, envMapIntensity: 1.3 }); for (const m of GB.build(gm, false)) root.add(m); }
    for (const { mat: pm, geos } of texBatches.values()) {
      const merged = mergeGeometries(geos, false); const mm = pm.clone(); mm.roughness = 0.7; mm.metalness = 0;
      const mesh = new THREE.Mesh(merged, mm); mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh); geos.forEach((g) => g.dispose());
    }
    if (railGlass.length) {
      const gm = new THREE.MeshStandardMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.2, depthWrite: false });
      const geos = railGlass.map(([x, y, z, ry, len, tilt = 0]) => { const g = new THREE.BoxGeometry(0.02, 0.9, len); g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, ry, 0, 'YXZ')), new THREE.Vector3(1, 1, 1))); return g; });
      root.add(new THREE.Mesh(mergeGeometries(geos, false), gm));
    }
    if (bulbs.length) {
      const bm = new THREE.MeshBasicMaterial({ color: 0xffd27a, toneMapped: false }); bm.color.setRGB(1.7, 1.25, 0.6);
      const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 8, 6), bm, bulbs.length); const m4 = new THREE.Matrix4();
      bulbs.forEach((b, i) => { const s = b[3] || 1; m4.makeScale(s, s, s); m4.setPosition(b[0], b[1], b[2]); inst.setMatrixAt(i, m4); });
      root.add(inst); W.bulbs = inst;
    }
    W.mannequins = []; const mrng = mulberry32(99);
    for (const s of W.mannequinSpots) { const ch = new Character(randomLook(mrng), { mannequin: true, shadow: true }); ch.root.position.set(s.x, s.y || 0, s.z); ch.root.rotation.y = s.ry; ch.update(1, 'mannequin', 0, 0, { snap: true }); root.add(ch.root); W.mannequins.push(ch); }
    const floorsAt = (x, z) => { const ys = new Set([0]); for (const b of P.near(x, z, 0)) if (b.floor && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && b.y1 > 0.05 && b.y1 < floorMax) ys.add(Math.round(b.y1 * 1000) / 1000); return [...ys]; };
    W.nav = buildNav(P, floorsAt, 1.0);
    const okNodes = W.nav.nodes.map((n, i) => (n.ok ? i : -1)).filter((i) => i >= 0);
    W.pois = W.pois.filter((p) => !P.blocked(p.x, p.z, p.y, 0.3) && Math.abs(P.groundAt(p.x, p.z, p.y) - p.y) < 0.05);
    const spotRng = mulberry32(555);
    const pickNodes = (n, minDist) => { const out = []; const order = shuffle(spotRng, okNodes.slice()); for (const i of order) { const nd = W.nav.nodes[i]; if (avoid && avoid(nd)) continue; if (out.some((o) => Math.hypot(o.x - nd.x, o.z - nd.z) < minDist && Math.abs(o.y - nd.y) < 2)) continue; out.push({ x: nd.x, z: nd.z, y: nd.y }); if (out.length >= n) break; } return out; };
    W.spawns = pickNodes(24, spawnMin); W.itemSpots = pickNodes(30, itemMin);
    return W;
  };

  return { W, P, B, NB, GB, G, rng, PAT, windowPane, tree2, fence, solid, box, add, wallX, wallZ, doorFrame, placeProp, bigSign, poster, rack, roundRack, table, shelf, counter, plant, palm, bench, sofa, column, lightPanel, spot, stairs, railing, crate, cardbox, booths, mannequin, poi, rug, clothColor, finish };
}
