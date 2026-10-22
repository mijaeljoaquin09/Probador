// Música y efectos sintetizados (sin archivos de audio)
let ctx = null, master, musicG, sfxG, noiseBuf;
const state = { music: 0.55, sfx: 0.8, track: null, timer: null };

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3; comp.connect(master);
  musicG = ctx.createGain(); musicG.gain.value = state.music * 0.5; musicG.connect(comp);
  sfxG = ctx.createGain(); sfxG.gain.value = state.sfx; sfxG.connect(comp);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
export function setVolumes(m, s) { state.music = m; state.sfx = s; if (musicG) { musicG.gain.value = m * 0.5; sfxG.gain.value = s; } }
export function getVolumes() { return { music: state.music, sfx: state.sfx }; }

function tone(freq, t, dur, { type = 'sine', vol = 0.3, attack = 0.005, release = 0.08, dest, glide, filter } = {}) {
  if (!ctx) return;
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.setValueAtTime(vol, t + Math.max(attack, dur - release)); g.gain.linearRampToValueAtTime(0, t + dur);
  let node = o;
  if (filter) { const f = ctx.createBiquadFilter(); f.type = filter.type || 'lowpass'; f.frequency.value = filter.f; f.Q.value = filter.q || 0.7; o.connect(f); node = f; }
  node.connect(g); g.connect(dest || sfxG);
  o.start(t); o.stop(t + dur + 0.05);
}
function noise(t, dur, { vol = 0.2, f = 3000, type = 'bandpass', q = 1, dest, attack = 0.002 } = {}) {
  if (!ctx) return;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(dest || sfxG);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}
const N = (n) => 440 * Math.pow(2, (n - 69) / 12);

// ---- música ----
const SONGS = {
  feria: { bpm: 98, chords: [[57, 60, 64], [55, 59, 62], [53, 57, 60], [52, 56, 59]], scale: [69, 71, 72, 74, 76, 77, 79, 81], style: 'cumbia' },
  flash: { bpm: 124, chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]], scale: [72, 74, 76, 79, 81, 84], style: 'pop' },
  menu: { bpm: 92, chords: [[53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62], [57, 60, 64, 67]], scale: [69, 72, 74, 76, 79, 81], style: 'chill' },
};
function makeMelody(song, seed) {
  let s = seed; const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const mel = [];
  for (let i = 0; i < 32; i++) mel.push(r() < 0.62 ? song.scale[Math.floor(r() * song.scale.length)] : 0);
  return mel;
}
export function playMusic(name) {
  if (!ctx) return;
  if (state.track && state.track.name === name) return;
  stopMusic();
  const song = SONGS[name]; if (!song) return;
  const tr = { name, song, step: 0, next: ctx.currentTime + 0.1, mel: makeMelody(song, name.length * 77 + 5), bus: ctx.createGain() };
  tr.bus.gain.value = 0; tr.bus.connect(musicG); tr.bus.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.2);
  state.track = tr;
  const sixteenth = 60 / song.bpm / 4;
  state.timer = setInterval(() => {
    while (tr.next < ctx.currentTime + 0.2) { scheduleStep(tr, tr.step, tr.next, sixteenth); tr.step++; tr.next += sixteenth; }
  }, 30);
}
export function stopMusic() {
  if (state.timer) clearInterval(state.timer); state.timer = null;
  if (state.track && ctx) { const b = state.track.bus; b.gain.cancelScheduledValues(ctx.currentTime); b.gain.setValueAtTime(b.gain.value, ctx.currentTime); b.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5); setTimeout(() => b.disconnect(), 700); }
  state.track = null;
}
function scheduleStep(tr, step, t, sx) {
  const { song } = tr; const d = tr.bus;
  const bar = Math.floor(step / 16) % 4, s = step % 16;
  const ch = song.chords[bar];
  if (song.style === 'cumbia') {
    // güiro
    if (s % 4 === 0) noise(t, sx * 1.6, { vol: 0.12, f: 5200, q: 2, dest: d, attack: sx * 0.8 });
    else if (s % 2 === 0) noise(t, sx * 0.5, { vol: 0.07, f: 6000, q: 2, dest: d });
    // bajo
    if (s === 0 || s === 8) tone(N(ch[0] - 24), t, sx * 3, { type: 'triangle', vol: 0.32, dest: d });
    if (s === 6 || s === 14) tone(N(ch[0] - 17), t, sx * 1.8, { type: 'triangle', vol: 0.26, dest: d });
    // acordes en contratiempo
    if (s % 4 === 2) for (const n of ch) tone(N(n), t, sx * 1.2, { type: 'square', vol: 0.035, dest: d, filter: { f: 1800 } });
    // bombo y redoblante
    if (s % 8 === 0) tone(110, t, 0.18, { type: 'sine', vol: 0.4, glide: 45, dest: d });
    if (s % 8 === 4) noise(t, 0.12, { vol: 0.12, f: 1800, q: 0.8, dest: d });
    // melodía tipo acordeón
    const m = tr.mel[(step >> 1) % 32];
    if (s % 2 === 0 && m && bar !== 3) tone(N(m), t, sx * 1.9, { type: 'sawtooth', vol: 0.05, dest: d, filter: { f: 2200 }, attack: 0.02 });
  } else if (song.style === 'pop') {
    if (s % 4 === 0) tone(120, t, 0.22, { type: 'sine', vol: 0.55, glide: 40, dest: d });
    if (s % 8 === 4) { noise(t, 0.15, { vol: 0.2, f: 1500, q: 0.6, dest: d }); noise(t + 0.01, 0.1, { vol: 0.12, f: 3000, q: 1, dest: d }); }
    if (s % 2 === 1) noise(t, 0.04, { vol: 0.06, f: 9000, type: 'highpass', dest: d });
    if (s % 2 === 0) tone(N(ch[0] - (s % 4 ? 12 : 24)), t, sx * 1.6, { type: 'sawtooth', vol: 0.12, dest: d, filter: { f: 700 } });
    if (s === 2 || s === 6 || s === 10 || s === 11 || s === 14) for (const n of ch) tone(N(n + 12), t, sx * 1.5, { type: 'square', vol: 0.03, dest: d, filter: { f: 3000 } });
    const m = tr.mel[step % 32]; if (s % 2 === 0 && m) tone(N(m), t, sx * 1.6, { type: 'triangle', vol: 0.09, dest: d });
  } else {
    if (s === 0) for (const n of ch) tone(N(n), t, sx * 15, { type: 'triangle', vol: 0.05, dest: d, attack: 0.3, release: 1.2 });
    if (s % 4 === 0) tone(N(ch[0] - 24), t, sx * 3.5, { type: 'sine', vol: 0.25, dest: d });
    if (s % 8 === 4) noise(t, 0.08, { vol: 0.05, f: 4000, dest: d });
    if (s % 2 === 0) noise(t, 0.03, { vol: 0.03, f: 9000, type: 'highpass', dest: d });
    const m = tr.mel[(step >> 1) % 32]; if (s % 4 === 0 && m) tone(N(m), t, sx * 3, { type: 'sine', vol: 0.07, dest: d, attack: 0.02 });
  }
}

// ---- efectos ----
export const sfx = {
  click() { if (!ctx) return; const t = ctx.currentTime; tone(880, t, 0.06, { type: 'triangle', vol: 0.15 }); },
  pick() { if (!ctx) return; const t = ctx.currentTime; [72, 76, 79, 84].forEach((n, i) => tone(N(n), t + i * 0.05, 0.12, { type: 'triangle', vol: 0.18 })); },
  use() { if (!ctx) return; const t = ctx.currentTime; tone(N(67), t, 0.25, { type: 'sine', vol: 0.2, glide: N(79) }); noise(t, 0.2, { vol: 0.08, f: 4000 }); },
  hit() { if (!ctx) return; const t = ctx.currentTime; noise(t, 0.12, { vol: 0.3, f: 1200, q: 0.6 }); [60, 64, 67, 72].forEach((n, i) => tone(N(n + 12), t + 0.05 + i * 0.07, 0.22, { type: 'square', vol: 0.08, filter: { f: 3000 } })); },
  wrong() { if (!ctx) return; const t = ctx.currentTime; tone(180, t, 0.18, { type: 'sawtooth', vol: 0.14, filter: { f: 900 } }); tone(140, t + 0.17, 0.3, { type: 'sawtooth', vol: 0.14, filter: { f: 700 } }); },
  elim() { if (!ctx) return; const t = ctx.currentTime; tone(N(72), t, 0.5, { type: 'triangle', vol: 0.2, glide: N(48) }); noise(t, 0.5, { vol: 0.15, f: 800 }); },
  clue() { if (!ctx) return; const t = ctx.currentTime; tone(N(84), t, 0.3, { type: 'sine', vol: 0.16 }); tone(N(91), t + 0.08, 0.4, { type: 'sine', vol: 0.12 }); },
  bark() { if (!ctx) return; const t = ctx.currentTime; for (const o of [0, 0.18]) { tone(520, t + o, 0.09, { type: 'sawtooth', vol: 0.16, glide: 300, filter: { f: 1400, q: 2 } }); noise(t + o, 0.08, { vol: 0.1, f: 900 }); } },
  rain() { if (!ctx) return; const t = ctx.currentTime; noise(t, 2.2, { vol: 0.12, f: 2500, q: 0.3, attack: 0.3 }); },
  chime() { if (!ctx) return; const t = ctx.currentTime; tone(N(76), t, 0.5, { type: 'sine', vol: 0.22 }); tone(N(72), t + 0.35, 0.7, { type: 'sine', vol: 0.22 }); },
  curtain() { if (!ctx) return; const t = ctx.currentTime; noise(t, 0.4, { vol: 0.12, f: 1800, q: 0.4, attack: 0.08 }); },
  beep(hi) { if (!ctx) return; const t = ctx.currentTime; tone(hi ? 1320 : 660, t, hi ? 0.4 : 0.15, { type: 'square', vol: 0.08, filter: { f: 3000 } }); },
  heart() { if (!ctx) return; const t = ctx.currentTime; tone(60, t, 0.12, { vol: 0.4, glide: 40 }); tone(55, t + 0.18, 0.12, { vol: 0.3, glide: 38 }); },
  pop() { if (!ctx) return; const t = ctx.currentTime; tone(600, t, 0.08, { type: 'sine', vol: 0.2, glide: 1200 }); },
  good() { if (!ctx) return; const t = ctx.currentTime; tone(N(79), t, 0.12, { type: 'triangle', vol: 0.15 }); },
  fanfare() { if (!ctx) return; const t = ctx.currentTime; [[60, 0], [64, 0.12], [67, 0.24], [72, 0.36], [67, 0.6], [72, 0.72]].forEach(([n, o]) => tone(N(n + 12), t + o, 0.3, { type: 'square', vol: 0.08, filter: { f: 2600 } })); },
  sneak() { if (!ctx) return; const t = ctx.currentTime; tone(N(55), t, 0.3, { type: 'triangle', vol: 0.12, glide: N(50) }); },
};
