// Mapa "Shopping": dos pisos cerrados con patio central, locales con vidrieras, pasillos de servicio,
// probadores, laberinto de góndolas, patio de juegos, cine y patio de comidas.
import * as THREE from 'three';
import { makeKit, PAT, skyMesh, canvasTex } from './kit.js';

const L1 = 4.2;          // altura del primer piso
const ROOF = 8.4;        // techo
const BOUNDS = { x0: -26, x1: 26, z0: -20, z1: 20 };

export function buildShopping(root, gltf) {
  const K = makeKit(root, gltf, { bounds: BOUNDS, levels: [0, L1, 99], seed: 4242 });
  const { W, P, solid, box, add, wallX, wallZ, bigSign, rack, roundRack, table, shelf, counter, plant, palm, bench, sofa, column, lightPanel, spot, stairs, railing, crate, cardbox, booths, mannequin, poi, rug, placeProp, poster, rng } = K;
  W.id = 'shopping'; W.hdr = 'quarry_01_1k.hdr';
  const glass = []; // [x0,x1,y0,y1,z0,z1]
  const addGlass = (x0, x1, y0, y1, z0, z1) => { glass.push([x0, x1, y0, y1, z0, z1]); P.add(x0, x1, y0, y1, z0, z1, { floor: false }); };

  // ---------- luz ----------
  const sky = skyMesh([-0.35, 0.78, 0.3]); root.add(sky); W.sky = sky;
  W.fog = { color: 0xf3e7d8, near: 45, far: 140 };
  const hemi = new THREE.HemisphereLight(0xf4ecff, 0xc9b49a, 0.62); root.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe2bc, 2.2);
  sun.position.set(-18, 42, 22); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -34; sc.right = 34; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 110;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  root.add(sun); root.add(sun.target); W.sun = sun;
  const fill = new THREE.DirectionalLight(0xcfe0ff, 0.35); fill.position.set(20, 15, -25); root.add(fill);

  // ---------- estructura ----------
  const WALL = 0xf2e6d4, TRIM = 0x3a2b4a, CEIL = 0xfbf6ee;
  // paredes exteriores (dos pisos) con ventanales que brillan
  solid(-26, 26, 0, ROOF, -20, -19.6, WALL, PAT.PLASTER); solid(-26, 26, 0, ROOF, 19.6, 20, WALL, PAT.PLASTER);
  solid(-26, -25.6, 0, ROOF, -20, 20, WALL, PAT.PLASTER); solid(25.6, 26, 0, ROOF, -20, 20, WALL, PAT.PLASTER);
  for (const y of [1.0, L1 + 1.0]) {
    for (let z = -16; z <= 16; z += 6) { box(-25.58, y + 1.2, z, 0.04, 2.0, 3.6, 0xcfe6ff, PAT.GLOW); box(-25.56, y + 1.2, z, 0.06, 2.2, 0.08, TRIM, PAT.METAL); box(25.58, y + 1.2, z, 0.04, 2.0, 3.6, 0xcfe6ff, PAT.GLOW); box(25.56, y + 1.2, z, 0.06, 2.2, 0.08, TRIM, PAT.METAL); }
  }
  // zócalo
  for (const [x, z, sx, sz] of [[0, -19.55, 51.2, 0.1], [0, 19.55, 51.2, 0.1], [-25.55, 0, 0.1, 39.2], [25.55, 0, 0.1, 39.2]]) { box(x, 0.12, z, sx, 0.24, sz, TRIM, PAT.WOOD); box(x, L1 + 0.12, z, sx, 0.24, sz, TRIM, PAT.WOOD); }

  // losa del primer piso (deja libre el patio central y los huecos de escalera)
  const slab = (x0, x1, z0, z1) => { solid(x0, x1, L1 - 0.3, L1, z0, z1, CEIL, PAT.PLASTER, { noShadow: true }); };
  slab(-26, 14, -20, -6); slab(14, 21, -20, -15.8); slab(14, 21, -13.2, -6); slab(21, 26, -20, -6);
  slab(-26, 14, 6, 20); slab(14, 21, 15.8, 20); slab(14, 21, 6, 13.2); slab(21, 26, 6, 20);
  slab(-26, -8, -6, 6); slab(8, 26, -6, 6);
  slab(-8, 8, -1.2, 1.2); // puente sobre el patio
  // techo con claraboya sobre el patio
  const roof = (x0, x1, z0, z1) => solid(x0, x1, ROOF, ROOF + 0.25, z0, z1, CEIL, PAT.PLASTER, { noShadow: true });
  roof(-26, 26, -20, -6); roof(-26, 26, 6, 20); roof(-26, -8, -6, 6); roof(8, 26, -6, 6);
  for (let x = -8; x <= 8; x += 2) box(x, ROOF + 0.1, 0, 0.18, 0.3, 12, 0xffffff, PAT.METAL);   // vigas (proyectan sombra rayada)
  for (let z = -6; z <= 6; z += 3) box(0, ROOF + 0.1, z, 16, 0.3, 0.18, 0xffffff, PAT.METAL);
  // paneles de luz en el techo de los pasillos
  for (const y of [L1 - 0.32, ROOF - 0.02]) {
    for (let x = -10; x <= 10; x += 5) { lightPanel(x, y, -8, 2.4, 0.6); lightPanel(x, y, 8, 2.4, 0.6); }
    for (const x of [-10, 10]) for (let z = -4; z <= 4; z += 4) lightPanel(x, y, z, 0.6, 2.4);
    // grilla de luces en locales y alas
    for (let x = -22; x <= 22; x += 5.5) for (let z = -16.5; z <= 16.5; z += 5.5) {
      if (Math.abs(x) < 13 && Math.abs(z) < 10.5) continue;
      if (x > 13 && x < 22 && Math.abs(Math.abs(z) - 14.5) < 2) continue;
      lightPanel(x, y, z, 1.4, 1.4);
    }
    for (const x of [-8, 0, 8]) for (const z of [-14, 14]) lightPanel(x, y, z, 1.6, 1.6);
  }

  // ---------- pisos ----------
  const floor = (x0, x1, z0, z1, y, color, pat) => box((x0 + x1) / 2, y + 0.006, (z0 + z1) / 2, x1 - x0, 0.012, z1 - z0, color, pat, 0, true);
  floor(-8, 8, -6, 6, 0, 0xefe6d8, PAT.MARBLE);
  for (const [x0, x1, z0, z1] of [[-12, 12, -10, -6], [-12, 12, 6, 10], [-12, -8, -6, 6], [8, 12, -6, 6]]) { floor(x0, x1, z0, z1, 0, 0xe2d6c4, PAT.BIGTILE); floor(x0, x1, z0, z1, L1, 0xe2d6c4, PAT.BIGTILE); }
  floor(-8, 8, -1.2, 1.2, L1, 0xd9c7ae, PAT.WOOD);
  // guarda de color alrededor del patio
  for (const [x, z, sx, sz] of [[0, -6.1, 16.4, 0.2], [0, 6.1, 16.4, 0.2], [-8.1, 0, 0.2, 12.4], [8.1, 0, 0.2, 12.4]]) box(x, 0.014, z, sx, 0.012, sz, 0xc9a24a, PAT.METAL, 0, true);

  // ======================================================
  // PATIO CENTRAL: fuente, palmeras, percha gigante colgante
  // ======================================================
  {
    add('cyl24', 0xe8dccb, PAT.MARBLE, [0, 0.28, 0], [0, 0, 0], [2.3, 0.56, 2.3]);
    add('cyl24', 0x3fa9c9, PAT.GLOW, [0, 0.5, 0], [0, 0, 0], [2.05, 0.04, 2.05]);
    P.add(-2.1, 2.1, 0, 0.56, -1.2, 1.2); P.add(-1.2, 1.2, 0, 0.56, -2.1, 2.1); P.add(-1.7, 1.7, 0, 0.56, -1.7, 1.7);
    // agua animada
    const water = new THREE.Mesh(new THREE.CircleGeometry(2.0, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5cc6e0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.75 }));
    water.position.y = 0.53; root.add(water);
    W.anim.push((t) => { water.material.opacity = 0.7 + Math.sin(t * 2) * 0.05; });
    // percha gigante colgando del techo (el logo)
    const hg = new THREE.Group(); hg.position.set(0, 6.3, 0); root.add(hg);
    const gold = new THREE.MeshStandardMaterial({ color: 0xe0b03a, metalness: 0.85, roughness: 0.25 });
    const tri = new THREE.Shape(); tri.moveTo(-2.4, 0); tri.lineTo(2.4, 0); tri.lineTo(0, 1.4); tri.lineTo(-2.4, 0);
    const pts = [new THREE.Vector3(-2.3, 0, 0), new THREE.Vector3(2.3, 0, 0), new THREE.Vector3(0, 1.35, 0), new THREE.Vector3(-2.3, 0, 0)];
    for (let i = 0; i < 3; i++) { const a = pts[i], b = pts[i + 1]; const len = a.distanceTo(b); const m = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, len, 10), gold); m.position.copy(a).add(b).multiplyScalar(0.5); m.lookAt(b); m.rotateX(Math.PI / 2); m.castShadow = true; hg.add(m); }
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.08, 10, 24, Math.PI * 1.3), gold); hook.position.set(0.05, 1.7, 0); hook.rotation.z = -0.5; hook.castShadow = true; hg.add(hook);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.6, 4), new THREE.MeshStandardMaterial({ color: 0x222222 })); cable.position.y = 2.75; hg.add(cable);
    // cartel colgado de la percha
    const tagT = canvasTex(512, 256, (g, w, h) => { g.fillStyle = '#fff4e0'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ff4f8b'; g.lineWidth = 16; g.strokeRect(10, 10, w - 20, h - 20); g.fillStyle = '#24112f'; g.font = '700 120px "Bagel Fat One","Arial Black",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SALE', w / 2, h / 2 + 8); });
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshStandardMaterial({ map: tagT, side: THREE.DoubleSide, roughness: 0.6 })); tag.position.set(0, -0.6, 0); hg.add(tag);
    W.anim.push((t) => { hg.rotation.y = t * 0.25; hg.position.y = 6.3 + Math.sin(t * 0.8) * 0.08; });
    // palmeras en macetones
    for (const [x, z] of [[-6.4, -4.4], [6.4, -4.4], [-6.4, 4.4], [6.4, 4.4]]) {
      solid(x - 0.75, x + 0.75, 0, 0.6, z - 0.75, z + 0.75, 0xc9b79e, PAT.PLASTER); box(x, 0.61, z, 1.3, 0.02, 1.3, 0x4a3020);
      palm(x, z, 0.6);
    }
    // bancos alrededor de la fuente
    for (const [x, z, ry] of [[0, -3.6, 0], [0, 3.6, Math.PI], [-3.7, 0, Math.PI / 2], [3.7, 0, -Math.PI / 2]]) bench(x, z, ry, 0, 0x8a5a33);
    // kioscos chicos
    const kiosk = (x, z, col, name) => {
      solid(x - 0.9, x + 0.9, 0, 1.15, z - 0.6, z + 0.6, col, PAT.PLASTER); box(x, 1.18, z, 1.9, 0.06, 1.3, 0xece6dc, PAT.MARBLE);
      for (const dx of [-0.8, 0.8]) box(x + dx, 1.9, z, 0.06, 1.5, 0.06, 0xc9a24a, PAT.METAL);
      add('box', col, PAT.AWN, [x, 2.7, z], [0, 0, 0], [2.0, 0.08, 1.4]); bigSign(name, x, 2.35, z + 0.66, 0, 1.7, 0.4, '#fff4e0', '#24112f', true);
      for (let i = 0; i < 6; i++) box(x - 0.6 + i * 0.24, 1.32, z, 0.16, 0.22, 0.16, K.clothColor(), PAT.FABRIC);
    };
    kiosk(-5.2, 0, 0xff4f8b, 'BIJOU'); kiosk(5.2, 0, 0x1fb5a8, 'LENTES');
    // guirnaldas de luces sobre el patio
    for (let i = 0; i < 7; i++) { const x = -6 + i * 2; for (let k = 1; k < 12; k++) { const z = -6 + k; spot(x, 7.6 - Math.sin((k / 12) * Math.PI) * 0.8, z, 0.9); } }
    bigSign('PROBADOR SHOPPING', 0, 7.1, -6.15, 0, 9, 1.1, '#24112f', '#ffc93c', false, true);
    bigSign('GRAN LIQUIDACIÓN', 0, 7.1, 6.15, Math.PI, 8, 1.0, '#ff4f8b', '#fff4e0', false, true);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.3; poi(Math.cos(a) * 3.0, Math.sin(a) * 3.0, 0, Math.atan2(-Math.cos(a), -Math.sin(a))); }
  }

  // ======================================================
  // FRENTES DE LOCALES (vidrieras)
  // face: +1 el frente mira a +z (locales del lado norte), -1 mira a -z (lado sur)
  // ======================================================
  const front = (x0, x1, z, y, doorX, face, name, bg, fg, h = 3.9) => {
    const th = 0.3; const zz0 = z - th / 2, zz1 = z + th / 2;
    solid(x0, x0 + 0.35, y, y + h, zz0, zz1, WALL, PAT.PLASTER); solid(x1 - 0.35, x1, y, y + h, zz0, zz1, WALL, PAT.PLASTER);
    solid(x0, x1, y + 3.0, y + h, zz0, zz1, bg, PAT.PLASTER, { floor: false });
    const d0 = doorX - 1.4, d1 = doorX + 1.4;
    for (const [a, b] of [[x0 + 0.35, d0], [d1, x1 - 0.35]]) {
      if (b - a < 0.1) continue;
      solid(a, b, y, y + 0.5, zz0, zz1, TRIM, PAT.MARBLE, { floor: false });
      addGlass(a, b, y + 0.5, y + 3.0, z - 0.04, z + 0.04);
      box((a + b) / 2, y + 3.0, z, b - a, 0.08, 0.12, 0xc9a24a, PAT.METAL);
    }
    for (const dx of [d0, d1]) box(dx, y + 1.5, z, 0.1, 3.0, 0.32, 0xc9a24a, PAT.METAL);
    bigSign(name, (x0 + x1) / 2, y + 3.45, z + face * (th / 2 + 0.02), face > 0 ? 0 : Math.PI, Math.min(5.5, x1 - x0 - 1.2), 0.7, bg === TRIM ? '#24112f' : '#' + new THREE.Color(bg).getHexString(), fg, false, true);
    rug(doorX, z + face * 1.2, y, 2.6, 1.6, new THREE.Color(bg).multiplyScalar(0.8).getHex());
  };

  // ======================================================
  // PLANTA BAJA — locales del lado norte (z -17.5..-10)
  // ======================================================
  const NZ0 = -17.5, NZ1 = -10;
  wallX(-12, 12, NZ0, 0, L1 - 0.3, 0.25, 0xe9dccb, PAT.PLASTER, [[-6.2, -4.8], [1.5, 2.9], [9.2, 10.6]]); // fondo con puertas al pasillo de servicio
  wallZ(NZ0, NZ1, -4, 0, L1 - 0.3, 0.25, 0xe9dccb, PAT.PLASTER, [[-16.6, -15.0]]);
  wallZ(NZ0, NZ1, 4, 0, L1 - 0.3, 0.25, 0xe9dccb, PAT.PLASTER);
  wallZ(NZ0, NZ1, -12, 0, L1 - 0.3, 0.3, WALL, PAT.PLASTER);
  wallZ(NZ0, NZ1, 12, 0, L1 - 0.3, 0.3, WALL, PAT.PLASTER);
  front(-12, -4, NZ1, 0, -8, 1, 'LA PERCHA', 0xff4f8b, '#fff4e0');
  front(-4, 4, NZ1, 0, 0, 1, 'JEANERÍA', 0x2f5fd0, '#fff4e0');
  front(4, 12, NZ1, 0, 8, 1, 'ZAPAS', 0xffc93c, '#24112f');
  // LA PERCHA (ropa de mujer)
  floor(-12, -4, NZ0, NZ1, 0, 0xb98a5a, PAT.WOOD);
  rack(-10.6, 0, -14.4, Math.PI / 2, 2.0, 5); rack(-5.4, 0, -14.4, Math.PI / 2, 2.0, 5);
  roundRack(-9.6, -12.6); roundRack(-6.4, -12.6);
  mannequin(-11.3, -11.0, 0, Math.PI * 0.75); mannequin(-4.7, -11.0, 0, -Math.PI * 0.75);
  counter(-8, 0, -16.6, 0, 2.6, 0xff4f8b); poi(-8, -14, 0, Math.PI, 'browse');
  for (const x of [-10, -6]) spot(x, L1 - 0.4, -14, 1.1);
  // JEANERÍA (góndolas con jeans doblados)
  floor(-4, 4, NZ0, NZ1, 0, 0x9a8f86, PAT.TILE);
  shelf(-2.2, 0, -15.6, 0, 2.6, 2.1, 0xdfe7f2); shelf(2.2, 0, -15.6, 0, 2.6, 2.1, 0xdfe7f2);
  table(-1.6, 0, -12.5, 0, 2.0, 0.8, 0x6b4a2f); table(1.8, 0, -12.5, Math.PI / 2, 1.6, 0.8, 0x6b4a2f);
  mannequin(3.3, -11.0, 0, -Math.PI * 0.8); poi(0, -13.8, 0, Math.PI, 'browse');
  poster(-3.86, 2.2, -13.8, Math.PI / 2, 1.4, 1.9, (g, w, h) => { g.fillStyle = '#2f5fd0'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff4e0'; g.font = '700 54px "Bagel Fat One",sans-serif'; g.textAlign = 'center'; g.fillText('2x1', w / 2, h * 0.45); g.font = '700 26px sans-serif'; g.fillText('EN JEANS', w / 2, h * 0.62); });
  // ZAPAS (paredes de cajas, bancos)
  floor(4, 12, NZ0, NZ1, 0, 0x3a3f4a, PAT.CARPET);
  shelf(6.2, 0, -16.9, 0, 3.4, 2.4, 0x24242c); shelf(11.55, 0, -13.8, Math.PI / 2, 3.2, 2.4, 0x24242c);
  bench(6.5, -12.6, 0, 0, 0xffc93c); bench(9.8, -12.6, 0, 0, 0xffc93c);
  for (let i = 0; i < 5; i++) cardbox(5.0 + i * 1.6, -14.6, 0, 0.5, rng());
  spot(8, L1 - 0.4, -14, 1.1);

  // ======================================================
  // PLANTA BAJA — locales del lado sur (z 10..17.5)
  // ======================================================
  const SZ0 = 10, SZ1 = 17.5;
  wallX(-12, 12, SZ1, 0, L1 - 0.3, 0.25, 0xe9dccb, PAT.PLASTER, [[-10.6, -9.2], [-2.9, -1.5], [10.2, 11.6]]);
  wallZ(SZ0, SZ1, -4, 0, L1 - 0.3, 0.25, 0xe9dccb, PAT.PLASTER);
  wallZ(SZ0, SZ1, 4, 0, L1 - 0.3, 0.25, 0xe9dccb, PAT.PLASTER, [[15.0, 16.6]]);
  wallZ(SZ0, SZ1, -12, 0, L1 - 0.3, 0.3, WALL, PAT.PLASTER);
  wallZ(SZ0, SZ1, 12, 0, L1 - 0.3, 0.3, WALL, PAT.PLASTER);
  front(-12, -4, SZ0, 0, -8, -1, 'PERFUMES', 0x8a4fc7, '#fff4e0');
  front(-4, 4, SZ0, 0, 0, -1, 'DEPORTES', 0x3fa34d, '#fff4e0');
  front(4, 12, SZ0, 0, 8, -1, 'OUTLET', 0xe8384f, '#fff4e0');
  // PERFUMES (vitrinas brillantes)
  floor(-12, -4, SZ0, SZ1, 0, 0xf4eee6, PAT.MARBLE);
  for (const [x, z] of [[-10, 13.4], [-6, 13.4]]) { counter(x, 0, z, 0, 2.2, 0xffffff); for (let i = 0; i < 5; i++) add('cyl', [0xff8fc4, 0xb98af0, 0xffd45c, 0x7ee8ff, 0xff7a66][i], PAT.GLOW, [x - 0.8 + i * 0.4, 1.32, z], [0, 0, 0], [0.07, 0.24, 0.07]); }
  shelf(-6.6, 0, 16.9, Math.PI, 3.0, 2.2, 0xffffff); poi(-8, 12.0, 0, 0, 'browse');
  mannequin(-11.2, 11.0, 0, Math.PI * 0.2);
  // DEPORTES (pelotas, bicis = cajas)
  floor(-4, 4, SZ0, SZ1, 0, 0x3fa34d, PAT.CARPET);
  for (let i = 0; i < 4; i++) rack(-2.4 + i * 1.6, 0, 15.6, Math.PI / 2, 1.8, 4);
  for (let i = 0; i < 9; i++) add('sphere', [0xff7a1a, 0xffffff, 0x2f5fd0][i % 3], i % 2 ? 0 : PAT.STRIPE, [-2.8 + (i % 3) * 0.32, 0.17 + Math.floor(i / 3) * 0.3, 12.0], [0, 0, 0], [0.15, 0.15, 0.15]);
  table(1.6, 0, 12.6, 0, 2.2, 0.8, 0x3a3f4a); mannequin(-2.6, 13.6, 0, Math.PI); poi(0, 11.5, 0, 0, 'browse');
  // OUTLET (cajas apiladas para trepar)
  floor(4, 12, SZ0, SZ1, 0, 0xbdb8b0, PAT.TILE);
  crate(5.2, 16.6, 0, 1.2); crate(6.4, 16.6, 0, 1.2); crate(6.4, 16.6, 0.96, 1.2); crate(7.6, 16.6, 0, 1.2); crate(7.6, 16.6, 0.96, 1.2); crate(7.6, 16.6, 1.92, 1.0);
  table(9.6, 0, 13.0, Math.PI / 2, 2.4, 1.0, 0x8a8f99); roundRack(6.0, 12.4);
  for (let i = 0; i < 6; i++) cardbox(10.8, 11.0 + i * 0.9, 0, 0.55 + rng() * 0.3, rng());
  bigSign('-70%', 11.85, 2.4, 13.8, -Math.PI / 2, 1.6, 0.8, '#ffc93c', '#e8384f');

  // ======================================================
  // PASILLOS DE SERVICIO (detrás de los locales)
  // ======================================================
  for (const [z0, z1] of [[-19.6, NZ0], [SZ1, 19.6]]) {
    floor(-12, 12, z0, z1, 0, 0x8d8a85, PAT.TILE);
    const zc = (z0 + z1) / 2;
    for (let x = -10; x <= 10; x += 5) lightPanel(x, L1 - 0.32, zc, 1.2, 0.3);
    box(0, L1 - 0.6, z0 < 0 ? z0 + 0.25 : z1 - 0.25, 24, 0.14, 0.14, 0x9aa0a8, PAT.METAL);   // caño
    box(0, L1 - 0.85, z0 < 0 ? z0 + 0.25 : z1 - 0.25, 24, 0.1, 0.1, 0xc0263e, PAT.METAL);
  }
  for (const [x, z] of [[-9, -18.9], [-3, -18.9], [5, -18.9], [-6, 18.9], [3, 18.9], [10, 18.9]]) cardbox(x, z, 0, 0.6, rng());
  placeProp('trash_A', 0, 0, -18.9, 0, 1.4); placeProp('trash_B', -8, 0, 18.9, 0, 1.4);
  P.add(-0.4, 0.4, 0, 1, -19.4, -18.4); P.add(-8.4, -7.6, 0, 1, 18.4, 19.4);
  bigSign('SOLO PERSONAL', 0, 2.6, -19.55, 0, 2.4, 0.5, '#ffc93c', '#24112f');

  // ======================================================
  // ALA OESTE (planta baja): probadores + laberinto de liquidación + depósito
  // ======================================================
  wallZ(-10, 10, -12, 0, L1 - 0.3, 0.3, WALL, PAT.PLASTER, [[-3, 3]]);
  floor(-25.6, -12, -19.6, 19.6, 0, 0xd9cfc2, PAT.TILE);
  // probadores contra la pared norte (abren hacia +z)
  booths(-24.2, -15.0, 1, 4, 0);
  solid(-25.6, -14.2, 0, L1 - 0.3, -19.6, -17.25, 0xf1e3cc, PAT.PLASTER); solid(-25.6, -24.2, 0, L1 - 0.3, -17.25, -15.0, 0xf1e3cc, PAT.PLASTER);
  bigSign('PROBADORES', -19.2, 3.3, -14.85, 0, 4.4, 0.9, '#8a4fc7', '#fff4e0', false, true);
  solid(-25.6, -14.2, 2.75, 3.9, -17.3, -15.0, 0xf1e3cc, PAT.PLASTER, { floor: false });
  bench(-19.2, -12.4, Math.PI, 0, 0x8a4fc7);
  // laberinto de góndolas altas
  const maze = [[-22.5, -8, 0], [-17, -8, 0], [-24, -4, Math.PI / 2], [-19.8, -4.5, 0], [-15, -3.5, Math.PI / 2], [-22, 0, 0], [-17.5, 0.8, Math.PI / 2], [-14.4, 1.5, 0],
    [-23, 4.6, Math.PI / 2], [-19.5, 4.5, 0], [-15.5, 5.5, 0], [-21.2, 8.2, 0]];
  for (const [x, z, ry] of maze) shelf(x, 0, z, ry, 3.2, 2.2, [0xf3ece0, 0xffd9e6, 0xd8f0ec][Math.floor(rng() * 3)]);
  for (const [x, z] of [[-24.2, -0.6], [-13.8, -6.6], [-13.8, 8.2], [-19.5, 2.4]]) roundRack(x, z);
  bigSign('LIQUIDACIÓN', -12.18, 3.3, 0, -Math.PI / 2, 5.6, 0.9, '#e8384f', '#fff4e0', false, true);
  for (const [x, z] of [[-22, -6], [-17, -2], [-21, 6.5], [-16, 6.8]]) spot(x, L1 - 0.4, z, 1.0);
  // depósito (sur)
  wallX(-25.6, -12, 11, 0, L1 - 0.3, 0.25, 0xd0c4b4, PAT.PLASTER, [[-21, -18.4], [-15.2, -12.6]]);
  floor(-25.6, -12, 11, 19.6, 0, 0x8d8a85, PAT.CONCRETE ?? PAT.TILE);
  crate(-24.8, 18.8, 0, 1.2); crate(-23.6, 18.8, 0, 1.2); crate(-23.6, 18.8, 0.96, 1.2); crate(-22.4, 18.8, 0, 1.2); crate(-22.4, 18.8, 0.96, 1.2); crate(-22.4, 18.8, 1.92, 1.2); crate(-21.2, 18.8, 0, 1.2);
  for (let i = 0; i < 8; i++) cardbox(-18 + (i % 4) * 1.2, 14 + Math.floor(i / 4) * 2.4, 0, 0.6 + rng() * 0.3, rng());
  rack(-14.5, 0, 15.5, Math.PI / 2, 3.0, 7); rack(-24.6, 0, 13.6, 0, 2.4, 5);
  bigSign('DEPÓSITO', -18.0, 3.2, 11.14, Math.PI, 2.8, 0.6, '#24112f', '#ffc93c');

  // ======================================================
  // ALA ESTE (planta baja): escaleras + patio de comidas
  // ======================================================
  wallZ(-10, 10, 12, 0, L1 - 0.3, 0.3, WALL, PAT.PLASTER, [[-8.6, -5.2], [-1.6, 1.6], [5.2, 8.6]]);
  floor(12, 25.6, -19.6, 19.6, 0, 0xe8ddcf, PAT.BIGTILE);
  stairs(14, -14.5, '+x', 2.6, 0, L1, 14, 0xe0d4c2, true, PAT.TILE);
  stairs(14, 14.5, '+x', 2.6, 0, L1, 14, 0xe0d4c2, true, PAT.TILE);
  for (const zz of [-14.5, 14.5]) { solid(14, 21, 0, L1 - 0.3, zz - 1.45, zz - 1.32, 0xd0c4b4, PAT.PLASTER, { floor: false }); solid(14, 21, 0, L1 - 0.3, zz + 1.32, zz + 1.45, 0xd0c4b4, PAT.PLASTER, { floor: false }); }
  bigSign('↑ PRIMER PISO', 13.95, 2.9, -12.4, -Math.PI / 2, 2.2, 0.5, '#ffc93c', '#24112f');
  bigSign('↑ PRIMER PISO', 13.95, 2.9, 12.4, -Math.PI / 2, 2.2, 0.5, '#ffc93c', '#24112f');
  // mostradores de comida contra la pared este
  for (const [z, name, col] of [[-8, 'CAFÉ', 0x8a5a33], [-1.5, 'HELADOS', 0x7ee8ff], [5, 'PIZZA', 0xe8384f]]) {
    counter(23.8, 0, z, Math.PI / 2, 4.2, col);
    solid(24.6, 25.6, 0, 3.6, z - 2.3, z + 2.3, 0xfff4e0, PAT.TILE, { floor: false });
    add('box', col, PAT.AWN, [24.2, 3.1, z], [0, 0, -0.25], [1.6, 0.06, 4.6]);
    bigSign(name, 24.58, 2.4, z, -Math.PI / 2, 3.0, 0.7, '#24112f', '#fff4e0', false, true);
    poi(22.0, z, 0, Math.PI / 2, 'browse');
  }
  for (const [x, z] of [[16.5, -7], [20, -7], [16.5, -2], [20, -2], [16.5, 3], [20, 3], [18.2, 7.4]]) {
    placeProp('table_medium', x, 0, z, 0, 0.42);
    placeProp('chair_A', x - 0.75, 0, z, Math.PI / 2, 0.75); placeProp('chair_B', x + 0.75, 0, z, -Math.PI / 2, 0.75);
    placeProp(rng() < 0.5 ? 'food_burger' : 'food_dinner', x, 0.42, z, rng() * 3, 0.35);
    P.add(x - 0.55, x + 0.55, 0, 0.75, z - 0.45, z + 0.45, { cam: false });
    poi(x - 1.3, z, 0, Math.PI / 2);
  }
  plant(13.2, -9.2, 0, 1.1); plant(13.2, 9.2, 0, 1.1); plant(24.8, -17.8, 0, 1.2); plant(24.8, 17.8, 0, 1.2);
  bigSign('PATIO DE COMIDAS', 25.55, 3.55, -1.5, -Math.PI / 2, 6, 0.7, '#ff4f8b', '#fff4e0', false, true);

  // ======================================================
  // PRIMER PISO — balcón alrededor del patio + puente
  // ======================================================
  railing(-8, -6, -1.4, -6, L1); railing(1.4, -6, 8, -6, L1); railing(-8, 6, -1.4, 6, L1); railing(1.4, 6, 8, 6, L1);
  railing(-1.4, -6, 1.4, -6, L1); railing(-1.4, 6, 1.4, 6, L1);
  railing(-8, -6, -8, -1.2, L1); railing(-8, 1.2, -8, 6, L1); railing(8, -6, 8, -1.2, L1); railing(8, 1.2, 8, 6, L1);
  railing(-8, -1.2, 8, -1.2, L1); railing(-8, 1.2, 8, 1.2, L1);
  for (const [x, z] of [[-8, -6], [8, -6], [-8, 6], [8, 6], [-8, -1.2], [8, -1.2], [-8, 1.2], [8, 1.2]]) column(x, z, L1, ROOF, 0xf1e6d6, 0.26);
  for (const [x, z] of [[-8, -6], [8, -6], [-8, 6], [8, 6]]) column(x, z, 0, L1 - 0.3, 0xf1e6d6, 0.32);
  plant(-10.2, -8.2, L1, 1); plant(10.2, -8.2, L1, 1); plant(-10.2, 8.2, L1, 1); plant(10.2, 8.2, L1, 1);
  for (const [x, z, ry] of [[-4, -8.2, 0], [4, -8.2, 0], [-4, 8.2, Math.PI], [4, 8.2, Math.PI]]) bench(x, z, ry, L1, 0x24112f);
  for (let i = 0; i < 6; i++) poi(-6 + i * 2.4, i % 2 ? -7.2 : 7.2, L1, i % 2 ? 0 : Math.PI);

  // ======================================================
  // PRIMER PISO — locales del norte (más profundos, z -19.6..-10)
  // ======================================================
  const UZ0 = -19.6;
  wallZ(UZ0, NZ1, -4, L1, ROOF - L1, 0.25, 0xe9dccb, PAT.PLASTER, [[-15.4, -13.8]]);
  wallZ(UZ0, NZ1, 4, L1, ROOF - L1, 0.25, 0xe9dccb, PAT.PLASTER, [[-17.6, -16.0]]);
  wallZ(UZ0, NZ1, -12, L1, ROOF - L1, 0.3, WALL, PAT.PLASTER);
  wallZ(UZ0, NZ1, 12, L1, ROOF - L1, 0.3, WALL, PAT.PLASTER);
  front(-12, -4, NZ1, L1, -8, 1, 'ACCESORIOS', 0x1fb5a8, '#fff4e0', ROOF - L1);
  front(-4, 4, NZ1, L1, 0, 1, 'SOMBRERERÍA', 0xc9a24a, '#24112f', ROOF - L1);
  front(4, 12, NZ1, L1, 8, 1, 'NOVIAS', 0xffffff, '#ff4f8b', ROOF - L1);
  // ACCESORIOS
  floor(-12, -4, UZ0, NZ1, L1, 0x2e8a80, PAT.CARPET);
  for (let i = 0; i < 3; i++) { counter(-10 + i * 2, L1, -13.2, 0, 1.6, 0xfff4e0); }
  shelf(-8, L1, -18.6, 0, 6.6, 2.4, 0xfff4e0); mannequin(-11, -16, L1, Math.PI / 2); mannequin(-5, -16, L1, -Math.PI / 2);
  poi(-8, -11.6, L1, Math.PI, 'browse'); spot(-8, ROOF - 0.4, -15, 1.1);
  // SOMBRERERÍA (sombreros en postes)
  floor(-4, 4, UZ0, NZ1, L1, 0x9b6b43, PAT.WOOD);
  for (const [x, z] of [[-2.4, -12.8], [0, -12.8], [2.4, -12.8], [-2.4, -16.4], [0, -16.4], [2.4, -16.4]]) {
    add('cyl', 0x24112f, PAT.METAL, [x, L1 + 0.75, z], [0, 0, 0], [0.04, 1.5, 0.04]); add('cyl', 0x24112f, PAT.METAL, [x, L1 + 0.02, z], [0, 0, 0], [0.25, 0.04, 0.25]);
    const c = K.clothColor(); add('cyl', c, PAT.FABRIC, [x, L1 + 1.52, z], [0, 0, 0], [0.32, 0.03, 0.32]); add('cyl', c, PAT.FABRIC, [x, L1 + 1.64, z], [0, 0, 0], [0.17, 0.22, 0.17]);
    P.add(x - 0.3, x + 0.3, L1, L1 + 1.6, z - 0.3, z + 0.3, { cam: false, floor: false });
  }
  shelf(0, L1, -19.0, 0, 6.6, 2.6, 0x6b4a2f); poi(0, -14.6, L1, Math.PI, 'browse');
  // NOVIAS (vestidos blancos, espejos)
  floor(4, 12, UZ0, NZ1, L1, 0xf6eef0, PAT.MARBLE);
  for (const [x, z] of [[5.6, -17.6], [7.6, -18.4], [9.6, -17.6], [11.0, -15.0]]) mannequin(x, z, L1, Math.PI * 0.1);
  rack(8, L1, -13.6, 0, 3.2, 6); sofa(10.2, -11.6, Math.PI, L1, 0xffd9e6);
  for (const x of [5.2, 10.8]) { box(x, L1 + 1.3, -19.5, 1.0, 2.2, 0.05, 0xdbe9f5, PAT.METAL); box(x, L1 + 1.3, -19.53, 1.15, 2.35, 0.03, 0xc9a24a, PAT.METAL); }

  // ======================================================
  // PRIMER PISO — sur: CINE grande + ARCADE
  // ======================================================
  wallZ(SZ0, 19.6, 4, L1, ROOF - L1, 0.25, 0x2a1f35, PAT.PLASTER, [[16.4, 18.0]]);
  wallZ(SZ0, 19.6, -12, L1, ROOF - L1, 0.3, WALL, PAT.PLASTER);
  wallZ(SZ0, 19.6, 12, L1, ROOF - L1, 0.3, WALL, PAT.PLASTER);
  front(-12, 4, SZ0, L1, -4, -1, 'CINE PROBADOR', 0x24112f, '#ffc93c', ROOF - L1);
  front(4, 12, SZ0, L1, 8, -1, 'ARCADE', 0x8a4fc7, '#7ee8ff', ROOF - L1);
  floor(-12, 4, SZ0, 19.6, L1, 0x5a1f3a, PAT.CARPET);
  counter(-4, L1, 16.0, Math.PI, 5.0, 0xe8384f);
  for (let i = 0; i < 3; i++) { add('cyl', 0xfff4e0, PAT.STRIPE, [-5.6 + i * 1.4, L1 + 1.45, 16.0], [0, 0, 0], [0.18, 0.4, 0.18]); }
  for (const [x, z, ry] of [[-10.2, 12.4, Math.PI / 2], [-10.2, 15.6, Math.PI / 2], [1.8, 13.2, -Math.PI / 2]]) sofa(x, z, ry, L1, 0x8a1f3a);
  const posterCols = [['#ff4f8b', 'AMOR EN\nEL PROBADOR'], ['#1fb5a8', 'LA ÚLTIMA\nTALLA'], ['#ffc93c', 'NÚMERO\n427'], ['#8a4fc7', 'EL GRAN\nREMATE']];
  posterCols.forEach(([bg, txt], i) => poster(-11.8, L1 + 2.0, 11.2 + i * 2.1, Math.PI / 2, 1.3, 1.9, (g, w, h) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.arc(w / 2, h * 0.38, w * 0.3, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = '700 30px "Bagel Fat One",sans-serif'; g.textAlign = 'center'; txt.split('\n').forEach((l, k) => g.fillText(l, w / 2, h * 0.72 + k * 34)); }));
  // sala (puerta oscura al fondo)
  box(-4, L1 + 1.4, 19.55, 3.0, 2.8, 0.05, 0x111111);
  bigSign('SALA 1', -4, L1 + 3.2, 19.5, Math.PI, 1.8, 0.45, '#24112f', '#ff4f8b', false, true);
  for (let x = -11; x <= 3; x += 2) spot(x, ROOF - 0.3, 11.0, 1.0);
  // ARCADE (máquinas = cobertura)
  floor(4, 12, SZ0, 19.6, L1, 0x1a1030, PAT.CARPET);
  const machine = (x, z, ry, col) => {
    const c = Math.cos(ry), s = Math.sin(ry);
    box(x, L1 + 0.9, z, 0.9, 1.8, 0.8, col, PAT.PLASTER, ry); box(x + s * 0.41, L1 + 1.35, z + c * 0.41, 0.7, 0.55, 0.02, 0x7ee8ff, PAT.GLOW, ry);
    box(x + s * 0.5, L1 + 0.95, z + c * 0.5, 0.8, 0.12, 0.3, 0x24242c, PAT.METAL, ry);
    P.add(x - 0.5, x + 0.5, L1, L1 + 1.8, z - 0.5, z + 0.5);
  };
  for (let i = 0; i < 4; i++) machine(5.2 + i * 1.6, 18.8, Math.PI, [0xff4f8b, 0x2f5fd0, 0xffc93c, 0x3fa34d][i]);
  for (let i = 0; i < 3; i++) machine(6.0 + i * 1.8, 14.2, 0, [0xe8384f, 0x8a4fc7, 0x1fb5a8][i]);
  machine(11.2, 11.6, -Math.PI / 2, 0xff7a1a);

  // ======================================================
  // PRIMER PISO — ala oeste: PLAZA BLANDA (bloques para trepar y esconderse)
  // ======================================================
  wallZ(-10, 10, -12, L1, ROOF - L1, 0.3, WALL, PAT.PLASTER, [[-3, 3]]);
  floor(-25.6, -12, -19.6, 19.6, L1, 0x7ec8e3, PAT.CARPET);
  bigSign('PLAZA BLANDA', -12.18, L1 + 3.3, 0, -Math.PI / 2, 5, 0.9, '#1fb5a8', '#fff4e0', false, true);
  const soft = [0xff4f8b, 0xffc93c, 0x1fb5a8, 0x8a4fc7, 0xff7a66, 0x3fa34d];
  const block = (x, z, w, d, h, y = L1, c) => { solid(x - w / 2, x + w / 2, y, y + h, z - d / 2, z + d / 2, c ?? soft[Math.floor(rng() * soft.length)], PAT.FABRIC); };
  block(-23, -16, 3, 3, 0.6); block(-23, -16, 2, 2, 1.2, L1 + 0.6); block(-23, -16, 1.2, 1.2, 1.2, L1 + 1.8);
  block(-17, -15, 4, 2, 1.0); block(-15, -11, 2, 4, 2.0); block(-20, -9, 2, 2, 0.5);
  block(-24, -4, 2, 6, 1.6); block(-19, -2, 4, 1, 2.2); block(-19, 3, 4, 1, 2.2); block(-15.5, 0.5, 1, 4, 1.4);
  block(-23, 8, 3, 3, 0.8); block(-23, 8, 1.5, 1.5, 1.0, L1 + 0.8); block(-17, 9, 2.4, 2.4, 1.8); block(-14.5, 13, 3, 2, 0.6);
  block(-21, 15.5, 6, 1.2, 2.4); block(-21, 17.5, 4, 2, 0.6);
  // túnel
  solid(-20, -16, L1 + 1.2, L1 + 1.6, 5.4, 7.0, 0xffc93c, PAT.FABRIC); solid(-20, -16, L1, L1 + 1.2, 5.4, 5.7, 0xff4f8b, PAT.FABRIC, { floor: false }); solid(-20, -16, L1, L1 + 1.2, 6.7, 7.0, 0xff4f8b, PAT.FABRIC, { floor: false });
  for (const [x, z] of [[-20, -6], [-17, 12], [-23, 1]]) poi(x, z, L1, rng() * 6);

  // ======================================================
  // PRIMER PISO — ala este: llegada de escaleras y living
  // ======================================================
  wallZ(-10, 10, 12, L1, ROOF - L1, 0.3, WALL, PAT.PLASTER, [[-3, 3]]);
  floor(12, 25.6, -19.6, 19.6, L1, 0xc9b49a, PAT.WOOD);
  for (const zz of [-14.5, 14.5]) { railing(14, zz - 1.35, 21, zz - 1.35, L1); railing(14, zz + 1.35, 21, zz + 1.35, L1); railing(14, zz - 1.35, 14, zz + 1.35, L1); }
  for (const [x, z, ry] of [[19, -4, 0], [19, 4, Math.PI], [23.5, 0, -Math.PI / 2]]) sofa(x, z, ry, L1, [0xff7a66, 0x1fb5a8, 0xffc93c][Math.floor(rng() * 3)]);
  table(19, L1, 0, 0, 1.6, 0.9, 0x3a2b4a);
  rug(20, 0, L1, 7, 6, 0xffd9e6);
  plant(24.6, -9, L1, 1.2); plant(24.6, 9, L1, 1.2); plant(16, -9, L1, 1); plant(16, 9, L1, 1);
  shelf(25.0, L1, -14.5, Math.PI / 2, 4, 2.2, 0x3a2b4a); shelf(25.0, L1, 14.5, Math.PI / 2, 4, 2.2, 0x3a2b4a);
  bigSign('LIVING', 25.55, L1 + 3.2, 0, -Math.PI / 2, 3.2, 0.7, '#24112f', '#ffc93c', false, true);
  for (const [x, z] of [[18, -9], [22, 9], [17, 0]]) poi(x, z, L1, rng() * 6);

  // ---------- vidrios ----------
  const gm = new THREE.MeshStandardMaterial({ color: 0xd6ecff, transparent: true, opacity: 0.18, roughness: 0.03, metalness: 0.3, depthWrite: false, envMapIntensity: 1.5 });
  for (const [x0, x1, y0, y1, z0, z1] of glass) { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), gm); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); root.add(m); }

  // ---------- terminar ----------
  K.finish({ levels: [0, L1], floorMax: 6, spawnMin: 5, itemMin: 4, avoid: (n) => Math.hypot(n.x, n.z) < 2.6 && n.y < 1 });
  // vista del menú, podio y órbita del lobby
  W.menu = { px: 0.2, py: 0, pz: 3.0, ry: 0.15, cam: [1.4, 1.55, 6.6], look: [0.25, 1.0, 3.0], camC: [0.95, 1.45, 5.6], lookC: [-0.3, 1.05, 3.0] };
  W.podium = { x: 0, y: 0.56, z: 0, ry: 0 };
  W.orbit = { cx: 0, cz: 0, r: 5.5, h: 6.5, ly: 2 };
  return W;
}
