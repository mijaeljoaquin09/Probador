// Utilidades generales
export function mulberry32(a) {
  a = a >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];
export function angDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function lerpAng(a, b, t) { return a + angDiff(a, b) * t; }
export function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
export function shuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
export function makeCode() {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < 4; i++) s += L[Math.floor(Math.random() * L.length)];
  return s;
}
export function uid() { return Math.random().toString(36).slice(2, 10); }
export const isTouch = () => ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
export function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  const m = Math.floor(s / 60), r = s % 60;
  return m + ':' + String(r).padStart(2, '0');
}
export const store = {
  get(k, d) { try { const v = localStorage.getItem('probador:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('probador:' + k, JSON.stringify(v)); } catch (e) { } }
};
