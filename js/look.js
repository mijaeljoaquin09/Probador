// Ropa, colores, pistas
import { pick } from './util.js';

export const COLORS = [
  { hex: 0xe8384f, m: 'rojo', f: 'roja', mp: 'rojos', fp: 'rojas' },
  { hex: 0x2f5fd0, m: 'azul', f: 'azul', mp: 'azules', fp: 'azules' },
  { hex: 0x3fa34d, m: 'verde', f: 'verde', mp: 'verdes', fp: 'verdes' },
  { hex: 0xf5c518, m: 'amarillo', f: 'amarilla', mp: 'amarillos', fp: 'amarillas' },
  { hex: 0xf28bb5, m: 'rosa', f: 'rosa', mp: 'rosas', fp: 'rosas' },
  { hex: 0x8a4fc7, m: 'violeta', f: 'violeta', mp: 'violetas', fp: 'violetas' },
  { hex: 0xf07c28, m: 'naranja', f: 'naranja', mp: 'naranjas', fp: 'naranjas' },
  { hex: 0xf4f1ea, m: 'blanco', f: 'blanca', mp: 'blancos', fp: 'blancas' },
  { hex: 0x26262b, m: 'negro', f: 'negra', mp: 'negros', fp: 'negras' },
  { hex: 0x7cc8ee, m: 'celeste', f: 'celeste', mp: 'celestes', fp: 'celestes' },
  { hex: 0x7a1f35, m: 'bordó', f: 'bordó', mp: 'bordó', fp: 'bordó' },
  { hex: 0x9a9ca3, m: 'gris', f: 'gris', mp: 'grises', fp: 'grises' },
  // colores de la tienda
  { hex: 0xd8a933, m: 'dorado', f: 'dorada', mp: 'dorados', fp: 'doradas', shop: 'col_oro' },
  { hex: 0xc9ced6, m: 'plateado', f: 'plateada', mp: 'plateados', fp: 'plateadas', shop: 'col_plata' },
  { hex: 0xff2fa0, m: 'rosa neón', f: 'rosa neón', mp: 'rosa neón', fp: 'rosa neón', shop: 'col_neon' },
  { hex: 0x9be22d, m: 'verde lima', f: 'verde lima', mp: 'verde lima', fp: 'verde lima', shop: 'col_lima' },
  { hex: 0x1b2a6b, m: 'azul noche', f: 'azul noche', mp: 'azul noche', fp: 'azul noche', shop: 'col_noche' },
  { hex: 0xff7a66, m: 'coral', f: 'coral', mp: 'coral', fp: 'coral', shop: 'col_coral' },
  // exclusivos del pase de batalla
  { hex: 0xb48cff, m: 'lila', f: 'lila', mp: 'lila', fp: 'lila', shop: 'col_t1' },
];
export const BASE = { COLORS: 12, HATS: 5, ACCS: 5 };
export const TOPS = [
  { n: 'Remera', g: 'f', sleeve: 1 },
  { n: 'Musculosa', g: 'f', sleeve: 0 },
  { n: 'Buzo', g: 'm', sleeve: 2, hood: 1 },
  { n: 'Campera', g: 'f', sleeve: 2, zip: 1 },
  { n: 'Camisa', g: 'f', sleeve: 2, collar: 1 },
];
export const TOP_PATS = ['', 'a rayas', 'a lunares', 'a cuadros'];
export const BOTS = [
  { n: 'Pantalón', g: 'm', len: 2 },
  { n: 'Short', g: 'm', len: 1 },
  { n: 'Pollera', g: 'f', len: 0, skirt: 1 },
  { n: 'Jogging', g: 'm', len: 2, stripe: 1 },
];
export const BOT_PATS = ['', 'a cuadros'];
export const HATS = [
  { n: 'Nada', g: 'm' },
  { n: 'Gorra', g: 'f' },
  { n: 'Sombrero', g: 'm' },
  { n: 'Gorro de lana', g: 'm' },
  { n: 'Boina', g: 'f' },
  { n: 'Corona', g: 'f', shop: 'hat_corona', nocolor: 1 },
  { n: 'Orejas de gato', g: 'fp', shop: 'hat_gato' },
  { n: 'Vincha con moño', g: 'f', shop: 'hat_vincha' },
  { n: 'Auriculares', g: 'mp', shop: 'hat_auris' },
];
export const ACCS = [
  { n: 'Nada', g: 'm' },
  { n: 'Lentes de sol', g: 'mp', nocolor: 1 },
  { n: 'Bufanda', g: 'f' },
  { n: 'Mochila', g: 'f' },
  { n: 'Cartera', g: 'f' },
  { n: 'Cadena dorada', g: 'f', shop: 'acc_collar', nocolor: 1 },
  { n: 'Alitas', g: 'fp', shop: 'acc_alas' },
  { n: 'Riñonera', g: 'f', shop: 'acc_rinonera' },
];
export const HAIRS = ['Corto', 'Largo', 'Colita', 'Rodete', 'Rulos', 'Pelado'];
export const HAIR_COLORS = [0x2b1d16, 0x5a3825, 0xa86b3c, 0xe2c27a, 0xc2462e, 0xb9b4b0];
export const SKINS = [0xffd9bf, 0xf2c19a, 0xd9a37a, 0xb97d55, 0x8d5a3b, 0x5f3b26];

// índices del array look
export const L = { TOP: 0, TOPC: 1, TOPP: 2, BOT: 3, BOTC: 4, BOTP: 5, SHOE: 6, HAT: 7, HATC: 8, ACC: 9, ACCC: 10, HAIR: 11, HAIRC: 12, SKIN: 13 };

export function randomLook(rng = Math.random, opts = {}) {
  const r = (n) => Math.floor(rng() * n) % n;
  const look = new Array(14).fill(0);
  look[L.TOP] = r(TOPS.length);
  look[L.TOPC] = r(BASE.COLORS);
  look[L.TOPP] = rng() < 0.62 ? 0 : 1 + r(3);
  look[L.BOT] = r(BOTS.length);
  look[L.BOTC] = r(BASE.COLORS);
  if (look[L.BOTC] === look[L.TOPC]) look[L.BOTC] = (look[L.BOTC] + 1 + r(BASE.COLORS - 1)) % BASE.COLORS;
  look[L.BOTP] = look[L.BOT] === 2 && rng() < 0.35 ? 1 : (rng() < 0.08 ? 1 : 0);
  look[L.SHOE] = r(BASE.COLORS);
  look[L.HAT] = rng() < 0.45 ? 0 : 1 + r(BASE.HATS - 1);
  look[L.HATC] = r(BASE.COLORS);
  look[L.ACC] = rng() < 0.4 ? 0 : 1 + r(BASE.ACCS - 1);
  look[L.ACCC] = r(BASE.COLORS);
  look[L.HAIR] = r(HAIRS.length);
  look[L.HAIRC] = r(HAIR_COLORS.length);
  look[L.SKIN] = r(SKINS.length);
  if (opts.keepBody) { look[L.HAIR] = opts.keepBody[L.HAIR]; look[L.HAIRC] = opts.keepBody[L.HAIRC]; look[L.SKIN] = opts.keepBody[L.SKIN]; }
  return look;
}
// cambia solo la ropa (mantiene pelo y piel)
export function newOutfit(rng, look) { return randomLook(rng, { keepBody: look }); }

function colorWord(ci, g) {
  const c = COLORS[ci];
  return g === 'f' ? c.f : g === 'fp' ? c.fp : g === 'mp' ? c.mp : c.m;
}

export const CATS = ['arriba', 'abajo', 'calzado', 'cabeza', 'accesorio'];
export const CAT_LABEL = { arriba: 'Arriba', abajo: 'Abajo', calzado: 'Calzado', cabeza: 'Cabeza', accesorio: 'Accesorio' };
export const CAT_ICON = { arriba: '👕', abajo: '👖', calzado: '👟', cabeza: '🧢', accesorio: '👜' };

// Snapshot de una categoría: [catIndex, a, b, c]
export function clueOf(look, catIdx) {
  switch (CATS[catIdx]) {
    case 'arriba': return [catIdx, look[L.TOP], look[L.TOPC], look[L.TOPP]];
    case 'abajo': return [catIdx, look[L.BOT], look[L.BOTC], look[L.BOTP]];
    case 'calzado': return [catIdx, look[L.SHOE], 0, 0];
    case 'cabeza': return [catIdx, look[L.HAT], look[L.HATC], 0];
    case 'accesorio': return [catIdx, look[L.ACC], look[L.ACCC], 0];
  }
}
export function clueText(c) {
  const cat = CATS[c[0]];
  if (cat === 'arriba') {
    const t = TOPS[c[1]];
    return `${t.n} ${colorWord(c[2], t.g)}${c[3] ? ' ' + TOP_PATS[c[3]] : ''}`;
  }
  if (cat === 'abajo') {
    const t = BOTS[c[1]];
    return `${t.n} ${colorWord(c[2], t.g)}${c[3] ? ' ' + BOT_PATS[c[3]] : ''}`;
  }
  if (cat === 'calzado') return `Zapatillas ${colorWord(c[1], 'fp')}`;
  if (cat === 'cabeza') {
    if (c[1] === 0) return 'Nada en la cabeza';
    const t = HATS[c[1]];
    return `${t.n} ${colorWord(c[2], t.g)}`;
  }
  if (cat === 'accesorio') {
    if (c[1] === 0) return 'Sin accesorios';
    const t = ACCS[c[1]];
    return t.nocolor ? t.n : `${t.n} ${colorWord(c[2], t.g)}`;
  }
  return '';
}
// frase con "con ..." para el altoparlante
export function clueWithText(c) {
  const t = clueText(c);
  const cat = CATS[c[0]];
  if (cat === 'cabeza' && c[1] === 0) return 'la cabeza descubierta';
  if (cat === 'accesorio' && c[1] === 0) return 'nada de accesorios';
  return t.charAt(0).toLowerCase() + t.slice(1);
}
export function lookMatches(look, c) {
  const s = clueOf(look, c[0]);
  if (CATS[c[0]] === 'cabeza' && c[1] === 0) return s[1] === 0;
  if (CATS[c[0]] === 'accesorio' && c[1] === 0) return s[1] === 0;
  if (CATS[c[0]] === 'accesorio' && ACCS[c[1]].nocolor) return s[1] === c[1];
  return s[1] === c[1] && s[2] === c[2] && s[3] === c[3];
}
export const lookKey = (look) => look.join(',');

// ¿el look usa algo que no tenés?
export function lookAllowed(look, owned = []) {
  const has = (id) => !id || owned.includes(id);
  for (const i of [L.TOPC, L.BOTC, L.SHOE, L.HATC, L.ACCC]) if (COLORS[look[i]] && !has(COLORS[look[i]].shop)) return false;
  if (HATS[look[L.HAT]] && !has(HATS[look[L.HAT]].shop)) return false;
  if (ACCS[look[L.ACC]] && !has(ACCS[look[L.ACC]].shop)) return false;
  return true;
}
export function sanitizeLook(look, owned = []) {
  const l = look.slice();
  for (const i of [L.TOPC, L.BOTC, L.SHOE, L.HATC, L.ACCC]) if (!COLORS[l[i]] || (COLORS[l[i]].shop && !owned.includes(COLORS[l[i]].shop))) l[i] = i === L.SHOE ? 7 : 0;
  if (!HATS[l[L.HAT]] || (HATS[l[L.HAT]].shop && !owned.includes(HATS[l[L.HAT]].shop))) l[L.HAT] = 0;
  if (!ACCS[l[L.ACC]] || (ACCS[l[L.ACC]].shop && !owned.includes(ACCS[l[L.ACC]].shop))) l[L.ACC] = 0;
  return l;
}
