// Lista de mapas disponibles
import { buildShopping } from './shopping.js';
import { buildEscuela } from './escuela.js';
import { buildWorld } from '../world.js';

function buildFeria(root, gltf) {
  const W = buildWorld(root, gltf);
  W.id = 'feria'; W.root = root; W.hdr = 'quarry_01_1k.hdr';
  W.fog = { color: 0xcfe0f0, near: 60, far: 200 }; root.fog = null;
  W.menu = { px: 1.2, py: 0, pz: 7.6, ry: 0.35, cam: [2.5, 1.55, 11.3], look: [1.25, 1.0, 7.6], camC: [1.55, 1.45, 10.0], lookC: [0.55, 1.05, 7.6] };
  W.podium = { x: 0, y: 1.25, z: 17.2, ry: Math.PI };
  W.orbit = { cx: 0, cz: 0, r: 30, h: 16, ly: 0 };
  return W;
}
export const MAPS = {
  escuela: { n: 'Escuela', e: '🏫', d: 'Patio, aulas en dos pisos, gimnasio y cantina', build: buildEscuela },
  shopping: { n: 'Shopping', e: '🏬', d: 'Dos pisos, locales y pasillos para esconderse', build: buildShopping },
  feria: { n: 'Feria', e: '🎪', d: 'La feria al aire libre (más abierta)', build: buildFeria },
};
export const MAP_IDS = Object.keys(MAPS);
export const DEFAULT_MAP = 'escuela';
