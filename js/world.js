// La feria: mapa, iluminación, cielo, colisiones y red de caminos
import * as THREE from 'three';
import { mergeGeometries, deinterleaveGeometry } from 'three/addons/utils/BufferGeometryUtils.js';
import { charMaterial, Character } from './character.js';
import { Phys, buildNav } from './phys.js';
import { COLORS, randomLook } from './look.js';
import { mulberry32, pick, shuffle } from './util.js';

const STALL_NAMES = ['Moda Flores', 'La Percha', 'Jeans Lili', 'Remeras Ya', 'Tienda Rulo', 'Mundo Buzo', 'Pollerísima', 'Zapa Feliz',
  'Todo Liquida', 'Moda Oeste', 'Mil Colores', 'La Costurera', 'Gorras Gorrón', 'Ropa Linda', 'Telas Tita', 'Doña Moda'];
const AWNING = [0xe8384f, 0x2f8fd0, 0x3fa34d, 0xf5a818, 0xe86fa8, 0x8a4fc7, 0xf07c28, 0x1fb5a8, 0xd94848, 0x3557c9];

// --- batcher estático con colores por vértice ---
class Batch {
  constructor() { this.parts = []; }
  add(geo, color, pat = 0, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) {
    const g = geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.index) { const n = g.attributes.position.count; const idx = new Uint32Array(n); for (let i = 0; i < n; i++) idx[i] = i; g.setIndex(new THREE.BufferAttribute(idx, 1)); }
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'YXZ')), new THREE.Vector3(...scl));
    g.applyMatrix4(m);
    const n = g.attributes.position.count;
    const c = new THREE.Color(color);
    const col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('pat', new THREE.BufferAttribute(new Float32Array(n).fill(pat), 1));
    this.parts.push(g);
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
  build(material) {
    // fusionar en trozos para no exceder índices
    const meshes = [];
    let chunk = [], count = 0;
    const flush = () => {
      if (!chunk.length) return;
      chunk.forEach((g) => { if (g.index.array instanceof Uint16Array) g.setIndex(new THREE.BufferAttribute(new Uint32Array(g.index.array), 1)); });
      const m = mergeGeometries(chunk, false);
      const mesh = new THREE.Mesh(m, material);
      mesh.castShadow = true; mesh.receiveShadow = true;
      meshes.push(mesh);
      chunk.forEach((g) => g.dispose());
      chunk = []; count = 0;
    };
    for (const g of this.parts) { chunk.push(g); count += g.attributes.position.count; if (count > 400000) flush(); }
    flush();
    this.parts = [];
    return meshes;
  }
}

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

function groundTexture() {
  return canvasTex(1024, 1024, (g, w, h) => {
    const rng = mulberry32(7);
    g.fillStyle = '#b9a58f'; g.fillRect(0, 0, w, h);
    const n = 8, s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const off = (j % 2) * s / 2;
      const v = 0.86 + rng() * 0.2;
      const r = Math.round(214 * v), gg = Math.round(196 * v), b = Math.round(174 * v);
      g.fillStyle = `rgb(${r},${gg},${b})`;
      g.fillRect(i * s + off + 3, j * s + 3, s - 6, s - 6);
      if (off) { g.fillRect(i * s + off + 3 - w, j * s + 3, s - 6, s - 6); }
      for (let k = 0; k < 30; k++) { g.fillStyle = `rgba(${rng() < 0.5 ? '255,255,255' : '60,40,20'},${0.04 + rng() * 0.05})`; g.fillRect(i * s + off + rng() * s, j * s + rng() * s, 2 + rng() * 6, 2 + rng() * 6); }
    }
  }, [21, 14]);
}
function asphaltTexture() {
  return canvasTex(512, 512, (g, w, h) => {
    const rng = mulberry32(3);
    g.fillStyle = '#4a4d55'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 4000; k++) { g.fillStyle = `rgba(${rng() < 0.5 ? '255,255,255' : '0,0,0'},${rng() * 0.08})`; g.fillRect(rng() * w, rng() * h, 2, 2); }
  }, [30, 30]);
}
export function blobTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}
function signAtlas() {
  return canvasTex(2048, 512, (g, w, h) => {
    const cw = 512, ch = 128;
    STALL_NAMES.forEach((name, i) => {
      const x = (i % 4) * cw, y = Math.floor(i / 4) * ch;
      const bg = ['#fff4e0', '#24112f', '#ffc93c', '#ff4f8b'][i % 4];
      const fg = ['#24112f', '#ffc93c', '#24112f', '#fff4e0'][i % 4];
      g.fillStyle = bg; g.fillRect(x, y, cw, ch);
      g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(x + 8, y + 8, cw - 16, ch - 16);
      g.fillStyle = fg; g.font = '700 58px "Bagel Fat One", "Arial Black", sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(name, x + cw / 2, y + ch / 2 + 4, cw - 40);
    });
  });
}
function bigSignTex(text, bg, fg) {
  return canvasTex(1024, 256, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.font = '700 150px "Bagel Fat One", "Arial Black", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 10, w - 60);
  });
}

function skyMesh() {
  const geo = new THREE.SphereGeometry(400, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: new THREE.Vector3(-0.45, 0.62, 0.4).normalize() }, time: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `varying vec3 vDir; uniform vec3 sunDir; uniform float time;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*n(p); p*=2.03; a*=0.5; } return v; }
      void main(){
        vec3 d = normalize(vDir);
        float y = max(d.y, 0.0);
        vec3 top = vec3(0.1,0.34,0.88);
        vec3 hor = vec3(0.66,0.8,0.95);
        vec3 col = mix(hor, top, pow(y, 0.38));
        float s = max(dot(d, sunDir), 0.0);
        col += vec3(1.0,0.75,0.45) * pow(s, 12.0) * 0.35 + vec3(1.0,0.95,0.85) * pow(s, 900.0) * 3.0;
        if (d.y > 0.02) {
          vec2 uv = d.xz / (d.y + 0.15) * 1.6 + vec2(time*0.01, 0.0);
          float c = smoothstep(0.58, 0.86, fbm(uv));
          col = mix(col, vec3(1.0,0.98,0.95), c * 0.85 * smoothstep(0.02, 0.25, d.y));
        }
        if (d.y < 0.0) col = mix(hor, vec3(0.7,0.72,0.74), min(-d.y*4.0,1.0));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.renderOrder = -10;
  return m;
}

// helper: copiar geometría de un modelo KayKit al batch texturizado
function propGeoms(gltf) {
  const map = {};
  for (const sc of gltf.scenes) {
    sc.updateMatrixWorld(true);
    for (const root of sc.children) {
      const list = [];
      root.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
      root.traverse((o) => {
        if (o.isMesh) {
          const g = o.geometry.clone();
          deinterleaveGeometry(g);
          g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
          list.push({ geo: g, mat: o.material });
        }
      });
      map[root.name] = list;
    }
  }
  return map;
}


// ---------- texturas de piso ----------
function tileTex(base, grout, n, jitter, repeat, seed, rnd = 0.12, kind = 'tile') {
  return canvasTex(512, 512, (g, w, h) => {
    const rng = mulberry32(seed);
    g.fillStyle = grout; g.fillRect(0, 0, w, h);
    const s = w / n;
    const c = new THREE.Color(base);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = 1 - rnd + rng() * rnd * 2;
      g.fillStyle = `rgb(${Math.round(c.r * 255 * v)},${Math.round(c.g * 255 * v)},${Math.round(c.b * 255 * v)})`;
      if (kind === 'cobble') { g.beginPath(); g.ellipse(i * s + s / 2 + (rng() - 0.5) * jitter, j * s + s / 2 + (rng() - 0.5) * jitter, s * 0.44, s * 0.4, rng() * 3, 0, Math.PI * 2); g.fill(); }
      else if (kind === 'wood') { const off = (j % 2) * s * 1.5; g.fillRect((i * s * 3 + off) % w + 1, j * s + 1, s * 3 - 2, s - 2); g.fillRect((i * s * 3 + off) % w - w + 1, j * s + 1, s * 3 - 2, s - 2); g.strokeStyle = 'rgba(60,30,10,.18)'; g.lineWidth = 1; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(0, j * s + s * (0.25 + k * 0.25) + rng() * 4); g.lineTo(w, j * s + s * (0.25 + k * 0.25) + rng() * 4); g.stroke(); } }
      else { const off = kind === 'brick' ? (j % 2) * s / 2 : 0; g.fillRect(i * s + off + 2, j * s + 2, s - 4, s - 4); if (off) g.fillRect(i * s + off + 2 - w, j * s + 2, s - 4, s - 4); }
      for (let k = 0; k < 14; k++) { g.fillStyle = `rgba(${rng() < 0.5 ? '255,255,255' : '40,25,10'},${0.03 + rng() * 0.05})`; g.fillRect(i * s + rng() * s, j * s + rng() * s, 2 + rng() * 5, 2 + rng() * 5); }
    }
  }, repeat);
}
function grassTex() {
  return canvasTex(256, 256, (g, w, h) => {
    const rng = mulberry32(5); g.fillStyle = '#6aa84f'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${rng() < 0.5 ? '40,110,40' : '150,200,90'},${0.25 + rng() * 0.3})`; g.fillRect(rng() * w, rng() * h, 1.5, 3 + rng() * 4); }
  }, [1, 1]);
}

// planos texturizados (pisos) agrupados por textura
class FloorBatch {
  constructor() { this.map = new Map(); }
  add(tex, x0, x1, z0, z1, y, scale = 4) {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2);
    g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    const uv = g.attributes.uv; const p = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / scale, p.getZ(i) / scale);
    if (!this.map.has(tex)) this.map.set(tex, []);
    this.map.get(tex).push(g);
  }
  build(scene) {
    for (const [tex, list] of this.map) {
      tex.repeat.set(1, 1);
      const m = new THREE.Mesh(mergeGeometries(list, false), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      m.receiveShadow = true; scene.add(m);
    }
  }
}

export const BOUNDS = { x0: -30, x1: 30, z0: -22, z1: 22 };

export function buildWorld(scene, gltf) {
  const W = { booths: [], stallFronts: [], spawns: [], itemSpots: [], mannequinSpots: [], anim: [], pois: [] };
  const rng = mulberry32(2026);
  const mat = charMaterial();
  const B = new Batch();
  const F = new FloorBatch();
  const P = new Phys(BOUNDS);
  W.P = P;
  const G = {
    box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(1, 1, 1, 12), cyl24: new THREE.CylinderGeometry(1, 1, 1, 28),
    sphere: new THREE.SphereGeometry(1, 14, 10), cone: new THREE.ConeGeometry(1, 1, 3), pyr: new THREE.ConeGeometry(1, 1, 4, 1), ico: new THREE.IcosahedronGeometry(1, 1),
  };
  // caja sólida: dibujo + colisión
  const solid = (x0, x1, y0, y1, z0, z1, color, pat = 0, flags = {}) => {
    B.add(G.box, color, pat, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [0, 0, 0], [Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)]);
    return P.add(x0, x1, y0, y1, z0, z1, flags);
  };
  const box = (x, y, z, sx, sy, sz, color, pat = 0, ry = 0) => B.add(G.box, color, pat, [x, y, z], [0, ry, 0], [sx, sy, sz]);
  const TEX = {
    tile: tileTex(0xd9c4a6, '#9c8a72', 8, 0, null, 7, 0.1),
    cobble: tileTex(0xb7a99a, '#6d625a', 10, 6, null, 9, 0.18, 'cobble'),
    concrete: tileTex(0xbdb8b0, '#a29d95', 4, 0, null, 3, 0.05),
    wood: tileTex(0xb07a46, '#5e3b1d', 8, 0, null, 4, 0.12, 'wood'),
    brick: tileTex(0xc4583f, '#8a3d2c', 8, 0, null, 6, 0.12, 'brick'),
    grass: grassTex(),
  };
  for (const t of Object.values(TEX)) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }

  // ---------- cielo y luces ----------
  const sky = skyMesh(); scene.add(sky); W.sky = sky;
  scene.fog = new THREE.Fog(0xcfe0f0, 60, 200);
  const hemi = new THREE.HemisphereLight(0xd6e8ff, 0xa08060, 1.15); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe8c8, 2.7);
  sun.position.set(-34, 50, 32); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 150;
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05;
  scene.add(sun); scene.add(sun.target); W.sun = sun;
  const fill = new THREE.DirectionalLight(0xbfd6ff, 0.4); fill.position.set(30, 20, -30); scene.add(fill);

  // ---------- suelo base y alrededores ----------
  F.add(TEX.tile, BOUNDS.x0, BOUNDS.x1, BOUNDS.z0, BOUNDS.z1, 0, 3.2);
  const asph = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.95 }));
  asph.rotation.x = -Math.PI / 2; asph.position.y = -0.04; asph.receiveShadow = true; scene.add(asph);
  // cordón perimetral
  box(0, 0.08, BOUNDS.z0 - 0.3, 61.2, 0.2, 0.6, 0xcfc8bd); box(0, 0.08, BOUNDS.z1 + 0.3, 61.2, 0.2, 0.6, 0xcfc8bd);
  box(BOUNDS.x0 - 0.3, 0.08, 0, 0.6, 0.2, 45.2, 0xcfc8bd); box(BOUNDS.x1 + 0.3, 0.08, 0, 0.6, 0.2, 45.2, 0xcfc8bd);

  // props de KayKit agrupados por textura
  const PG = propGeoms(gltf);
  const texBatches = new Map();
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
  // edificios alrededor
  const bNames = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const bW = { A: 1.2, B: 1.6, C: 1.2, D: 1.6, E: 2.0, F: 2.0, G: 2.0, H: 2.0 };
  const S = 4.6;
  const lineBuildings = (a0, a1, fixed, axis, ry) => {
    let p = a0;
    while (p < a1) { const n = pick(rng, bNames); const w = bW[n] * S; const c = p + w / 2; if (axis === 'x') placeProp('building_' + n + '_withoutBase', c, -0.46, fixed, ry, S); else placeProp('building_' + n + '_withoutBase', fixed, -0.46, c, ry, S); p += w + 0.2; }
  };
  lineBuildings(-56, 56, -32.5, 'x', 0); lineBuildings(-56, 56, 32.5, 'x', Math.PI);
  lineBuildings(-28, 28, -42, 'z', Math.PI / 2); lineBuildings(-28, 28, 42, 'z', -Math.PI / 2);
  box(0, 0, -29.5, 120, 0.12, 4, 0xbdb6ab); box(0, 0, 29.5, 120, 0.12, 4, 0xbdb6ab); box(-39, 0, 0, 4, 0.12, 64, 0xbdb6ab); box(39, 0, 0, 4, 0.12, 64, 0xbdb6ab);
  for (let x = -50; x <= 50; x += 6) { box(x, -0.03, -25.5, 3, 0.02, 0.18, 0xfff2b0); box(x, -0.03, 25.5, 3, 0.02, 0.18, 0xfff2b0); }
  const cars = ['car_sedan', 'car_taxi', 'car_hatchback'];
  for (let x = -46; x <= 46; x += 11 + rng() * 6) { if (rng() < 0.6) placeProp(pick(rng, cars), x, 0.25, -27.6, Math.PI / 2, 4.3); if (rng() < 0.6) placeProp(pick(rng, cars), x + 4, 0.25, 27.6, -Math.PI / 2, 4.3); }

  // ---------- carteles ----------
  const atlas = signAtlas();
  const signGeos = [];
  let signI = 0;
  const addSign = (x, y, z, ry, w = 2.0, h = 0.5, idx = signI++) => {
    const g = new THREE.PlaneGeometry(w, h);
    const k = idx % STALL_NAMES.length;
    const u0 = (k % 4) / 4, v1 = 1 - Math.floor(k / 4) / 4, u1 = u0 + 0.25, v0 = v1 - 0.25;
    const uv = g.attributes.uv; uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0);
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1)));
    signGeos.push(g);
    const c = Math.cos(ry), s = Math.sin(ry);
    box(x - s * 0.015, y, z - c * 0.015, w + 0.08, h + 0.08, 0.02, 0x24112f, 0, ry);
  };
  const bigSign = (text, x, y, z, ry, w, h, bg, fg, both = false) => {
    const m = new THREE.MeshStandardMaterial({ map: bigSignTex(text, bg, fg), roughness: 0.6 });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    s.position.set(x, y, z); s.rotation.y = ry; scene.add(s);
    if (both) { const s2 = s.clone(); s2.rotation.y = ry + Math.PI; scene.add(s2); }
    else { const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color: new THREE.Color(bg), roughness: 0.7 })); back.position.copy(s.position); back.rotation.y = ry + Math.PI; scene.add(back); }
    return s;
  };

  // ---------- ropa colgada ----------
  const clothColor = () => COLORS[Math.floor(rng() * COLORS.length)].hex;
  const hangShirt = (x, y, z, ry, col, pat) => {
    const c = Math.cos(ry), s = Math.sin(ry);
    box(x, y, z, 0.42, 0.52, 0.05, col, pat, ry);
    B.add(G.box, col, pat, [x + c * 0.25, y + 0.17, z - s * 0.25], [0, ry, -0.55], [0.2, 0.13, 0.05]);
    B.add(G.box, col, pat, [x - c * 0.25, y + 0.17, z + s * 0.25], [0, ry, 0.55], [0.2, 0.13, 0.05]);
    box(x, y + 0.31, z, 0.012, 0.12, 0.012, 0x8d8f96);
  };
  const hangPants = (x, y, z, ry, col, pat) => {
    const c = Math.cos(ry), s = Math.sin(ry);
    box(x + c * 0.1, y - 0.1, z - s * 0.1, 0.17, 0.68, 0.05, col, pat, ry);
    box(x - c * 0.1, y - 0.1, z + s * 0.1, 0.17, 0.68, 0.05, col, pat, ry);
    box(x, y + 0.22, z, 0.38, 0.1, 0.05, col, pat, ry);
  };
  const hangDress = (x, y, z, ry, col, pat) => {
    B.add(G.pyr, col, pat, [x, y - 0.1, z], [0, ry + Math.PI / 4, 0], [0.3, 0.8, 0.12]);
    box(x, y + 0.22, z, 0.22, 0.2, 0.06, col, pat, ry);
  };
  // perchero (barra a lo largo del eje local x) con prendas
  const rack = (x, y, z, ry, len = 2.4, n = 6) => {
    const c = Math.cos(ry), s = Math.sin(ry);
    B.add(G.cyl, 0x8d8f96, 0, [x, y + 1.6, z], [0, ry, Math.PI / 2], [0.025, len + 0.2, 0.025]);
    for (const e of [-1, 1]) { box(x + c * e * len / 2, y + 0.8, z - s * e * len / 2, 0.05, 1.6, 0.05, 0x6d6f76); box(x + c * e * len / 2, y + 0.02, z - s * e * len / 2, 0.06, 0.04, 0.6, 0x6d6f76, 0, ry); }
    for (let i = 0; i < n; i++) {
      const t = -len / 2 + 0.25 + i * (len - 0.5) / Math.max(1, n - 1);
      const px = x + c * t, pz = z - s * t; const col = clothColor(); const r = rng();
      const pat = rng() < 0.3 ? 1 + Math.floor(rng() * 3) : 0;
      if (r < 0.55) hangShirt(px, y + 1.25, pz, ry + Math.PI / 2 + (rng() - 0.5) * 0.3, col, pat);
      else if (r < 0.8) hangPants(px, y + 1.2, pz, ry + Math.PI / 2 + (rng() - 0.5) * 0.3, col, pat ? 3 : 0);
      else hangDress(px, y + 1.2, pz, ry + Math.PI / 2, col, pat ? 1 : 0);
    }
  };
  // mesa de ropa doblada
  const table = (x, y, z, ry, len = 2.4, dep = 0.7) => {
    const cloth = clothColor();
    box(x, y + 0.4, z, len, 0.78, dep, 0x9b6b43, 0, ry);
    box(x, y + 0.8, z, len + 0.1, 0.04, dep + 0.1, cloth, 3, ry);
    const c = Math.cos(ry), s = Math.sin(ry);
    for (let i = 0; i < Math.floor(len / 0.5); i++) {
      const h = 2 + Math.floor(rng() * 3); const t = -len / 2 + 0.3 + i * 0.5;
      for (let k = 0; k < h; k++) box(x + c * t, y + 0.86 + k * 0.075, z - s * t, 0.38, 0.07, 0.32, clothColor(), rng() < 0.3 ? 1 : 0, ry + (rng() - 0.5) * 0.2);
    }
  };
  // puesto clásico con toldo. dir: hacia dónde mira el frente (+1 = +z, -1 = -z). y: altura del piso
  const stall = (cx, cz, dir, y = 0, roof = true) => {
    const ry = dir > 0 ? 0 : Math.PI;
    const L = (dx, dz) => [cx + dx * (dir > 0 ? 1 : -1), cz + dz * dir];
    const awn = pick(rng, AWNING);
    if (roof) {
      for (const [dx, dz] of [[-1.45, 1.3], [1.45, 1.3], [-1.45, -1.2], [1.45, -1.2]]) { const [x, z] = L(dx, dz); box(x, y + 1.35, z, 0.07, 2.7, 0.07, 0x5d5f66); }
      const [x, z] = L(0, 0.05);
      B.add(G.box, awn, 4, [x, y + 2.8, z], [-0.15 * dir, 0, 0], [3.1, 0.05, 2.9]);
      const [x2, z2] = L(0, 1.5); box(x2, y + 2.5, z2, 3.12, 0.26, 0.04, awn, 4);
      for (let i = 0; i < 7; i++) { const [x3, z3] = L(-1.33 + i * 0.444, 1.505); B.add(G.cyl, awn, 0, [x3, y + 2.36, z3], [Math.PI / 2, 0, 0], [0.21, 0.04, 0.14]); }
      const [sx, sz] = L(0, 1.56); addSign(sx, y + 2.92, sz + 0.02 * dir, ry, 1.9, 0.48);
    }
    const [tx, tz] = L(0, 0.9); table(tx, y, tz, ry, 2.6, 0.66);
    const [rx, rz] = L(0, -0.8); rack(rx, y, rz, ry, 2.5, 6);
    const [bx, bz] = L(0, -1.25); box(bx, y + 1.4, bz, 2.9, 2.8, 0.04, new THREE.Color(awn).lerp(new THREE.Color(0xfff6ea), 0.75).getHex(), 0, ry);
    const [f0x, f0z] = L(-1.5, -1.3), [f1x, f1z] = L(1.5, 1.3);
    P.add(f0x, f1x, y, y + 2.6, f0z, f1z, { cam: false });
    const [fx, fz] = L(0, 2.3); W.stallFronts.push({ x: fx, z: fz, y }); W.pois.push({ x: fx, z: fz, y, face: dir > 0 ? Math.PI : 0, kind: 'browse' });
  };
  // escalera: sube desde (x0,z0) en dirección dir ('+x','-x','+z','-z'), ancho w, altura total h, n escalones
  const stairs = (x0, z0, dir, w, y0, h, n, color = 0xcbb79c, rails = true) => {
    const run = n * (dir.includes('x') ? 0.5 : 0.5);
    const sd = 0.5, sh = h / n;
    for (let i = 1; i <= n; i++) {
      const a = (i - 1) * sd, b = i * sd; const top = y0 + i * sh;
      let bx0, bx1, bz0, bz1;
      if (dir === '+x') { bx0 = x0 + a; bx1 = x0 + b; bz0 = z0 - w / 2; bz1 = z0 + w / 2; }
      if (dir === '-x') { bx0 = x0 - b; bx1 = x0 - a; bz0 = z0 - w / 2; bz1 = z0 + w / 2; }
      if (dir === '+z') { bz0 = z0 + a; bz1 = z0 + b; bx0 = x0 - w / 2; bx1 = x0 + w / 2; }
      if (dir === '-z') { bz0 = z0 - b; bz1 = z0 - a; bx0 = x0 - w / 2; bx1 = x0 + w / 2; }
      solid(bx0, bx1, y0, top, bz0, bz1, i % 2 ? color : new THREE.Color(color).multiplyScalar(0.92).getHex());
      box((bx0 + bx1) / 2, top + 0.005, (bz0 + bz1) / 2, bx1 - bx0, 0.012, bz1 - bz0, 0xffc93c, 0);
      if (rails) {
        // barandas a los costados
        if (dir.includes('x')) { for (const zz of [bz0, bz1]) { solid(bx0, bx1, top, top + 0.95, zz - 0.04, zz + 0.04, 0x6d6f76, 0, { floor: false, cam: false }); } }
        else { for (const xx of [bx0, bx1]) { solid(xx - 0.04, xx + 0.04, top, top + 0.95, bz0, bz1, 0x6d6f76, 0, { floor: false, cam: false }); } }
      }
    }
    return run;
  };
  const railing = (x0, z0, x1, z1, y) => {
    const len = Math.hypot(x1 - x0, z1 - z0); const n = Math.max(1, Math.round(len / 1.2));
    for (let i = 0; i <= n; i++) { const t = i / n; box(x0 + (x1 - x0) * t, y + 0.5, z0 + (z1 - z0) * t, 0.06, 1.0, 0.06, 0x3a2b4a); }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2; const ry = Math.atan2(x1 - x0, z1 - z0);
    B.add(G.box, 0xffc93c, 0, [cx, y + 1.0, cz], [0, ry, 0], [0.08, 0.07, len]);
    B.add(G.box, 0x3a2b4a, 0, [cx, y + 0.5, cz], [0, ry, 0], [0.03, 0.03, len]);
    P.add(Math.min(x0, x1) - 0.06, Math.max(x0, x1) + 0.06, y, y + 1.05, Math.min(z0, z1) - 0.06, Math.max(z0, z1) + 0.06, { floor: false, cam: false });
  };
  // guirnaldas de luces (instanciadas)
  const bulbs = [];
  const lights = (x0, y0, z0, x1, y1, z1, sag = 0.7, step = 0.6) => {
    const len = Math.hypot(x1 - x0, z1 - z0, y1 - y0); const n = Math.max(2, Math.round(len / step));
    const ang = Math.atan2(x1 - x0, z1 - z0);
    for (let i = 0; i <= n; i++) {
      const t = i / n; const y = y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * sag;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      if (i < n) { const t2 = (i + 1) / n; const y2 = y0 + (y1 - y0) * t2 - Math.sin(t2 * Math.PI) * sag; const seg = len / n; B.add(G.box, 0x2a2a2a, 0, [x + (x1 - x0) / n / 2, (y + y2) / 2, z + (z1 - z0) / n / 2], [-Math.atan2(y2 - y, seg), ang, 0], [0.012, 0.012, seg]); }
      if (i > 0 && i < n) bulbs.push([x, y - 0.08, z]);
    }
  };
  // banderines
  const flagCols = [0xe8384f, 0xffc93c, 0x2f8fd0, 0x3fa34d, 0xff4f8b, 0xffffff, 0x8a4fc7, 0xf07c28];
  const bunting = (x0, y0, z0, x1, y1, z1, sag = 0.6) => {
    const len = Math.hypot(x1 - x0, z1 - z0); const n = Math.max(2, Math.floor(len / 0.5)); const ang = Math.atan2(x1 - x0, z1 - z0);
    for (let i = 0; i <= n; i++) {
      const t = i / n; const y = y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * sag; const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      if (i < n) { const t2 = (i + 1) / n; const y2 = y0 + (y1 - y0) * t2 - Math.sin(t2 * Math.PI) * sag; B.add(G.box, 0x333333, 0, [x + (x1 - x0) / n / 2, (y + y2) / 2, z + (z1 - z0) / n / 2], [-Math.atan2(y2 - y, len / n), ang, 0], [0.01, 0.01, len / n]); }
      if (i > 0 && i < n) B.add(G.cone, flagCols[i % flagCols.length], 0, [x, y - 0.2, z], [Math.PI, ang + Math.PI / 2, 0], [0.17, 0.34, 0.02]);
    }
  };
  // árbol estilizado
  const tree = (x, z, y = 0, s = 1) => {
    box(x, y + 1.0 * s, z, 0.22 * s, 2.0 * s, 0.22 * s, 0x7a5232);
    const greens = [0x4f9a3c, 0x5fae45, 0x3f8a34];
    for (let i = 0; i < 4; i++) B.add(G.ico, greens[i % 3], 0, [x + (rng() - 0.5) * 1.0 * s, y + (2.3 + rng() * 0.8) * s, z + (rng() - 0.5) * 1.0 * s], [rng(), rng(), 0], [0.95 * s, 0.85 * s, 0.95 * s]);
    P.add(x - 0.2, x + 0.2, y, y + 2.2 * s, z - 0.2, z + 0.2, { cam: false });
  };
  const planter = (x, z, w, d, h = 0.5, withTree = true) => {
    solid(x - w / 2, x + w / 2, 0, h, z - d / 2, z + d / 2, 0xc9b79e);
    box(x, h + 0.01, z, w - 0.2, 0.04, d - 0.2, 0x5a3b26);
    if (withTree) tree(x, z, h, 0.9);
    else for (let i = 0; i < 5; i++) B.add(G.ico, [0xe8384f, 0xffc93c, 0xff4f8b, 0xffffff, 0x8a4fc7][i], 0, [x + (rng() - 0.5) * (w - 0.5), h + 0.18, z + (rng() - 0.5) * (d - 0.5)], [0, 0, 0], [0.16, 0.16, 0.16]);
  };
  const bench = (x, z, ry, y = 0) => {
    placeProp('bench', x, y, z, ry, 4.2);
    const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
    P.add(x - (0.9 * c + 0.35 * s), x + (0.9 * c + 0.35 * s), y, y + 0.45, z - (0.35 * c + 0.9 * s), z + (0.35 * c + 0.9 * s), { cam: false });
  };
  const lamp = (x, z, y = 0) => {
    box(x, y + 2.0, z, 0.12, 4.0, 0.12, 0x2b2b33); box(x, y + 0.1, z, 0.35, 0.2, 0.35, 0x2b2b33);
    B.add(G.sphere, 0xfff1c8, 0, [x, y + 4.15, z], [0, 0, 0], [0.22, 0.22, 0.22]);
    bulbs.push([x, y + 4.15, z, 2.2]);
    P.add(x - 0.15, x + 0.15, y, y + 4, z - 0.15, z + 0.15, { cam: false });
  };

  // ======================================================
  // 1) PLAZA CENTRAL con calesita
  // ======================================================
  F.add(TEX.cobble, -11, 11, -13, 13, 0.02, 2.2);
  {
    // calesita
    const car = new THREE.Group(); car.position.set(0, 0, 0); scene.add(car);
    const spin = new THREE.Group(); car.add(spin);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.4, 0.35, 40), new THREE.MeshStandardMaterial({ color: 0xffd8a8, roughness: 0.6 })); base.position.y = 0.175; base.receiveShadow = true; base.castShadow = true; car.add(base);
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.1, 0.06, 40), new THREE.MeshStandardMaterial({ color: 0xc0263e, roughness: 0.5 })); deck.position.y = 0.38; spin.add(deck);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 3.6, 16), new THREE.MeshStandardMaterial({ color: 0xffc93c, metalness: 0.3, roughness: 0.4 })); pole.position.y = 2.2; spin.add(pole);
    const roofTex = canvasTex(512, 64, (g, w, h) => { for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#fff4e0' : '#ff4f8b'; g.fillRect(i * w / 16, 0, w / 16, h); } });
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.7, 1.6, 16, 1, true), new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.6, side: THREE.DoubleSide })); roof.position.y = 4.6; roof.castShadow = true; spin.add(roof);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(3.72, 3.72, 0.35, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0xffc93c, side: THREE.DoubleSide })); rim.position.y = 3.65; spin.add(rim);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), new THREE.MeshStandardMaterial({ color: 0xffc93c, metalness: 0.4, roughness: 0.3 })); top.position.y = 5.55; spin.add(top);
    const horses = [];
    const hcol = [0xffffff, 0x8a4fc7, 0x1fb5a8, 0xf07c28, 0xff4f8b, 0x2f8fd0, 0xffc93c, 0x3fa34d];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2; const hg = new THREE.Group(); hg.position.set(Math.cos(a) * 2.45, 0, Math.sin(a) * 2.45); hg.rotation.y = -a; spin.add(hg);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 3.3, 8), new THREE.MeshStandardMaterial({ color: 0xd9d9d9, metalness: 0.7, roughness: 0.2 })); rod.position.y = 2.05; hg.add(rod);
      const h = new THREE.Group(); hg.add(h);
      const m = new THREE.MeshStandardMaterial({ color: hcol[i], roughness: 0.45 });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.55, 4, 10), m); body.rotation.z = Math.PI / 2; h.add(body);
      const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.3, 4, 8), m); neck.position.set(0.38, 0.25, 0); neck.rotation.z = -0.6; h.add(neck);
      const head = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.22, 4, 8), m); head.position.set(0.55, 0.38, 0); head.rotation.z = Math.PI / 2 - 0.3; h.add(head);
      const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.34), new THREE.MeshStandardMaterial({ color: 0xc0263e })); saddle.position.y = 0.2; h.add(saddle);
      for (const lx of [-0.25, 0.25]) for (const lz of [-0.1, 0.1]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.4, 6), m); l.position.set(lx, -0.3, lz); l.rotation.z = lx > 0 ? -0.4 : 0.4; h.add(l); }
      h.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      horses.push(h);
    }
    W.anim.push((t) => { spin.rotation.y = t * 0.35; horses.forEach((h, i) => { h.position.y = 1.4 + Math.sin(t * 2.2 + i * 1.3) * 0.22; }); });
    P.add(-3.4, 3.4, 0, 5.2, -2.4, 2.4); P.add(-2.4, 2.4, 0, 5.2, -3.4, 3.4);
    bigSign('CALESITA', 0, 6.25, 0, 0, 2.6, 0.65, '#ff4f8b', '#fff4e0', true);
    bigSign('CALESITA', 0, 6.25, 0, Math.PI / 2, 2.6, 0.65, '#ff4f8b', '#fff4e0', true);
    // luces desde la calesita a los faroles
    const lampPos = [[-8.5, -8.5], [8.5, -8.5], [-8.5, 8.5], [8.5, 8.5], [0, -10.5], [0, 10.5], [-10.5, 0], [10.5, 0]];
    for (const [x, z] of lampPos) { lamp(x, z); const d = Math.hypot(x, z); lights(x * 3.6 / d, 3.85, z * 3.6 / d, x, 4.0, z, 0.6); }
    // bancos y canteros
    for (const [x, z, ry] of [[-6, -4.5, Math.PI / 4 + Math.PI / 2], [6, -4.5, -Math.PI / 4 - Math.PI / 2], [-6, 4.5, -Math.PI / 4 + Math.PI / 2], [6, 4.5, Math.PI / 4 - Math.PI / 2]]) bench(x, z, ry);
    planter(-7.2, -11.2, 3.2, 1.6, 0.5, true); planter(7.2, -11.2, 3.2, 1.6, 0.5, true);
    planter(-10.6, 4.5, 1.2, 3, 0.55, false); planter(10.6, 6.0, 1.2, 1.2, 0.55, false);
    // kioscos (diarios y flores)
    const kiosk = (x, z, ry, col, name) => {
      solid(x - 1.1, x + 1.1, 0, 2.3, z - 0.9, z + 0.9, col);
      B.add(G.pyr, col, 4, [x, 2.75, z], [0, Math.PI / 4, 0], [1.75, 0.9, 1.75]);
      bigSign(name, x, 1.9, z + (ry === 0 ? 0.92 : -0.92), ry, 1.8, 0.45, '#fff4e0', '#24112f');
      W.pois.push({ x, z: z + (ry === 0 ? 1.8 : -1.8), y: 0, face: ry === 0 ? Math.PI : 0, kind: 'browse' });
    };
    kiosk(-8.5, -3.2, 0, 0x1fb5a8, 'DIARIOS'); kiosk(8.5, 2.6, 0, 0xff4f8b, 'FLORES');
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.2; W.pois.push({ x: Math.cos(a) * 4.6, z: Math.sin(a) * 4.6, y: 0, face: Math.atan2(-Math.cos(a), -Math.sin(a)), kind: 'look' }); }
  }

  // ======================================================
  // 2) GALPÓN OESTE con entrepiso y escaleras
  // ======================================================
  {
    const gx0 = -30, gx1 = -12.5, gz0 = -15, gz1 = 15;
    F.add(TEX.concrete, gx0, gx1, gz0, gz1, 0.02, 3);
    // columnas
    for (const x of [-29.6, -23.6, -18, -12.8]) for (const z of [-14.7, -7.5, 0, 7.5, 14.7]) { if (x === -18 && Math.abs(z) < 10) continue; solid(x - 0.22, x + 0.22, 0, 7, z - 0.22, z + 0.22, 0x7d4a8f, 0, { floor: false }); }
    // techo traslúcido (no proyecta sombra)
    const roofM = new THREE.Mesh(new THREE.BoxGeometry(gx1 - gx0 + 1.2, 0.12, gz1 - gz0 + 1.2), new THREE.MeshStandardMaterial({ color: 0xdff0fa, emissive: 0xa9c6d8, emissiveIntensity: 0.6, transparent: true, opacity: 0.6, roughness: 0.3, depthWrite: false }));
    roofM.position.set((gx0 + gx1) / 2, 7.1, 0); scene.add(roofM);
    for (const z of [-15, -7.5, 0, 7.5, 15]) box((gx0 + gx1) / 2, 6.95, z, gx1 - gx0 + 1.2, 0.25, 0.25, 0x7d4a8f);
    for (const x of [-29.6, -23.6, -18, -12.8]) box(x, 6.95, 0, 0.25, 0.25, 31, 0x7d4a8f);
    bigSign('GALPÓN DE LA MODA', -12.6, 6.0, 0, Math.PI / 2, 9, 1.6, '#24112f', '#ffc93c');
    box(-12.5, 6.0, 0, 0.1, 1.75, 9.2, 0xffc93c);
    // paredes norte/sur parciales y pared oeste con mural
    solid(gx0, -19.5, 0, 7, gz0 - 0.3, gz0, 0xe9d7c0); solid(gx0, -19.5, 0, 7, gz1, gz1 + 0.3, 0xe9d7c0);
    const mur = [0xff4f8b, 0xffc93c, 0x1fb5a8, 0x8a4fc7, 0xf07c28, 0x2f8fd0];
    for (let i = 0; i < 6; i++) { box(-29.92, 5.1, -12.5 + i * 5, 0.04, 3.4, 4.6, mur[i]); }
    // entrepiso
    const my = 3.2, mx = -23.5;
    solid(gx0, mx, 2.95, my, gz0, gz1, 0x9b6b43);
    F.add(TEX.wood, gx0, mx, gz0, gz1, my + 0.015, 2.4);
    box(mx - 0.05, my - 0.15, 0, 0.1, 0.32, 30, 0xffc93c);
    // baranda del entrepiso (con huecos de escalera)
    railing(mx, gz0, mx, -12.9, my); railing(mx, -9.6, mx, 9.6, my); railing(mx, 12.9, mx, gz1, my);
    // escaleras al entrepiso (suben hacia -x)
    stairs(-17.0, -11.25, '-x', 2.6, 0, my, 13, 0xcbb79c);
    stairs(-17.0, 11.25, '-x', 2.6, 0, my, 13, 0xcbb79c);
    // cartel de escalera
    bigSign('↑ PRIMER PISO', -16.6, 2.2, -11.25, Math.PI / 2, 1.9, 0.48, '#ffc93c', '#24112f');
    bigSign('↑ PRIMER PISO', -16.6, 2.2, 11.25, Math.PI / 2, 1.9, 0.48, '#ffc93c', '#24112f');
    // planta baja: islas de puestos (doble cara, sin toldo exterior, con toldo chico)
    for (const iz of [-4.2, 4.2]) {
      for (let i = 0; i < 3; i++) { const sx = -21.5 + i * 3; stall(sx, iz - 1.4, -1, 0, true); stall(sx, iz + 1.4, 1, 0, true); }
    }
    // bajo el entrepiso: puestos contra la pared oeste (miran a +x)
    for (const z of [-11.5, -5.5, 0.5, 6.5, 12]) {
      table(-28.6, 0, z, Math.PI / 2, 2.4, 0.7); rack(-29.5, 0, z, Math.PI / 2, 2.4, 5);
      P.add(-29.95, -28.2, 0, 1.7, z - 1.3, z + 1.3, { cam: false });
      W.stallFronts.push({ x: -27.2, z, y: 0 }); W.pois.push({ x: -27.2, z, y: 0, face: -Math.PI / 2, kind: 'browse' });
    }
    // arriba: percheros y maniquíes
    for (const z of [-12, -6, 0, 6, 12]) {
      rack(-29.3, my, z, Math.PI / 2, 2.6, 6); P.add(-29.95, -28.9, my, my + 1.7, z - 1.3, z + 1.3, { cam: false });
      W.stallFronts.push({ x: -27.8, z, y: my }); W.pois.push({ x: -27.6, z, y: my, face: -Math.PI / 2, kind: 'browse' });
    }
    for (const z of [-9, -3, 3, 9]) { W.mannequinSpots.push({ x: -25.0, z, y: my, ry: Math.PI / 2 }); P.add(-25.3, -24.7, my, my + 1.7, z - 0.3, z + 0.3, { cam: false }); W.pois.push({ x: -24.2, z: z + 1.2, y: my, face: -Math.PI / 2, kind: 'look' }); }
    // luces del galpón
    for (const z of [-11, -4, 3, 10]) lights(gx0 + 0.5, 6.5, z, gx1, 6.5, z + 1, 1.0, 0.7);
    for (const x of [-27, -21, -15]) bunting(x, 6.6, -14.5, x + 0.5, 6.6, 14.5, 0.9);
  }

  // ======================================================
  // 3) TERRAZA ESTE (patio de comidas elevado)
  // ======================================================
  {
    const tx0 = 13, tx1 = 30, tz0 = -22, tz1 = 3, ty = 1.5;
    solid(tx0, tx1, 0, ty, tz0, tz1, 0xa36f3e);
    F.add(TEX.wood, tx0, tx1, tz0, tz1, ty + 0.015, 2.6);
    box(tx0 - 0.02, ty - 0.1, (tz0 + tz1) / 2, 0.06, 0.18, tz1 - tz0, 0xffc93c);
    // frente de ladrillo
    const brick = new THREE.Mesh(new THREE.PlaneGeometry(tz1 - tz0, ty), new THREE.MeshStandardMaterial({ map: TEX.brick, roughness: 0.9 }));
    TEX.brick.repeat.set(6, 0.6); brick.rotation.y = -Math.PI / 2; brick.position.set(tx0 - 0.01, ty / 2, (tz0 + tz1) / 2); scene.add(brick);
    // escalera desde la plaza (sube hacia +x)
    stairs(10.0, -5.5, '+x', 5, 0, ty, 6, 0xd8c3a5, false);
    // rampa al sur (escalones bajitos, sube hacia -z)
    stairs(26.0, 9.0, '-z', 3.4, 0, ty, 12, 0xc9b79e, true);
    // barandas
    railing(tx0, tz0, tx0, -8.1, ty); railing(tx0, -2.9, tx0, tz1, ty);
    railing(tx0, tz1, 24.2, tz1, ty); railing(27.8, tz1, tx1, tz1, ty);
    // mesas con sombrillas
    const tabs = [[16.5, -17.5], [21, -17.5], [25.5, -17.5], [16.5, -11], [21, -11], [25.5, -11], [18.5, -4.5], [23, -4.5]];
    for (const [x, z] of tabs) {
      placeProp('table_medium', x, ty, z, 0, 0.42);
      placeProp('chair_A', x - 0.75, ty, z, Math.PI / 2, 0.75); placeProp('chair_B', x + 0.75, ty, z, -Math.PI / 2, 0.75);
      placeProp(rng() < 0.5 ? 'food_burger' : 'food_dinner', x, ty + 0.42, z, rng() * 3, 0.35);
      placeProp(rng() < 0.5 ? 'ketchup' : 'mustard', x + 0.25, ty + 0.42, z + 0.2, 0, 0.3);
      P.add(x - 0.55, x + 0.55, ty, ty + 0.75, z - 0.45, z + 0.45, { cam: false });
      box(x, ty + 1.3, z, 0.05, 2.6, 0.05, 0xf4f1ea);
      B.add(G.cone, pick(rng, AWNING), 4, [x, ty + 2.55, z], [0, Math.PI / 6, 0], [1.3, 0.45, 1.3]);
      W.pois.push({ x: x - 1.2, z, y: ty, face: Math.PI / 2, kind: 'look' });
    }
    // food trucks / mostradores
    for (const [x, z, name] of [[28.4, -17, 'CHORIPÁN'], [28.4, -9, 'HELADOS']]) {
      placeProp('kitchentable_A_large_decorated', x, ty, z, -Math.PI / 2, 0.8);
      P.add(x - 1.0, x + 1.6, ty, ty + 2.2, z - 1.6, z + 1.6);
      box(x + 0.8, ty + 1.6, z, 0.1, 3.2, 3.4, 0xfff4e0);
      B.add(G.box, x === 28.4 && z === -17 ? 0xe8384f : 0x2f8fd0, 4, [x - 0.2, ty + 2.95, z], [0, 0, -0.15], [2.4, 0.06, 3.6]);
      bigSign(name, x - 1.1, ty + 2.55, z, -Math.PI / 2, 2.4, 0.6, '#ffc93c', '#24112f');
      W.pois.push({ x: x - 2.2, z, y: ty, face: Math.PI / 2, kind: 'browse' });
    }
    placeProp('crate_tomatoes', 29.2, ty, -13, 0.2, 0.5); placeProp('crate_lettuce', 29.2, ty, -5, -0.3, 0.5); P.add(28.7, 29.8, ty, ty + 0.5, -13.5, -12.5); P.add(28.7, 29.8, ty, ty + 0.5, -5.5, -4.5);
    bigSign('PATIO DE COMIDAS', 21.5, ty + 4.2, -21.6, 0, 6, 1.4, '#ff4f8b', '#fff4e0');
    box(21.5, ty + 4.2, -21.75, 6.2, 1.6, 0.1, 0xfff4e0); box(18.6, ty + 1.7, -21.8, 0.15, 3.4, 0.15, 0x6d6f76); box(24.4, ty + 1.7, -21.8, 0.15, 3.4, 0.15, 0x6d6f76);
    for (const z of [-19, -13, -7, -1]) lights(13.4, ty + 3.6, z, 29.6, ty + 3.6, z + 1, 0.8);
    for (const [x, z] of [[13.4, -21.6], [13.4, 2.6], [29.6, -21.6], [29.6, 2.6], [13.4, -13], [29.6, -9]]) { box(x, ty + 1.9, z, 0.12, 3.8, 0.12, 0x2b2b33); }
  }

  // ======================================================
  // 4) PASAJE DE CARPAS (sureste)
  // ======================================================
  {
    F.add(TEX.tile, 12, 30, 5, 22, 0.02, 2.2);
    const tentCols = [0xe8384f, 0x2f8fd0, 0x3fa34d, 0xf5a818, 0x8a4fc7, 0x1fb5a8, 0xf07c28];
    const tent = (x, z, ry) => {
      const col = pick(rng, tentCols);
      for (const [dx, dz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) box(x + dx, 1.15, z + dz, 0.07, 2.3, 0.07, 0xeeeeee);
      B.add(G.pyr, col, 4, [x, 2.85, z], [0, Math.PI / 4, 0], [2.05, 1.1, 2.05]);
      B.add(G.pyr, 0xffffff, 0, [x, 2.3, z], [Math.PI, Math.PI / 4, 0], [1.84, 0.01, 1.84]);
      // valance
      for (const s of [-1, 1]) { box(x, 2.18, z + s * 1.35, 2.75, 0.22, 0.03, col, 4); box(x + s * 1.35, 2.18, z, 0.03, 0.22, 2.75, col, 4); }
      const c = Math.cos(ry), sn = Math.sin(ry);
      table(x + sn * 0.6, 0, z + c * 0.6, ry, 2.2, 0.6);
      rack(x - sn * 0.7, 0, z - c * 0.7, ry, 2.2, 5);
      P.add(x - 1.35, x + 1.35, 0, 2.2, z - 1.35, z + 1.35, { cam: false });
      const fx = x + sn * 2.0, fz = z + c * 2.0;
      W.stallFronts.push({ x: fx, z: fz, y: 0 }); W.pois.push({ x: fx, z: fz, y: 0, face: ry + Math.PI, kind: 'browse' });
      addSign(x + sn * 1.37, 1.95, z + c * 1.37, ry, 1.6, 0.4);
    };
    for (const z of [12.5, 18.5]) for (const x of [15.2, 19.6, 24.0, 28.0]) tent(x, z, z < 15 ? 0 : Math.PI);
    for (const x of [15.2, 19.6]) tent(x, 7.6, Math.PI);
    bunting(13, 3.1, 15.5, 29.5, 3.1, 15.6, 0.5); bunting(13, 3.1, 9.9, 23.5, 3.1, 9.9, 0.5);
    bigSign('PASAJE DE LAS CARPAS', 21.5, 3.3, 21.8, Math.PI, 5.5, 1.1, '#1fb5a8', '#fff4e0');
  }

  // ======================================================
  // 5) GALERÍA NORTE con vidrieras y probadores
  // ======================================================
  {
    const gz = -17.5;
    // bloque de locales con nichos de vidriera
    const shops = [[-12, -6.6, 'MODA'], [3.4, 12, 'ZAPAS']];
    for (const [x0, x1, name] of shops) {
      solid(x0, x1, 0, 4.4, -22, gz - 0.9, 0xf6e7d2);
      box((x0 + x1) / 2, 2.0, gz - 0.45, x1 - x0, 0.25, 0.9, 0xcbb79c);
      box((x0 + x1) / 2, 4.05, gz - 0.45, x1 - x0, 0.7, 0.9, 0x24112f);
      P.add(x0, x1, 0, 4.4, gz - 0.9, gz, { floor: false });
      for (let i = 0; i < 2; i++) { const mx = x0 + (x1 - x0) * (0.27 + i * 0.46); W.mannequinSpots.push({ x: mx, z: gz - 0.45, y: 0.15, ry: 0, inside: true }); W.pois.push({ x: mx, z: gz + 1.4, y: 0, face: Math.PI, kind: 'look' }); }
      B.add(G.box, 0xff4f8b, 4, [(x0 + x1) / 2, 4.55, gz + 0.5], [-0.35, 0, 0], [x1 - x0, 0.05, 1.4]);
      bigSign(name, (x0 + x1) / 2, 4.05, gz + 0.01, 0, 3, 0.62, '#24112f', '#ffc93c');
      const glass = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 - 0.2, 3.0, 0.04), new THREE.MeshStandardMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.2, roughness: 0.05, metalness: 0.3, depthWrite: false }));
      glass.position.set((x0 + x1) / 2, 1.9, gz); scene.add(glass);
    }
    // probadores (centro)
    solid(-6.6, 3.4, 0, 4.4, -22, -20.2, 0xf6e7d2);
    let id = 0;
    for (let i = 0; i < 4; i++) {
      const x = -5.35 + i * 2.5, z = -18.9;
      solid(x - 1.25, x - 1.13, 0, 2.6, -20.2, gz, 0xf1e3cc); if (i === 3) solid(x + 1.13, x + 1.25, 0, 2.6, -20.2, gz, 0xf1e3cc);
      box(x, 2.68, -18.85, 2.5, 0.16, 2.7, 0x8a4fc7);
      box(x, 1.3, -20.1, 0.7, 1.5, 0.03, 0xdbe9f5); box(x, 1.3, -20.12, 0.8, 1.6, 0.02, 0xc9a24a);
      box(x, 2.45, gz, 2.2, 0.04, 0.04, 0xc9a24a);
      const curtain = makeCurtain([0xc0263e, 0x2f5fd0, 0x3fa34d, 0xf07c28][i]);
      curtain.position.set(x, 1.2, gz); scene.add(curtain);
      W.booths.push({ id: id++, x, z, y: 0, dir: 1, doorX: x, doorZ: gz + 1.0, curtain, open: 1 });
      P.add(x - 1.1, x + 1.1, 0, 2.5, -20.2, -20.0, { floor: false });
    }
    solid(3.4 - 0.12, 3.4, 0, 2.6, -20.2, gz, 0xf1e3cc);
    bigSign('PROBADORES', -1.1, 3.6, gz + 0.02, 0, 4.6, 1.1, '#8a4fc7', '#fff4e0');
    box(-1.1, 3.6, gz - 0.02, 4.8, 1.25, 0.04, 0xfff4e0);
    bunting(-12, 4.4, -15.2, 12, 4.4, -15.2, 0.4);
  }

  // ======================================================
  // 6) ESCENARIO SUR
  // ======================================================
  {
    const sx0 = -6, sx1 = 6, sz0 = 15, sz1 = 20.5, sy = 1.25;
    solid(sx0, sx1, 0, sy, sz0, sz1, 0x3a2b4a);
    F.add(TEX.wood, sx0, sx1, sz0, sz1, sy + 0.015, 2);
    box(0, sy - 0.12, sz0 - 0.02, 12, 0.2, 0.04, 0xffc93c);
    stairs(-8.5, 17.3, '+x', 2.2, 0, sy, 5, 0x5a4870, true);
    stairs(8.5, 17.3, '-x', 2.2, 0, sy, 5, 0x5a4870, true);
    // fondo y torres de parlantes
    solid(-6.5, 6.5, sy, sy + 4.6, 20.5, 21, 0x24112f, 0, { floor: false });
    bigSign('GRAN FERIA', 0, sy + 3.4, 20.45, Math.PI, 7.5, 1.8, '#24112f', '#ffc93c');
    for (const x of [-5.2, 5.2]) { solid(x - 0.55, x + 0.55, sy, sy + 2.4, 19.2, 20.3, 0x1a1a20); for (let k = 0; k < 2; k++) { box(x, sy + 0.7 + k * 1.1, 19.18, 0.6, 0.6, 0.02, 0x333340); B.add(G.cyl, 0x111114, 0, [x, sy + 0.7 + k * 1.1, 19.16], [Math.PI / 2, 0, 0], [0.22, 0.02, 0.22]); } }
    // truss con luces
    for (const x of [-6.3, 6.3]) box(x, sy + 2.6, 15.2, 0.2, 5.2, 0.2, 0x8d8f96);
    box(0, sy + 5.2, 15.2, 12.8, 0.2, 0.2, 0x8d8f96);
    for (let i = 0; i < 7; i++) { const x = -4.5 + i * 1.5; B.add(G.cyl, [0xff4f8b, 0xffc93c, 0x1fb5a8][i % 3], 0, [x, sy + 4.9, 15.2], [0.5, 0, 0], [0.16, 0.3, 0.16]); bulbs.push([x, sy + 4.75, 15.35, 1.6]); }
    W.pois.push({ x: -2, z: 17.5, y: sy, face: Math.PI, kind: 'dance' }); W.pois.push({ x: 2, z: 17.5, y: sy, face: Math.PI, kind: 'dance' });
    for (let i = 0; i < 6; i++) W.pois.push({ x: -5 + i * 2, z: 12.6 + (i % 2) * 0.8, y: 0, face: 0, kind: 'look' });
    F.add(TEX.tile, -12, 12, 13, 22, 0.02, 3);
  }

  // ======================================================
  // 7) PARQUE SUROESTE con mirador
  // ======================================================
  {
    F.add(TEX.grass, -30, -12.5, 15.3, 22, 0.02, 4);
    const dy = 0.9;
    solid(-28.5, -22, 0, dy, 17, 21.5, 0x8a5a33);
    F.add(TEX.wood, -28.5, -22, 17, 21.5, dy + 0.015, 2);
    stairs(-20, 19.2, '-x', 2.4, 0, dy, 4, 0x9b6b43, false);
    railing(-28.5, 17, -22, 17, dy); railing(-22, 17, -22, 18, dy); railing(-22, 20.4, -22, 21.5, dy);
    tree(-25.5, 19.2, dy, 1.1);
    for (const [x, z] of [[-16, 18], [-14, 21], [-19.5, 21.2], [-29, 16.2]]) tree(x, z, 0, 1.0 + rng() * 0.3);
    bench(-17, 16.5, 0); bench(-24.5, 16.2, 0);
    W.pois.push({ x: -26.5, z: 18.2, y: dy, face: 0, kind: 'look' }); W.pois.push({ x: -16, z: 19.5, y: 0, face: Math.PI / 2, kind: 'look' });
    for (let i = 0; i < 7; i++) B.add(G.ico, [0xe8384f, 0xffc93c, 0xff4f8b, 0xffffff, 0x8a4fc7][i % 5], 0, [-18 + (rng() - 0.5) * 6, 0.15, 19 + (rng() - 0.5) * 3], [0, 0, 0], [0.11, 0.11, 0.11]);
  }

  // ======================================================
  // 8) DEPÓSITO NOROESTE (cajones para trepar)
  // ======================================================
  {
    F.add(TEX.concrete, -30, -12.5, -22, -15.3, 0.02, 3);
    // contenedor
    solid(-29.6, -23.6, 0, 2.6, -21.6, -19.2, 0x2f8fd0);
    for (let i = 0; i < 12; i++) box(-29.5 + i * 0.5, 1.3, -19.17, 0.06, 2.4, 0.04, 0x2668ad);
    // pila de cajones (escalones para saltar)
    const crate = (x, z, y, s = 0.9) => { const h = s * 0.8; solid(x - s / 2, x + s / 2, y, y + h, z - s / 2, z + s / 2, 0xb98a55); for (const d of [-1, 1]) { box(x, y + h / 2, z + d * (s / 2 + 0.005), s * 0.96, 0.08, 0.01, 0x8a5a33); box(x + d * (s / 2 + 0.005), y + h / 2, z, 0.01, 0.08, s * 0.96, 0x8a5a33); } box(x, y + h + 0.015, z, s * 0.9, 0.02, s * 0.9, 0xc89a62); };
    crate(-21.5, -18.6, 0, 1.2); crate(-22.8, -18.8, 0, 1.2); crate(-22.8, -18.8, 0.96, 1.2); crate(-24.0, -18.6, 0, 1.2); crate(-24.0, -18.6, 0.96, 1.2); crate(-24.0, -18.6, 1.92, 1.0);
    placeProp('dumpster', -16, 0, -20.8, 0, 4.0); P.add(-17.3, -14.7, 0, 1.45, -21.6, -20.0);
    for (const [x, z] of [[-19, -21], [-14, -17]]) { placeProp('box_A', x, 0, z, 0.3, 4.4); P.add(x - 0.45, x + 0.45, 0, 0.78, z - 0.45, z + 0.45); }
    bigSign('DEPÓSITO', -26.6, 3.2, -19.15, 0, 3, 0.7, '#ffc93c', '#24112f');
    W.pois.push({ x: -26.5, z: -18.2, y: 2.6, face: Math.PI, kind: 'look' });
  }

  // banderines generales
  bunting(-12, 4.2, -14.8, -12, 4.2, 14.8, 0.6);
  bunting(12, 4.2, 4.5, 12, 4.2, 14.5, 0.6);

  // ---------- construir mallas ----------
  for (const m of B.build(mat)) scene.add(m);
  for (const { mat: pm, geos } of texBatches.values()) {
    const merged = mergeGeometries(geos, false);
    const mm = pm.clone(); mm.roughness = 0.75; mm.metalness = 0;
    const mesh = new THREE.Mesh(merged, mm); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
    geos.forEach((g) => g.dispose());
  }
  F.build(scene);
  if (signGeos.length) { const sm = new THREE.Mesh(mergeGeometries(signGeos, false), new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.6 })); sm.receiveShadow = true; scene.add(sm); }
  // focos de luz (instanciados, brillan con bloom)
  {
    const bm = new THREE.MeshBasicMaterial({ color: 0xffd27a, toneMapped: false });
    bm.color.setRGB(1.7, 1.25, 0.6);
    const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 8, 6), bm, bulbs.length);
    const m4 = new THREE.Matrix4();
    bulbs.forEach((b, i) => { const s = b[3] || 1; m4.makeScale(s, s, s); m4.setPosition(b[0], b[1], b[2]); inst.setMatrixAt(i, m4); });
    scene.add(inst); W.bulbs = inst;
  }
  // maniquíes decorativos
  W.mannequins = [];
  const mrng = mulberry32(99);
  for (const s of W.mannequinSpots) {
    const ch = new Character(randomLook(mrng), { mannequin: true, shadow: true });
    ch.root.position.set(s.x, s.y || 0, s.z); ch.root.rotation.y = s.ry;
    ch.update(1, 'mannequin', 0, 0, { snap: true });
    scene.add(ch.root); W.mannequins.push(ch);
  }

  function makeCurtain(color) {
    const geo = new THREE.PlaneGeometry(2.2, 2.4, 40, 1);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, Math.sin(x * 14) * 0.05); p.setX(i, x + 1.1); }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide }));
    const g = new THREE.Group(); m.position.x = -1.1; g.add(m); m.castShadow = true; g.userData.cloth = m; return g;
  }

  // ---------- red de caminos ----------
  const floorsAt = (x, z) => {
    const ys = new Set([0]);
    for (const b of P.near(x, z, 0)) if (b.floor && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && b.y1 > 0.05 && b.y1 < 4) ys.add(Math.round(b.y1 * 1000) / 1000);
    return [...ys];
  };
  W.nav = buildNav(P, floorsAt, 1.25);
  // ubicar puntos de interés en la red
  const okNodes = W.nav.nodes.map((n, i) => (n.ok ? i : -1)).filter((i) => i >= 0);
  W.pois = W.pois.filter((p) => !P.blocked(p.x, p.z, p.y, 0.3) && Math.abs(P.groundAt(p.x, p.z, p.y) - p.y) < 0.05);
  const spotRng = mulberry32(555);
  const pickNodes = (n, minDist) => { const out = []; const order = shuffle(spotRng, okNodes.slice()); for (const i of order) { const nd = W.nav.nodes[i]; if (Math.hypot(nd.x, nd.z) < 4.2) continue; if (out.some((o) => Math.hypot(o.x - nd.x, o.z - nd.z) < minDist)) continue; out.push({ x: nd.x, z: nd.z, y: nd.y }); if (out.length >= n) break; } return out; };
  W.spawns = pickNodes(24, 5);
  W.itemSpots = pickNodes(30, 4.5);
  return W;
}

// compatibilidad: deslizar contra paredes en el piso
export function blobTex() { return blobTexture(); }
