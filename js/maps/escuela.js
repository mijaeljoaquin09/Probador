// Mapa "Escuela": al aire libre, estilo patio de colegio. Edificio de aulas de dos pisos con galería,
// gimnasio con vestuarios (probadores), cantina con galería techada, cancha y plaza con muros para cubrirse.
import * as THREE from 'three';
import { makeKit, PAT, canvasTex } from './kit.js';

const L1 = 3.6, ROOF = 7.2;
const BOUNDS = { x0: -34, x1: 34, z0: -26, z1: 26 };
const BEIGE = 0xd9c2a0, CREAM = 0xeadcc6, ORANGE = 0xd2663c, DARK = 0x3a2f2a, TEAL = 0x2f8f8a, MUSTARD = 0xe0a93a, BLUE = 0x3d6fb6;

export function buildEscuela(root, gltf) {
  const K = makeKit(root, gltf, { bounds: BOUNDS, levels: [0, L1, 99], seed: 777 });
  const { W, P, solid, box, add, wallX, wallZ, bigSign, poster, table, shelf, counter, plant, bench, sofa, column, lightPanel, spot, stairs, railing, crate, cardbox, booths, poi, rug, placeProp, windowPane, tree2, fence, rng } = K;
  W.id = 'escuela';
  W.hdr = 'quarry_01_1k.hdr'; W.hdrBg = true;

  // ---------- luz (el cielo HDR da el ambiente; el sol da sombras) ----------
  W.fog = { color: 0xc9d8e6, near: 70, far: 220 };
  const hemi = new THREE.HemisphereLight(0xdfeaff, 0x9a8a70, 0.35); root.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
  sun.position.set(-26, 40, 18); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -46; sc.right = 46; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 120;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
  root.add(sun); root.add(sun.target); W.sun = sun;

  // ---------- suelo ----------
  const flat = (x0, x1, z0, z1, y, color, pat) => box((x0 + x1) / 2, y - 0.05, (z0 + z1) / 2, x1 - x0, 0.1, z1 - z0, color, pat, 0, true);
  flat(-90, 90, -80, 80, -0.02, 0xffffff, PAT.GRASS);          // pasto general (también afuera de la reja)
  flat(-34, 34, -15, 26, 0.0, 0xd8cdb9, PAT.PAVER);             // patio de adoquines
  // canteros de pasto con cordón
  const lawn = (x0, x1, z0, z1) => { solid(x0, x1, 0, 0.14, z0, z1, 0xbdb3a2, PAT.PLASTER, { cam: false }); flat(x0 + 0.15, x1 - 0.15, z0 + 0.15, z1 - 0.15, 0.16, 0xffffff, PAT.GRASS); };
  lawn(-17, -12, 15, 24); lawn(12, 17, 15, 24); lawn(-33.6, -27, 18, 25.6); lawn(27, 33.6, 15, 25.6);

  // ======================================================
  // EDIFICIO DE AULAS (norte): 5 aulas por piso + galería
  // ======================================================
  const ZB = -26, ZF = -15, ZG = -12.4;           // fondo, frente de aulas, borde de galería
  const XS = [-26, -16, -6, 4, 14, 26];
  // paredes exteriores
  solid(-26, 26, 0, ROOF, ZB, ZB + 0.3, BEIGE, PAT.PLASTER);
  solid(-26, -25.7, 0, ROOF, ZB, ZF, BEIGE, PAT.PLASTER); solid(25.7, 26, 0, ROOF, ZB, ZF, BEIGE, PAT.PLASTER);
  // losas y techo
  solid(-26, 26, L1 - 0.3, L1, ZB, ZG, 0xf1ebe0, PAT.PLASTER);           // piso del primer piso + galería (proyecta sombra)
  solid(-26.4, 26.4, ROOF, ROOF + 0.3, ZB - 0.2, ZG + 0.4, 0xe9e2d6, PAT.PLASTER);
  box(0, ROOF + 0.15, ZG + 0.45, 52.8, 0.32, 0.12, ORANGE, PAT.PLASTER);   // borde naranja del techo
  box(0, L1 - 0.15, ZG + 0.06, 52, 0.32, 0.12, ORANGE, PAT.PLASTER);       // borde naranja de la galería
  // pisos interiores
  for (const y of [0, L1]) box(0, y + 0.006, (ZB + ZF) / 2, 51.4, 0.012, ZF - ZB - 0.3, 0xcfd3d6, PAT.TILE, 0, true);
  box(0, L1 + 0.006, (ZF + ZG) / 2, 52, 0.012, ZG - ZF, 0xc9b9a0, PAT.PAVER, 0, true);
  box(0, 0.006, (ZF + ZG) / 2, 52, 0.012, ZG - ZF, 0xc9b9a0, PAT.PAVER, 0, true);
  // paredes entre aulas (con algunas puertas internas para dar vueltas)
  const inner = { 0: { '-6': true, '14': true }, 1: { '-16': true, '4': true } };
  for (const [fi, y] of [[0, 0], [1, L1]]) {
    for (const x of XS.slice(1, -1)) wallZ(ZB, ZF, x, y, (fi ? ROOF : L1 - 0.3) - y, 0.2, CREAM, PAT.PLASTER, inner[fi][x] ? [[-21.5, -20.1, 2.3]] : []);
    // frente de las aulas con puertas
    const doors = XS.slice(0, -1).map((x0, i) => { const c = x0 + (XS[i + 1] - x0) * 0.3; return [c - 0.8, c + 0.8, 2.4]; });
    wallX(-26, 26, ZF, y, (fi ? ROOF : L1 - 0.3) - y, 0.25, fi ? CREAM : BEIGE, PAT.PLASTER, doors);
    for (const [a, b] of doors) { box(a - 0.06, y + 1.25, ZF + 0.14, 0.1, 2.5, 0.06, DARK, PAT.METAL); box(b + 0.06, y + 1.25, ZF + 0.14, 0.1, 2.5, 0.06, DARK, PAT.METAL); box((a + b) / 2, y + 2.46, ZF + 0.14, b - a + 0.22, 0.1, 0.06, DARK, PAT.METAL); }
    // ventanas hacia la galería y hacia afuera (fondo)
    XS.slice(0, -1).forEach((x0, i) => {
      const x1 = XS[i + 1]; const wx = x0 + (x1 - x0) * 0.68;
      windowPane(wx, y + 1.55, ZF + 0.16, 2.6, 1.4, 'x'); windowPane(wx, y + 1.55, ZF - 0.16, 2.6, 1.4, 'x', DARK, false);
      for (const t of [0.3, 0.7]) windowPane(x0 + (x1 - x0) * t, y + 1.6, ZB + 0.32, 2.4, 1.5, 'x', DARK, false);
    });
  }
  // columnas de la galería en planta baja
  for (let x = -16; x <= 16; x += 4) { solid(x - 0.22, x + 0.22, 0, L1 - 0.3, ZG + 0.1, ZG + 0.54, CREAM, PAT.PLASTER, { floor: false }); }
  // baranda de la galería (con huecos donde llegan las escaleras)
  railing(-26, ZG + 0.2, -19.2, ZG + 0.2, L1, false); railing(-16.4, ZG + 0.2, 16.4, ZG + 0.2, L1, false); railing(19.2, ZG + 0.2, 26, ZG + 0.2, L1, false);
  // escaleras exteriores (suben pegadas a la galería) + descansos
  stairs(-25, ZG + 1.3, '+x', 2.1, 0, L1, 12, 0xcfc6b8, true, PAT.PAVER);
  stairs(25, ZG + 1.3, '-x', 2.1, 0, L1, 12, 0xcfc6b8, true, PAT.PAVER);
  solid(-19, -16.4, L1 - 0.3, L1, ZG, ZG + 2.35, 0xcfc6b8, PAT.PAVER); solid(16.4, 19, L1 - 0.3, L1, ZG, ZG + 2.35, 0xcfc6b8, PAT.PAVER);
  railing(-19, ZG + 2.35, -16.4, ZG + 2.35, L1, false); railing(-16.4, ZG, -16.4, ZG + 2.35, L1, false);
  railing(16.4, ZG + 2.35, 19, ZG + 2.35, L1, false); railing(16.4, ZG, 16.4, ZG + 2.35, L1, false);
  // aulas por dentro: pupitres, pizarrón, lockers
  const blackboard = (x, y, z) => poster(x, y, z, 0, 3.0, 1.2, (g, w, h) => { g.fillStyle = '#24432f'; g.fillRect(0, 0, w, h); g.strokeStyle = '#8a5a33'; g.lineWidth = 8; g.strokeRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,.85)'; g.font = '24px "Bricolage Grotesque",sans-serif'; g.fillText(['3 x 4 = 12', 'La percha', 'Clase de arte', '¿Qué número?', 'Recreo 10:30'][Math.floor(rng() * 5)], 18, 40); g.fillText(String(100 + Math.floor(rng() * 900)), 30, 80); });
  const desk = (x, y, z) => {
    box(x, y + 0.72, z, 0.9, 0.05, 0.55, 0xc9a77a, PAT.HWOOD); for (const dx of [-0.4, 0.4]) for (const dz of [-0.22, 0.22]) box(x + dx, y + 0.36, z + dz, 0.04, 0.72, 0.04, 0x55606a, PAT.METAL);
    box(x, y + 0.44, z + 0.5, 0.42, 0.04, 0.4, BLUE, PAT.PLASTER); box(x, y + 0.7, z + 0.7, 0.42, 0.42, 0.04, BLUE, PAT.PLASTER); for (const dx of [-0.18, 0.18]) box(x + dx, y + 0.22, z + 0.5, 0.03, 0.44, 0.3, 0x55606a, PAT.METAL);
    P.add(x - 0.47, x + 0.47, y, y + 0.75, z - 0.3, z + 0.9, { cam: false });
  };
  for (const y of [0, L1]) XS.slice(0, -1).forEach((x0, i) => {
    const x1 = XS[i + 1]; const cx = (x0 + x1) / 2;
    blackboard(cx, y + 1.7, ZB + 0.33);
    box(cx, y + 0.4, ZB + 1.6, 1.6, 0.8, 0.7, 0x8a5a33, PAT.HWOOD); P.add(cx - 0.8, cx + 0.8, y, y + 0.8, ZB + 1.25, ZB + 1.95, { cam: false });
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) desk(x0 + 2.0 + c * ((x1 - x0) - 4) / 2, y, ZB + 3.3 + r * 1.9);
    // lockers contra la pared del costado
    for (let k = 0; k < 4; k++) box(x1 - 0.42, y + 0.95, ZB + 2.0 + k * 0.62, 0.55, 1.9, 0.6, [ORANGE, MUSTARD, TEAL, BLUE][(i + k) % 4], PAT.METAL);
    P.add(x1 - 0.72, x1 - 0.12, y, y + 1.9, ZB + 1.65, ZB + 4.35);
    lightPanel(cx, y + (y ? ROOF - L1 : L1 - 0.3) - 0.02, (ZB + ZF) / 2, 2.2, 0.8);
    poi(cx, ZB + 5.5, y, Math.PI, 'look');
  });
  bigSign('ESCUELA N° 7', 0, ROOF - 1.05, ZG + 0.52, 0, 6.2, 1.0, '#f4ead8', '#2a1f1a');
  bigSign('AULAS', -21, L1 + 2.6, ZF + 0.16, 0, 2.4, 0.55, '#2a1f1a', '#f4ead8');

  // ======================================================
  // GIMNASIO (oeste) con gradas y vestuarios
  // ======================================================
  const GX0 = -34, GX1 = -18, GZ0 = -9, GZ1 = 16, GH = 7;
  solid(GX0, GX1, 0, GH, GZ0, GZ0 + 0.35, 0xb5654a, PAT.BRICK); solid(GX0, GX1, 0, GH, GZ1 - 0.35, GZ1, 0xb5654a, PAT.BRICK);
  solid(GX0, GX0 + 0.35, 0, GH, GZ0, GZ1, 0xb5654a, PAT.BRICK);
  wallZ(GZ0, GZ1, GX1, 0, GH, 0.35, 0xb5654a, PAT.BRICK, [[-4.2, -1.6, 2.8], [7.6, 10.2, 2.8]]);
  for (const [a, b] of [[-4.2, -1.6], [7.6, 10.2]]) { box(GX1 + 0.2, 1.4, a - 0.06, 0.12, 2.8, 0.12, DARK, PAT.METAL); box(GX1 + 0.2, 1.4, b + 0.06, 0.12, 2.8, 0.12, DARK, PAT.METAL); box(GX1 + 0.2, 2.85, (a + b) / 2, 0.12, 0.12, b - a + 0.24, DARK, PAT.METAL); }
  // las puertas: el marco de arriba y el hueco libre
  solid(GX0 - 0.3, GX1 + 0.3, GH, GH + 0.35, GZ0 - 0.3, GZ1 + 0.3, 0x9aa0a8, PAT.METAL);
  box((GX0 + GX1) / 2, GH + 0.2, GZ0 - 0.32, GX1 - GX0 + 0.6, 0.4, 0.1, ORANGE, PAT.PLASTER);
  box((GX0 + GX1) / 2, 0.006, (GZ0 + GZ1) / 2, GX1 - GX0 - 0.7, 0.012, GZ1 - GZ0 - 0.7, 0xffffff, PAT.HWOOD, 0, true);
  // líneas de la cancha del gimnasio
  for (const [x, z, sx, sz] of [[-26, -5, 12, 0.06], [-26, 9, 12, 0.06], [-26, 2, 12, 0.06], [-32, 2, 0.06, 14], [-20, 2, 0.06, 14]]) box(x, 0.016, z, sx, 0.008, sz, 0xffffff, 0, 0, true);
  for (let i = 0; i < 4; i++) solid(GX0 + 0.35, GX0 + 0.35 + (4 - i) * 0.85, 0, 0.35 * (i + 1), -6, 11, i % 2 ? 0x2f5fa0 : 0x3d6fb6, PAT.PLASTER);
  // aros de básquet
  for (const z of [GZ0 + 0.5, GZ1 - 0.5]) { const s = z < 0 ? 1 : -1; box(-26, 3.6, z + s * 0.1, 1.8, 1.1, 0.05, 0xffffff, PAT.PLASTER); add('torus', ORANGE, PAT.METAL, [-26, 3.05, z + s * 0.45], [Math.PI / 2, 0, 0], [0.23, 0.23, 0.12]); box(-26, 3.0, z + s * 0.12, 0.08, 0.6, 0.15, DARK, PAT.METAL); }
  // colchonetas, cajón, pelotas
  for (const [x, z] of [[-22, -6.5], [-22, -4.6]]) solid(x - 1, x + 1, 0, 0.22, z - 0.9, z + 0.9, BLUE, PAT.FABRIC);
  solid(-22.5, -20.7, 0, 1.1, 4.4, 5.3, 0x8a5a33, PAT.HWOOD); box(-21.6, 1.15, 4.85, 1.8, 0.1, 0.9, 0xc9a77a, PAT.FABRIC);
  for (let i = 0; i < 6; i++) add('sphere', i % 2 ? ORANGE : 0xffffff, i % 2 ? 0 : PAT.STRIPE, [-19.4 + (i % 3) * 0.3, 0.15, 13 + Math.floor(i / 3) * 0.3], [0, 0, 0], [0.13, 0.13, 0.13]);
  crate(-19.2, -7.6, 0, 1.2); crate(-19.2, -7.6, 0.96, 1.2); crate(-20.4, -7.6, 0, 1.2);
  for (let z = -6; z <= 13; z += 4.5) for (const x of [-30, -22]) lightPanel(x, GH - 0.03, z, 1.6, 0.8);
  for (let z = -6; z <= 12; z += 4) { windowPane(GX0 + 0.37, 5.2, z, 2.2, 1.2, 'z', DARK, false); }
  for (let x = -31; x <= -21; x += 5) { windowPane(x, 5.2, GZ0 - 0.02, 2.2, 1.2, 'x', DARK, false); }
  // vestuarios = probadores
  booths(GX0 + 0.6, GZ1 - 2.6, -1, 4, 0, [0x3d6fb6, ORANGE, TEAL, MUSTARD]);
  bigSign('VESTUARIOS', -28.7, 3.25, GZ1 - 2.5, 0, 4.0, 0.7, '#2f8f8a', '#ffffff', true);
  bigSign('GIMNASIO', GX1 + 0.2, 4.6, 3, Math.PI / 2, 5.5, 1.0, '#f4ead8', '#b5402a');
  for (const [x, z] of [[-26, 2], [-29, 7], [-23, -2]]) poi(x, z, 0, rng() * 6);

  // ======================================================
  // CANTINA (este): galería techada con mesas + cocina
  // ======================================================
  const CX0 = 19, CX1 = 33.6, CZ0 = -9, CZ1 = 11;
  solid(CX0 - 0.3, CX1 + 0.3, 3.4, 3.65, CZ0 - 0.3, CZ1 + 0.3, 0xe9e2d6, PAT.PLASTER);
  box((CX0 + CX1) / 2, 3.52, CZ0 - 0.33, CX1 - CX0 + 0.6, 0.3, 0.06, TEAL, PAT.PLASTER); box((CX0 + CX1) / 2, 3.52, CZ1 + 0.33, CX1 - CX0 + 0.6, 0.3, 0.06, TEAL, PAT.PLASTER); box(CX0 - 0.33, 3.52, (CZ0 + CZ1) / 2, 0.06, 0.3, CZ1 - CZ0 + 0.6, TEAL, PAT.PLASTER);
  for (const x of [CX0, 26.3]) for (const z of [CZ0, 1, CZ1]) column(x, z, 0, 3.4, 0xf1e6d6, 0.18);
  box((CX0 + CX1) / 2, 0.008, (CZ0 + CZ1) / 2, CX1 - CX0, 0.012, CZ1 - CZ0, 0xc4b6a0, PAT.TILE, 0, true);
  // cocina (bloque cerrado con ventanilla)
  solid(29.5, 34, 0, 3.4, CZ0, 2, CREAM, PAT.PLASTER);
  counter(29, 0, -3.5, Math.PI / 2, 4.2, ORANGE);
  windowPane(29.48, 1.9, 0.3, 1.6, 1.0, 'z', DARK);
  bigSign('CANTINA', 29.47, 2.85, -3.5, -Math.PI / 2, 3.4, 0.7, '#d2663c', '#ffffff', false, true);
  for (const [x, z] of [[21.5, -6], [25, -6], [21.5, -1.5], [25, -1.5], [21.5, 3], [25, 3], [21.5, 7.5], [25, 7.5], [29, 7.5]]) {
    placeProp('table_medium', x, 0, z, 0, 0.42); placeProp('chair_A', x - 0.75, 0, z, Math.PI / 2, 0.75); placeProp('chair_B', x + 0.75, 0, z, -Math.PI / 2, 0.75);
    if (rng() < 0.6) placeProp(rng() < 0.5 ? 'food_burger' : 'food_dinner', x, 0.42, z, rng() * 3, 0.35);
    P.add(x - 0.55, x + 0.55, 0, 0.75, z - 0.45, z + 0.45, { cam: false }); poi(x - 1.3, z, 0, Math.PI / 2);
  }
  // máquinas expendedoras (cobertura)
  for (const [z, c] of [[4.4, 0xe8384f], [5.6, BLUE]]) { solid(32.6, 33.6, 0, 2.0, z - 0.5, z + 0.5, c, PAT.METAL); box(32.58, 1.25, z, 0.04, 1.2, 0.7, 0x9fd8ff, PAT.GLOW); }

  // ======================================================
  // CANCHA DE FUTSAL (centro)
  // ======================================================
  const KX = 11, KZ0 = -6, KZ1 = 8;
  box(0, 0.012, (KZ0 + KZ1) / 2, 2 * KX + 2, 0.02, KZ1 - KZ0 + 2, ORANGE, PAT.PLASTER, 0, true);
  box(0, 0.016, (KZ0 + KZ1) / 2, 2 * KX, 0.02, KZ1 - KZ0, BLUE, PAT.PLASTER, 0, true);
  const line = (x, z, sx, sz) => box(x, 0.03, z, sx, 0.008, sz, 0xffffff, 0, 0, true);
  line(0, KZ0, 2 * KX, 0.08); line(0, KZ1, 2 * KX, 0.08); line(-KX, 1, 0.08, KZ1 - KZ0); line(KX, 1, 0.08, KZ1 - KZ0); line(0, 1, 0.08, KZ1 - KZ0);
  add('torus', 0xffffff, 0, [0, 0.03, 1], [Math.PI / 2, 0, 0], [2.0, 2.0, 0.01]);
  for (const sx of [-1, 1]) { line(sx * (KX - 3), 1, 0.08, 6); line(sx * (KX - 1.5), -2, 3, 0.08); line(sx * (KX - 1.5), 4, 3, 0.08); }
  // arcos
  for (const sx of [-1, 1]) {
    const x = sx * KX;
    for (const z of [-0.5, 2.5]) { box(x, 1.0, z, 0.1, 2.0, 0.1, 0xffffff, PAT.METAL); P.add(x - 0.08, x + 0.08, 0, 2, z - 0.08, z + 0.08, { cam: false }); }
    box(x, 2.0, 1, 0.1, 0.1, 3.1, 0xffffff, PAT.METAL); box(x + sx * 0.8, 0.05, 1, 1.6, 0.05, 3.1, 0xffffff, PAT.METAL);
    box(x + sx * 0.8, 1.0, 1, 0.02, 2.0, 3.0, 0xdddddd, PAT.FABRIC);
  }
  // tribunas bajas a los costados (cobertura)
  for (const z of [KZ0 - 2.2, KZ1 + 2.2]) for (const x of [-7, 7]) { solid(x - 2.4, x + 2.4, 0, 0.45, z - 0.35, z + 0.35, 0x8a5a33, PAT.HWOOD); box(x, 0.2, z, 4.6, 0.4, 0.5, 0x55606a, PAT.METAL); }
  // postes de luz
  for (const [x, z] of [[-13, -8], [13, -8], [-13, 10], [13, 10]]) { box(x, 3.5, z, 0.18, 7, 0.18, 0x55606a, PAT.METAL); box(x, 7.0, z, 1.2, 0.3, 0.5, 0x55606a, PAT.METAL); box(x, 6.85, z, 1.0, 0.05, 0.35, 0xfff4d6, PAT.GLOW); P.add(x - 0.15, x + 0.15, 0, 7, z - 0.15, z + 0.15, { cam: false }); }
  for (let i = 0; i < 6; i++) poi(-8 + i * 3.2, i % 2 ? KZ0 + 1.5 : KZ1 - 1.5, 0, i % 2 ? 0 : Math.PI);

  // ======================================================
  // PLAZA SUR: muros decorados para cubrirse, árboles, entrada
  // ======================================================
  const decoTex = (bg, fg, ring) => canvasTex(512, 256, (g, w, h) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.lineWidth = 18; g.strokeStyle = fg; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(90 + i * 165, h / 2, 62, 0, Math.PI * 2); g.stroke(); } g.fillStyle = ring; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(90 + i * 165, h / 2, 22, 0, Math.PI * 2); g.fill(); } });
  const decoMats = [new THREE.MeshStandardMaterial({ map: decoTex('#2f8f8a', '#e0a93a', '#f4ead8'), roughness: 0.85 }), new THREE.MeshStandardMaterial({ map: decoTex('#e0a93a', '#2f8f8a', '#d2663c'), roughness: 0.85 })];
  const deco = (x, z, len, axis, h = 1.45, k = 0) => {
    if (axis === 'x') solid(x - len / 2, x + len / 2, 0, h, z - 0.2, z + 0.2, 0xeadcc6, PAT.PLASTER); else solid(x - 0.2, x + 0.2, 0, h, z - len / 2, z + len / 2, 0xeadcc6, PAT.PLASTER);
    box(x, h + 0.04, z, axis === 'x' ? len + 0.08 : 0.5, 0.08, axis === 'x' ? 0.5 : len + 0.08, 0xd8cdb9, PAT.PLASTER);
    for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(len - 0.1, h - 0.15), decoMats[k % 2]); if (axis === 'x') { m.position.set(x, h / 2, z + s * 0.205); m.rotation.y = s > 0 ? 0 : Math.PI; } else { m.position.set(x + s * 0.205, h / 2, z); m.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2; } m.receiveShadow = true; root.add(m); }
  };
  deco(-6, 13.5, 6, 'x', 1.45, 0); deco(7, 13.5, 5, 'x', 1.45, 1); deco(-22, 13, 4, 'z', 1.6, 1); deco(22, 15, 5, 'z', 1.45, 0);
  deco(-3, 19.5, 4, 'z', 1.6, 1); deco(5, 21, 6, 'x', 1.45, 0); deco(-15, 4, 4, 'z', 1.45, 0); deco(-9, 22.5, 5, 'x', 1.6, 1);
  deco(16, -11, 5, 'x', 1.45, 1); deco(-14, -11, 4, 'x', 1.45, 0);
  // árboles
  for (const [x, z, k] of [[-14.5, 18, 0], [-14.5, 22.5, 1], [14.5, 17.5, 0], [14.5, 22, 0], [-30, 21.5, 0], [30, 19, 1], [-15, -6.5, 0], [16, 12.5, 1], [-11, 11.5, 0], [10.5, -10.5, 0], [-31, -12, 0], [31, -12.5, 1]]) tree2(x, z, z > 14 && Math.abs(x) > 12 ? 0.16 : 0, 0.95 + rng() * 0.25, k);
  // bancos y bicicletero
  for (const [x, z, ry] of [[-8, 17, 0], [9, 17, Math.PI], [0, 24, 0], [-19, 10, Math.PI / 2], [19, 13.5, -Math.PI / 2], [-4, -11, 0], [6, -11, 0]]) bench(x, z, ry, 0, 0x8a5a33);
  for (let i = 0; i < 6; i++) { add('torus', 0x55606a, PAT.METAL, [22 + i * 0.6, 0.45, 22], [0, 0, 0], [0.4, 0.4, 0.4]); }
  P.add(21.5, 25.4, 0, 0.9, 21.8, 22.2, { cam: false });
  // reja perimetral y portón
  fence(-34, 25.8, -3, 25.8); fence(3, 25.8, 34, 25.8); fence(33.8, 11.5, 33.8, 25.8); fence(-33.8, 16.2, -33.8, 25.8);
  for (const sx of [-1, 1]) solid(sx * 3 - 0.3, sx * 3 + 0.3, 0, 2.8, 25.4, 26, 0xb5654a, PAT.BRICK);
  box(0, 1.2, 25.85, 6, 2.4, 0.06, 0x2f3a3a, PAT.METAL); P.add(-3, 3, 0, 2.4, 25.6, 26);
  bigSign('BIENVENIDOS', 0, 3.1, 25.7, Math.PI, 5.6, 0.6, '#2f8f8a', '#f4ead8', true);
  // edificios de fondo (afuera, sin colisión)
  const facade = (bg) => canvasTex(256, 256, (g, w, h) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); for (let y = 0; y < 4; y++) for (let x = 0; x < 3; x++) { g.fillStyle = (x + y) % 3 ? '#3b4a57' : '#56697a'; g.fillRect(22 + x * 80, 22 + y * 60, 50, 36); g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(22 + x * 80, 22 + y * 60, 50, 4); } });
  const fmats = ['#d9c2a0', '#c98a6a', '#e6dccb', '#b9a48a'].map((c) => { const t = facade(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }); });
  const far = (x, z, w, d, h, k) => { const g = new THREE.BoxGeometry(w, h, d); const uv = g.attributes.uv; const n = g.attributes.normal; for (let i = 0; i < uv.count; i++) { const sx = Math.abs(n.getX(i)) > 0.5 ? d : w; uv.setXY(i, uv.getX(i) * sx / 6, uv.getY(i) * h / 6); } const m = new THREE.Mesh(g, fmats[k % 4]); m.position.set(x, h / 2, z); m.castShadow = false; root.add(m); };
  for (let i = 0; i < 9; i++) { far(-48 + i * 12, 42 + (i % 2) * 6, 10, 10, 12 + (i * 7) % 14, i); far(-48 + i * 12, -44 - (i % 2) * 5, 10, 10, 14 + (i * 5) % 12, i + 1); }
  for (let i = 0; i < 6; i++) { far(-52 - (i % 2) * 5, -25 + i * 10, 10, 9, 10 + (i * 3) % 9, i + 2); far(52 + (i % 2) * 5, -25 + i * 10, 10, 9, 11 + (i * 4) % 10, i + 3); }
  for (let i = 0; i < 14; i++) tree2(-40 + i * 6 + rng() * 2, 31 + rng() * 4, 0, 1.0 + rng() * 0.3, i % 4 === 0 ? 1 : 0);

  K.finish({ levels: [0, L1], floorMax: 6, spawnMin: 5, itemMin: 4, avoid: (n) => n.x < -16 && n.x > -34 && n.z > 13 && n.y < 1 });
  W.menu = { px: 1.2, py: 0, pz: 10.4, ry: 0.35, cam: [2.5, 1.55, 14.1], look: [1.25, 1.0, 10.4], camC: [1.6, 1.45, 12.8], lookC: [0.6, 1.05, 10.4] };
  W.podium = { x: 0, y: 0.02, z: 1, ry: 0 };
  W.orbit = { cx: 0, cz: 0, r: 26, h: 14, ly: 0 };
  return W;
}
