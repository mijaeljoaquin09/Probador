// Conexión con Supabase: cuentas, perfil, gemas, tienda, salas y panel de administración.
// Con ?mock=1 usa una versión de prueba guardada en este navegador (para probar sin internet).
import { store, uid } from './util.js';

export const SUPABASE_URL = 'https://griqqtkccsiogwxaappx.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_eZs1yY90WJibdbU2_72HXA_syi3e-0l';
const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';

const ERR = {
  'Invalid login credentials': 'Email o contraseña incorrectos.',
  'User already registered': 'Ya hay una cuenta con ese email. Probá iniciar sesión.',
  'Email not confirmed': 'Tenés que confirmar tu email. Revisá tu casilla (y el spam).',
  'Password should be at least 6 characters.': 'La contraseña tiene que tener al menos 6 caracteres.',
  'Unable to validate email address: invalid format': 'Ese email no es válido.',
  'For security purposes, you can only request this after': 'Esperá un minuto y probá de nuevo.',
  'signups are disabled': 'Por ahora no se pueden crear cuentas nuevas. Avisale a la administradora.',
  'logins are disabled': 'Por ahora no se puede entrar con email. Avisale a la administradora.',
};
export function niceError(e) {
  const m = (e && (e.message || e.error_description || e.msg)) || String(e);
  for (const k in ERR) if (m.includes(k)) return ERR[k];
  if (/fetch|network|Failed/i.test(m)) return 'No hay conexión con el servidor. Revisá tu internet.';
  if (/rate limit/i.test(m)) return 'Demasiados intentos. Esperá unos minutos.';
  return m;
}
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar la conexión')); document.head.appendChild(s); }); }

// ================= Supabase real =================
class SupaBackend {
  constructor() { this.sb = null; this.user = null; this.profile = null; this.listeners = new Set(); this.kind = 'supabase'; }
  async init() {
    if (!window.supabase) await loadScript(LIB);
    this.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    const { data } = await this.sb.auth.getSession();
    this.user = data.session ? data.session.user : null;
    this.sb.auth.onAuthStateChange((ev, session) => { this.user = session ? session.user : null; for (const f of this.listeners) f(ev); });
    return this.user;
  }
  onAuth(f) { this.listeners.add(f); }
  get email() { return this.user ? this.user.email : ''; }
  async signUp(email, pass, username, look) {
    const ok = await this.usernameAvailable(username);
    if (!ok) throw new Error('Ese nombre ya está en uso. Probá otro.');
    const { data, error } = await this.sb.auth.signUp({ email, password: pass, options: { data: { username, look }, emailRedirectTo: location.origin + location.pathname } });
    if (error) throw error;
    this.user = data.session ? data.user : null;
    return { needsConfirm: !data.session };
  }
  async signIn(email, pass) { const { data, error } = await this.sb.auth.signInWithPassword({ email, password: pass }); if (error) throw error; this.user = data.user; return data.user; }
  async signOut() { await this.sb.auth.signOut(); this.user = null; this.profile = null; }
  async resetPassword(email) { const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }); if (error) throw error; }
  async updatePassword(pass) { const { error } = await this.sb.auth.updateUser({ password: pass }); if (error) throw error; }
  async usernameAvailable(name) { const { data, error } = await this.sb.rpc('username_available', { p_name: name }); if (error) throw error; return data; }
  async loadProfile() {
    for (let i = 0; i < 5; i++) {
      const { data, error } = await this.sb.from('profiles').select('*').eq('id', this.user.id).maybeSingle();
      if (error) throw error;
      if (data) { this.profile = data; return data; }
      await new Promise((r) => setTimeout(r, 600));
    }
    throw new Error('No encontramos tu perfil. Probá de nuevo.');
  }
  async saveProfile(fields) {
    const { data, error } = await this.sb.from('profiles').update(fields).eq('id', this.user.id).select().single();
    if (error) { if (/duplicate|unique/i.test(error.message)) throw new Error('Ese nombre ya está en uso.'); throw error; }
    this.profile = data; return data;
  }
  async rpc(name, args) { const { data, error } = await this.sb.rpc(name, args); if (error) throw error; return data; }
  async shop() { const { data, error } = await this.sb.from('shop_items').select('*').eq('active', true).order('sort'); if (error) throw error; return data; }
  async buy(id) { const r = await this.rpc('buy_item', { p_item: id }); this.profile.gems = r.gems; this.profile.owned = r.owned; return r; }
  async reportMatch(finds, won) { const r = await this.rpc('report_match', { p_finds: finds, p_won: won }); await this.loadProfile(); return r; }
  async claimDaily() { const r = await this.rpc('claim_daily', {}); if (r.gained) await this.loadProfile(); return r; }
  async touch() { try { await this.rpc('touch_seen', {}); } catch (e) { } }
  async leaderboard(by = 'wins') { const { data, error } = await this.sb.from('profiles').select('id,username,name_color,wins,finds,xp,games,look').eq('banned', false).order(by, { ascending: false }).limit(30); if (error) throw error; return data; }
  async gemLog(userId) { const { data, error } = await this.sb.from('gem_log').select('*').eq('user_id', userId || this.user.id).order('created_at', { ascending: false }).limit(30); if (error) throw error; return data; }
  // salas
  async createRoom(r) { const { error } = await this.sb.from('rooms').upsert({ ...r, host: this.user.id, updated_at: new Date().toISOString() }); if (error) throw error; }
  async updateRoom(code, f) { await this.sb.from('rooms').update({ ...f, updated_at: new Date().toISOString() }).eq('code', code); }
  async deleteRoom(code) { await this.sb.from('rooms').delete().eq('code', code); }
  async getRoom(code) { const { data, error } = await this.sb.from('rooms').select('*').eq('code', code).maybeSingle(); if (error) throw error; return data; }
  async listRooms() { const since = new Date(Date.now() - 90000).toISOString(); const { data, error } = await this.sb.from('rooms').select('*').eq('is_public', true).gt('updated_at', since).order('updated_at', { ascending: false }).limit(30); if (error) throw error; return data; }
  // admin
  async adminSearch(q) {
    let req = this.sb.from('profiles').select('*').order('last_seen', { ascending: false }).limit(40);
    if (q) req = req.ilike('username', `%${q}%`);
    const { data, error } = await req; if (error) throw error; return data;
  }
  async adminGems(id, amount, reason) { return this.rpc('admin_give_gems', { p_user: id, p_amount: amount, p_reason: reason }); }
  async adminBan(id, v) { return this.rpc('admin_set_banned', { p_user: id, p_banned: v }); }
  async adminItem(id, item, give) { return this.rpc('admin_set_item', { p_user: id, p_item: item, p_give: give }); }
  async adminAdmin(id, v) { return this.rpc('admin_set_admin', { p_user: id, p_admin: v }); }
  async adminRename(id, name) { return this.rpc('admin_rename', { p_user: id, p_name: name }); }
  async adminStats() { return this.rpc('admin_stats', {}); }
  // objetos y pase de batalla
  async consumables() { const { data, error } = await this.sb.from('consumables').select('*').eq('active', true).order('sort'); if (error) throw error; return data; }
  async buyConsumable(id, qty) { const r = await this.rpc('buy_consumable', { p_item: id, p_qty: qty }); this.profile.gems = r.gems; this.profile.items = r.items; return r; }
  async useConsumable(id) { const r = await this.rpc('use_consumable', { p_item: id }); if (this.profile) this.profile.items = r.items; return r; }
  async passRewards() { const { data, error } = await this.sb.from('pass_rewards').select('*').order('level'); if (error) throw error; return data; }
  async buyPass() { const r = await this.rpc('buy_pass', {}); await this.loadProfile(); return r; }
  async claimPass(level, premium) { const r = await this.rpc('claim_pass', { p_level: level, p_premium: premium }); await this.loadProfile(); return r; }
  async adminGiveCons(id, item, qty) { return this.rpc('admin_give_consumable', { p_user: id, p_item: item, p_qty: qty }); }
  channel(name) { return this.sb.channel(name, { config: { broadcast: { self: false, ack: false } } }); }
}

// ================= Modo de prueba (sin servidor) =================
const SHOP_MOCK = [
  ['col_oro', 'color', 'Dorado', 150], ['col_plata', 'color', 'Plateado', 120], ['col_neon', 'color', 'Rosa neón', 120], ['col_lima', 'color', 'Verde lima', 100], ['col_noche', 'color', 'Azul noche', 100], ['col_coral', 'color', 'Coral', 100],
  ['hat_corona', 'hat', 'Corona', 400], ['hat_gato', 'hat', 'Orejas de gato', 300], ['hat_vincha', 'hat', 'Vincha con moño', 220], ['hat_auris', 'hat', 'Auriculares', 260],
  ['acc_collar', 'acc', 'Cadena dorada', 250], ['acc_alas', 'acc', 'Alitas', 450], ['acc_rinonera', 'acc', 'Riñonera', 180],
  ['tag_neon', 'tag', 'Cartel neón', 250], ['tag_madera', 'tag', 'Cartel de madera', 150], ['tag_oro', 'tag', 'Cartel dorado', 400], ['tag_holo', 'tag', 'Cartel holográfico', 500], ['tag_corazon', 'tag', 'Cartel de corazones', 200],
  ['nc_rosa', 'namecolor', 'Nombre rosa', 100], ['nc_oro', 'namecolor', 'Nombre dorado', 250], ['nc_turquesa', 'namecolor', 'Nombre turquesa', 100], ['nc_arcoiris', 'namecolor', 'Nombre arcoíris', 450],
  ['emo_baile', 'emote', 'Baile', 200], ['emo_festejo', 'emote', 'Festejo', 200], ['emo_pose', 'emote', 'Pose de pasarela', 300],
].map(([id, kind, name, price], i) => ({ id, kind, name, price, sort: i }));
const CONS_MOCK = [['bin', 30], ['cam', 25], ['liq', 40], ['per', 30], ['box', 35], ['esp', 25], ['tur', 30], ['res', 30], ['rem', 45], ['apa', 45], ['hum', 35], ['ban', 20]].map(([id, price], i) => ({ id, price, sort: i + 1, name: id }));
const PASS_MOCK = (() => {
  const F = [['gems', null, 50], ['cons', 'box', 2], ['gems', null, 60], ['cons', 'tur', 2], ['gems', null, 80], ['cons', 'cam', 2], ['gems', null, 60], ['cons', 'hum', 2], ['gems', null, 70], ['item', 'tag_madera', 1], ['cons', 'per', 2], ['gems', null, 80], ['cons', 'esp', 2], ['gems', null, 90], ['item', 'col_neon', 1], ['cons', 'ban', 3], ['gems', null, 100], ['cons', 'liq', 2], ['gems', null, 100], ['item', 'emo_festejo', 1], ['cons', 'apa', 2], ['gems', null, 120], ['cons', 'rem', 2], ['gems', null, 120], ['item', 'nc_turquesa', 1], ['cons', 'res', 3], ['gems', null, 150], ['cons', 'bin', 3], ['gems', null, 150], ['gems', null, 200]];
  const P = [['item', 'col_t1', 1], ['gems', null, 100], ['cons', 'bin', 3], ['cons', 'res', 3], ['item', 'nc_t1', 1], ['gems', null, 120], ['cons', 'apa', 3], ['item', 'hat_gato', 1], ['cons', 'rem', 3], ['item', 'emo_giro', 1], ['gems', null, 150], ['cons', 'liq', 3], ['item', 'acc_rinonera', 1], ['cons', 'box', 4], ['gems', null, 200], ['cons', 'bin', 4], ['item', 'hat_vincha', 1], ['gems', null, 200], ['cons', 'tur', 4], ['item', 'acc_alas', 1], ['gems', null, 220], ['cons', 'hum', 4], ['item', 'hat_corona', 1], ['cons', 'cam', 4], ['gems', null, 250], ['cons', 'per', 4], ['item', 'nc_arcoiris', 1], ['gems', null, 300], ['cons', 'rem', 4], ['item', 'tag_t1', 1]];
  const out = []; for (let i = 0; i < 30; i++) { out.push({ level: i + 1, premium: false, kind: F[i][0], ref: F[i][1], amount: F[i][2] }); out.push({ level: i + 1, premium: true, kind: P[i][0], ref: P[i][1], amount: P[i][2] }); } return out;
})();
class MockBackend {
  constructor() { this.kind = 'mock'; this.listeners = new Set(); this.user = null; this.profile = null; }
  db() { return store.get('mockdb', { users: {}, rooms: {}, log: [] }); }
  save(d) { store.set('mockdb', d); }
  async init() { const s = store.get('mocksession', null); const d = this.db(); if (s && d.users[s]) this.user = { id: s, email: d.users[s].email }; return this.user; }
  onAuth(f) { this.listeners.add(f); }
  get email() { return this.user ? this.user.email : ''; }
  async signUp(email, pass, username, look) {
    const d = this.db(); if (Object.values(d.users).some((u) => u.email === email)) throw new Error('User already registered');
    if (Object.values(d.users).some((u) => u.p.username.toLowerCase() === username.toLowerCase())) throw new Error('Ese nombre ya está en uso. Probá otro.');
    const id = uid() + uid();
    d.users[id] = { email, pass, p: { id, username, look: look || '', tag_style: 'tag_clasico', name_color: 'nc_blanco', emote: 'emo_saludo', gems: 150, xp: 0, games: 0, wins: 0, finds: 0, owned: [], items: { bin: 2, box: 2, tur: 2, cam: 2 }, pass_xp: 0, pass_premium: false, pass_free: [], pass_prem: [], is_admin: email.toLowerCase() === 'mijaelyjoaquin09@gmail.com' || email.startsWith('admin'), banned: false, last_seen: new Date().toISOString() } };
    this.save(d); this.user = { id, email }; store.set('mocksession', id); return { needsConfirm: false };
  }
  async signIn(email, pass) { const d = this.db(); const u = Object.values(d.users).find((x) => x.email === email && x.pass === pass); if (!u) throw new Error('Invalid login credentials'); this.user = { id: u.p.id, email }; store.set('mocksession', u.p.id); return this.user; }
  async signOut() { this.user = null; this.profile = null; store.set('mocksession', null); }
  async resetPassword() { }
  async updatePassword() { }
  async usernameAvailable(n) { return !Object.values(this.db().users).some((u) => u.p.username.toLowerCase() === n.toLowerCase()); }
  async loadProfile() { const d = this.db(); this.profile = { ...d.users[this.user.id].p }; return this.profile; }
  async saveProfile(f) { const d = this.db(); const p = d.users[this.user.id].p; for (const k of ['username', 'look', 'tag_style', 'name_color', 'emote']) if (f[k] !== undefined) p[k] = f[k]; this.save(d); return this.loadProfile(); }
  async shop() { return SHOP_MOCK; }
  mp() { const d = this.db(); const p = d.users[this.user.id].p; p.items = p.items || {}; p.pass_free = p.pass_free || []; p.pass_prem = p.pass_prem || []; p.pass_xp = p.pass_xp || 0; return [d, p]; }
  async consumables() { return CONS_MOCK; }
  async buyConsumable(id, qty) { const [d, p] = this.mp(); const c = CONS_MOCK.find((x) => x.id === id); const total = qty === 5 ? Math.floor(c.price * 5 * 0.8) : c.price; if (p.gems < total) throw new Error('No te alcanzan las gemas'); p.gems -= total; p.items[id] = (p.items[id] || 0) + qty; this.save(d); this.profile = { ...p }; return { gems: p.gems, items: p.items }; }
  async useConsumable(id) { const [d, p] = this.mp(); if (!(p.items[id] > 0)) throw new Error('No te quedan'); p.items[id]--; this.save(d); this.profile = { ...p }; return { items: p.items }; }
  async passRewards() { return PASS_MOCK; }
  async buyPass() { const [d, p] = this.mp(); if (p.pass_premium) throw new Error('Ya tenés el pase premium'); if (p.gems < 600) throw new Error('No te alcanzan las gemas'); p.gems -= 600; p.pass_premium = true; this.save(d); this.profile = { ...p }; return {}; }
  async claimPass(level, prem) { const [d, p] = this.mp(); const lvl = Math.min(30, 1 + Math.floor(p.pass_xp / 250)); if (level > lvl) throw new Error('Todavía no llegaste a ese nivel'); if (prem && !p.pass_premium) throw new Error('Necesitás el pase premium'); const list = prem ? p.pass_prem : p.pass_free; if (list.includes(level)) throw new Error('Ya lo reclamaste'); const rw = PASS_MOCK.find((r) => r.level === level && r.premium === !!prem); if (rw.kind === 'gems') p.gems += rw.amount; else if (rw.kind === 'cons') p.items[rw.ref] = (p.items[rw.ref] || 0) + rw.amount; else if (p.owned.includes(rw.ref)) p.gems += 100; else p.owned.push(rw.ref); list.push(level); this.save(d); this.profile = { ...p }; return { got: rw.ref, kind: rw.kind }; }
  async adminGiveCons(id, item, qty) { const d = this.db(); const p = d.users[id].p; p.items = p.items || {}; p.items[item] = Math.max(0, (p.items[item] || 0) + qty); this.save(d); return p.items; }
  async buy(id) { const d = this.db(); const p = d.users[this.user.id].p; const it = SHOP_MOCK.find((x) => x.id === id); if (p.owned.includes(id)) throw new Error('Ya lo tenés'); if (p.gems < it.price) throw new Error('No te alcanzan las gemas'); p.gems -= it.price; p.owned.push(id); d.log.unshift({ user_id: p.id, delta: -it.price, reason: 'Compra: ' + it.name, created_at: new Date().toISOString() }); this.save(d); this.profile = { ...p }; return { gems: p.gems, owned: p.owned }; }
  async reportMatch(f, won) { const d = this.db(); const p = d.users[this.user.id].p; const g = Math.min(200, 20 + f * 15 + (won ? 60 : 0)); p.gems += g; const xg = 40 + f * 20 + (won ? 80 : 0); p.xp += xg; p.pass_xp = (p.pass_xp || 0) + xg; p.games++; p.finds += f; if (won) p.wins++; this.save(d); this.profile = { ...p }; return { gained: g }; }
  async claimDaily() { const d = this.db(); const p = d.users[this.user.id].p; if (p.last_daily && Date.now() - p.last_daily < 20 * 3600e3) return { gained: 0, next: new Date(p.last_daily + 20 * 3600e3).toISOString() }; p.last_daily = Date.now(); p.gems += 60; this.save(d); this.profile = { ...p }; return { gained: 60 }; }
  async touch() { }
  async leaderboard(by = 'wins') { return Object.values(this.db().users).map((u) => u.p).sort((a, b) => b[by] - a[by]).slice(0, 30); }
  async gemLog(id) { return this.db().log.filter((l) => l.user_id === (id || this.user.id)); }
  async createRoom(r) { const d = this.db(); d.rooms[r.code] = { ...r, host: this.user.id, updated_at: new Date().toISOString() }; this.save(d); }
  async updateRoom(code, f) { const d = this.db(); if (d.rooms[code]) Object.assign(d.rooms[code], f, { updated_at: new Date().toISOString() }); this.save(d); }
  async deleteRoom(code) { const d = this.db(); delete d.rooms[code]; this.save(d); }
  async getRoom(code) { return this.db().rooms[code] || null; }
  async listRooms() { return Object.values(this.db().rooms).filter((r) => r.is_public && Date.now() - new Date(r.updated_at) < 90000); }
  async adminSearch(q) { return Object.values(this.db().users).map((u) => ({ ...u.p })).filter((p) => !q || p.username.toLowerCase().includes(q.toLowerCase())); }
  async adminGems(id, a, reason) { const d = this.db(); const p = d.users[id].p; p.gems = Math.max(0, p.gems + a); d.log.unshift({ user_id: id, delta: a, reason: reason || 'Regalo de la administración', created_at: new Date().toISOString() }); this.save(d); return p.gems; }
  async adminBan(id, v) { const d = this.db(); d.users[id].p.banned = v; this.save(d); }
  async adminItem(id, item, give) { const d = this.db(); const p = d.users[id].p; p.owned = give ? [...new Set([...p.owned, item])] : p.owned.filter((x) => x !== item); this.save(d); return p.owned; }
  async adminAdmin(id, v) { const d = this.db(); d.users[id].p.is_admin = v; this.save(d); }
  async adminRename(id, n) { const d = this.db(); d.users[id].p.username = n; this.save(d); }
  async adminStats() { const u = Object.values(this.db().users).map((x) => x.p); return { players: u.length, today: u.length, online: 1, games: u.reduce((a, p) => a + p.games, 0), gems: u.reduce((a, p) => a + p.gems, 0), rooms: Object.keys(this.db().rooms).length, banned: u.filter((p) => p.banned).length }; }
  channel() { return null; }
}

export function makeBackend(mock) { return mock ? new MockBackend() : new SupaBackend(); }
