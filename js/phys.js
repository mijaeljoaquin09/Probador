// Física simple con alturas: cajas sólidas, pisos por nivel, escalones, salto y red de caminos
export const STEP = 0.38;      // altura máxima que se sube caminando
export const BODY = 1.65;      // altura del cuerpo

export class Phys {
  constructor(bounds) {
    this.boxes = []; this.cell = 4; this.grid = new Map(); this.stamp = 0;
    this.bounds = bounds; // {x0,x1,z0,z1}
  }
  // flags: floor (se puede pararse arriba), wall (bloquea), cam (bloquea la cámara)
  add(x0, x1, y0, y1, z0, z1, flags = {}) {
    const b = { x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0, y1, z0: Math.min(z0, z1), z1: Math.max(z0, z1), floor: flags.floor !== false, wall: flags.wall !== false, cam: flags.cam !== false, s: 0 };
    this.boxes.push(b);
    const c = this.cell;
    for (let i = Math.floor(b.x0 / c); i <= Math.floor(b.x1 / c); i++) for (let j = Math.floor(b.z0 / c); j <= Math.floor(b.z1 / c); j++) {
      const k = i * 1000 + j; let l = this.grid.get(k); if (!l) { l = []; this.grid.set(k, l); } l.push(b);
    }
    return b;
  }
  near(x, z, r) {
    const c = this.cell; const out = []; this.stamp++;
    for (let i = Math.floor((x - r) / c); i <= Math.floor((x + r) / c); i++) for (let j = Math.floor((z - r) / c); j <= Math.floor((z + r) / c); j++) {
      const l = this.grid.get(i * 1000 + j); if (!l) continue;
      for (const b of l) if (b.s !== this.stamp) { b.s = this.stamp; out.push(b); }
    }
    return out;
  }
  // piso más alto debajo del punto que no esté más arriba que yRef + STEP
  groundAt(x, z, yRef = 0, r = 0.12) {
    let g = 0;
    for (const b of this.near(x, z, r)) {
      if (!b.floor) continue;
      if (x < b.x0 - r || x > b.x1 + r || z < b.z0 - r || z > b.z1 + r) continue;
      if (b.y1 <= yRef + STEP + 1e-3 && b.y1 > g) g = b.y1;
    }
    return g;
  }
  inBounds(x, z, r = 0) { const B = this.bounds; return x > B.x0 + r && x < B.x1 - r && z > B.z0 + r && z < B.z1 - r; }
  // ¿hay pared en el cilindro del cuerpo?
  blocked(x, z, y, r = 0.3) {
    if (!this.inBounds(x, z, r)) return true;
    for (const b of this.near(x, z, r)) {
      if (!b.wall) continue;
      if (b.y1 <= y + STEP || b.y0 >= y + BODY) continue;
      const nx = Math.max(b.x0, Math.min(x, b.x1)), nz = Math.max(b.z0, Math.min(z, b.z1));
      if ((x - nx) ** 2 + (z - nz) ** 2 < r * r) return true;
    }
    return false;
  }
  // mover un círculo con deslizamiento contra paredes
  slide(x, z, y, nx, nz, r = 0.3) {
    for (let it = 0; it < 3; it++) {
      for (const b of this.near(nx, nz, r + 0.2)) {
        if (!b.wall || b.y1 <= y + STEP || b.y0 >= y + BODY) continue;
        const cx = Math.max(b.x0, Math.min(nx, b.x1)), cz = Math.max(b.z0, Math.min(nz, b.z1));
        const dx = nx - cx, dz = nz - cz; const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 > 1e-9) { const d = Math.sqrt(d2); nx = cx + (dx / d) * r; nz = cz + (dz / d) * r; }
          else { const l = nx - b.x0, rr = b.x1 - nx, t = nz - b.z0, bb = b.z1 - nz; const m = Math.min(l, rr, t, bb); if (m === l) nx = b.x0 - r; else if (m === rr) nx = b.x1 + r; else if (m === t) nz = b.z0 - r; else nz = b.z1 + r; }
        }
      }
      const B = this.bounds; nx = Math.max(B.x0 + r, Math.min(B.x1 - r, nx)); nz = Math.max(B.z0 + r, Math.min(B.z1 - r, nz));
    }
    return [nx, nz];
  }
  // la cámara no atraviesa cosas: devuelve fracción libre del rayo
  camRay(ax, ay, az, bx, by, bz) {
    const n = 14; let free = 1;
    for (let i = 1; i <= n; i++) {
      const t = i / n; const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
      let hit = false;
      for (const b of this.near(x, z, 0.25)) { if (!b.cam) continue; if (x > b.x0 - 0.2 && x < b.x1 + 0.2 && z > b.z0 - 0.2 && z < b.z1 + 0.2 && y > b.y0 - 0.2 && y < b.y1 + 0.2) { hit = true; break; } }
      if (hit) { free = Math.max(0.12, (i - 1) / n); break; }
    }
    return free;
  }
  // tramo caminable a pie (para NPCs y bots)
  walkable(x0, z0, y0, x1, z1) {
    const d = Math.hypot(x1 - x0, z1 - z0); const n = Math.max(1, Math.ceil(d / 0.3));
    let y = y0;
    for (let i = 1; i <= n; i++) {
      const t = i / n; const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      const g = this.groundAt(x, z, y);
      if (y - g > STEP) return null; // escalón hacia abajo muy alto (borde)
      if (this.blocked(x, z, g, 0.32)) return null;
      y = g;
    }
    return y;
  }
}

// ---- red de caminos multinivel ----
export function buildNav(P, floorsAt, spacing = 1.5) {
  const B = P.bounds; const nodes = []; const index = new Map();
  for (let x = B.x0 + 1; x <= B.x1 - 1; x += spacing) for (let z = B.z0 + 1; z <= B.z1 - 1; z += spacing) {
    const levels = floorsAt(x, z);
    for (const y of levels) {
      if (P.blocked(x, z, y, 0.4)) continue;
      const g = P.groundAt(x, z, y); if (Math.abs(g - y) > 0.01) continue;
      const i = nodes.length; nodes.push({ x, z, y, adj: [], tag: '' });
      const ix = Math.round((x - B.x0) / spacing), iz = Math.round((z - B.z0) / spacing);
      const k = ix + ',' + iz; if (!index.has(k)) index.set(k, []); index.get(k).push(i);
    }
  }
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i]; const ix = Math.round((a.x - B.x0) / spacing), iz = Math.round((a.z - B.z0) / spacing);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dz) continue; const l = index.get((ix + dx) + ',' + (iz + dz)); if (!l) continue;
      for (const j of l) { if (j <= i) continue; const b = nodes[j]; if (Math.abs(b.y - a.y) > 1.6) continue;
        const y = P.walkable(a.x, a.z, a.y, b.x, b.z); if (y === null || Math.abs(y - b.y) > 0.05) continue;
        const yb = P.walkable(b.x, b.z, b.y, a.x, a.z); if (yb === null || Math.abs(yb - a.y) > 0.05) continue;
        a.adj.push(j); b.adj.push(i); }
    }
  }
  // quedarnos con la componente conectada más grande
  const comp = new Int32Array(nodes.length).fill(-1); let best = -1, bestN = 0, c = 0;
  for (let i = 0; i < nodes.length; i++) { if (comp[i] >= 0) continue; const q = [i]; comp[i] = c; let n = 0; while (q.length) { const k = q.pop(); n++; for (const j of nodes[k].adj) if (comp[j] < 0) { comp[j] = c; q.push(j); } } if (n > bestN) { bestN = n; best = c; } c++; }
  nodes.forEach((n, i) => { n.ok = comp[i] === best; });
  return { nodes, spacing };
}
export function nearestNode(nav, x, z, y = 0) {
  let best = -1, bd = 1e9;
  const N = nav.nodes;
  for (let i = 0; i < N.length; i++) { const n = N[i]; if (!n.ok) continue; const d = (n.x - x) ** 2 + (n.z - z) ** 2 + ((n.y - y) * 3) ** 2; if (d < bd) { bd = d; best = i; } }
  return best;
}
export function navPath(nav, P, a, b) {
  const N = nav.nodes; if (a < 0 || b < 0) return [];
  const prev = new Int32Array(N.length).fill(-2); prev[a] = -1; const q = [a]; let h = 0;
  while (h < q.length) { const c = q[h++]; if (c === b) break; for (const j of N[c].adj) if (prev[j] === -2) { prev[j] = c; q.push(j); } }
  if (prev[b] === -2) return [];
  const path = []; let c = b; while (c !== -1) { path.unshift(c); c = prev[c]; }
  // suavizar (tirar del hilo)
  const pts = path.map((i) => N[i]);
  const out = [pts[0]]; let k = 0;
  while (k < pts.length - 1) {
    let far = k + 1;
    for (let j = Math.min(pts.length - 1, k + 8); j > k + 1; j--) { const y = P.walkable(pts[k].x, pts[k].z, pts[k].y, pts[j].x, pts[j].z); if (y !== null && Math.abs(y - pts[j].y) < 0.05) { far = j; break; } }
    out.push(pts[far]); k = far;
  }
  return out.map((n) => ({ x: n.x, z: n.z, y: n.y }));
}
