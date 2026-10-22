// Carteles con número: estilos (algunos se compran en la tienda)
import * as THREE from 'three';

export const TAG_STYLES = {
  tag_clasico: { n: 'Clásico', bg: '#fffaf0', fg: '#1a0d22', bd: '#e8384f' },
  tag_madera: { n: 'Madera', bg: 'wood', fg: '#fff4e0', bd: '#5e3b1d' },
  tag_neon: { n: 'Neón', bg: '#140a1f', fg: '#ff4fd8', bd: '#29f0ff', glow: 1 },
  tag_corazon: { n: 'Corazones', bg: '#ff7fb6', fg: '#ffffff', bd: '#c0264f', hearts: 1 },
  tag_oro: { n: 'Dorado', bg: 'gold', fg: '#3a2500', bd: '#8a6400' },
  tag_holo: { n: 'Holográfico', bg: 'holo', fg: '#1a0d22', bd: '#ffffff' },
};
const TEAM = { r: '#e8384f', b: '#2f6fe0' };
const cache = new Map();

function draw(num, style, team, mode) {
  const st = TAG_STYLES[style] || TAG_STYLES.tag_clasico;
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  // fondo
  if (st.bg === 'wood') { g.fillStyle = '#a86e3c'; g.fillRect(0, 0, 256, 128); g.strokeStyle = 'rgba(60,30,10,.35)'; for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(0, 8 + i * 14); g.bezierCurveTo(80, 2 + i * 14, 170, 18 + i * 14, 256, 8 + i * 14); g.stroke(); } }
  else if (st.bg === 'gold') { const gr = g.createLinearGradient(0, 0, 256, 128); gr.addColorStop(0, '#fff1a8'); gr.addColorStop(0.5, '#e2b23a'); gr.addColorStop(1, '#fff0a0'); g.fillStyle = gr; g.fillRect(0, 0, 256, 128); }
  else if (st.bg === 'holo') { const gr = g.createLinearGradient(0, 0, 256, 128); ['#9ef0ff', '#c9a6ff', '#ffb3e6', '#fff3a8', '#a8ffcf'].forEach((col, i) => gr.addColorStop(i / 4, col)); g.fillStyle = gr; g.fillRect(0, 0, 256, 128); }
  else { g.fillStyle = st.bg; g.fillRect(0, 0, 256, 128); }
  if (st.hearts) { g.fillStyle = 'rgba(255,255,255,.35)'; g.font = '26px sans-serif'; for (let i = 0; i < 10; i++) g.fillText('♥', (i * 53) % 250, 20 + ((i * 37) % 110)); }
  // borde (en equipos, color del equipo)
  g.lineWidth = 12; g.strokeStyle = team ? TEAM[team] : st.bd; g.strokeRect(6, 6, 244, 116);
  // agujerito
  g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.arc(22, 22, 6, 0, Math.PI * 2); g.fill();
  // número
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 100px "Bagel Fat One","Arial Black",sans-serif';
  if (mode === 'blur') { g.fillStyle = st.fg; g.globalAlpha = 0.28; g.fillText('···', 128, 60); }
  else {
    if (st.glow || mode === 'glow') { g.shadowColor = st.glow ? st.bd : '#ffe14a'; g.shadowBlur = 18; }
    g.fillStyle = st.fg; g.fillText(String(num), 128, 70);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
// material listo para el cartel. mode: '' | 'blur' | 'glow'
export function tagMaterial(num, style = 'tag_clasico', team = '', mode = '') {
  const k = num + '|' + style + '|' + team + '|' + mode;
  if (cache.has(k)) return cache.get(k);
  // sin depthTest: el cartel siempre se ve por encima del pelo/gorro; las paredes las controla game.js ocultándolo
  const m = new THREE.MeshBasicMaterial({ map: draw(num, style, team, mode), toneMapped: mode !== 'glow', depthTest: false, depthWrite: false });
  if (mode === 'glow') m.color.setRGB(1.6, 1.6, 1.6);
  cache.set(k, m);
  if (cache.size > 300) { const first = cache.keys().next().value; cache.get(first).map.dispose(); cache.get(first).dispose(); cache.delete(first); }
  return m;
}
// vista previa para la tienda (canvas como imagen)
export function tagPreviewURL(style, num = 427) {
  const t = draw(num, style, '', ''); return t.image.toDataURL();
}
