// Red: cada participante publica un objeto "presencia"; el anfitrión publica el estado del juego.
// Camino principal: conexión directa entre celulares (PeerJS). Si no se puede, respaldo por el servidor (Supabase Realtime).
import { uid } from './util.js';

export const PEER_PREFIX = 'probador-lj26-';
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }

class Base {
  constructor() { this.peers = new Map(); this.mine = {}; this.listeners = new Set(); this.statusL = new Set(); this.myId = null; }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  onStatus(fn) { this.statusL.add(fn); return () => this.statusL.delete(fn); }
  emitChange() { for (const f of this.listeners) f(this.peers); }
  emitStatus(s, info) { for (const f of this.statusL) f(s, info); }
}

// ---- práctica (sin red) ----
export class LocalNet extends Base {
  constructor() { super(); this.mode = 'local'; this.myId = 'yo-' + uid(); }
  async host() { this.isHost = true; this.peers.set(this.myId, this.mine); return true; }
  setPresence(patch) { Object.assign(this.mine, patch); for (const k in patch) if (patch[k] === null) delete this.mine[k]; this.peers.set(this.myId, this.mine); }
  flush() { }
  leave() { }
}

// ---- online ----
export class OnlineNet extends Base {
  constructor(cfg = {}) {
    super(); this.cfg = cfg; this.mode = 'peer';
    this.conns = new Map(); this.ver = new Map(); this.sentVer = new Map(); this.relayVer = new Map(); this.relayIds = new Set();
    this.lastRelay = 0; this.lastFull = 0; this.lastHostMsg = Date.now();
  }
  async ensureLib() { if (window.Peer) return; await loadScript(this.cfg.peerjsUrl || 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js'); }
  peerOpts() {
    const o = { debug: 0, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }] } };
    if (this.cfg.host) { o.host = this.cfg.host; o.port = this.cfg.port; o.path = this.cfg.path || '/'; o.secure = !!this.cfg.secure; }
    return o;
  }
  // canal de respaldo (Supabase)
  async openRelay(code) {
    const be = this.cfg.backend; if (!be || !be.channel) return false;
    const ch = be.channel('probador-room-' + code.toUpperCase()); if (!ch) return false;
    this.relay = ch;
    ch.on('broadcast', { event: 'm' }, ({ payload }) => this.onRelay(payload));
    await new Promise((res) => { const to = setTimeout(res, 6000); ch.subscribe((st) => { if (st === 'SUBSCRIBED') { clearTimeout(to); res(); } }); });
    return true;
  }
  relaySend(payload) { if (this.relay) this.relay.send({ type: 'broadcast', event: 'm', payload }).catch(() => { }); }
  onRelay(m) {
    if (!m) return;
    if (this.isHost) {
      if (m.t === 'hello') { this.relayIds.add(m.id); this.relayFull = true; }
      else if (m.t === 'p' && m.id) { this.relayIds.add(m.id); this.peers.set(m.id, m.d); this.ver.set(m.id, (this.ver.get(m.id) || 0) + 1); this.emitChange(); }
      else if (m.t === 'bye') { this.relayIds.delete(m.id); this.peers.delete(m.id); this.emitChange(); }
    } else if (this.viaRelay) {
      if (m.t === 'u') { this.lastHostMsg = Date.now(); for (const [id, d] of m.l) if (id !== this.myId) this.peers.set(id, d); this.emitChange(); }
      else if (m.t === 'x') { this.peers.delete(m.id); this.emitChange(); }
    }
  }
  async host(code) {
    await this.ensureLib(); this.isHost = true;
    const hostId = PEER_PREFIX + code.toUpperCase();
    await new Promise((res, rej) => {
      this.peer = new window.Peer(hostId, this.peerOpts());
      const to = setTimeout(() => rej(new Error('timeout')), 15000);
      this.peer.on('open', (id) => { clearTimeout(to); this.myId = id; res(); });
      this.peer.on('error', (e) => { clearTimeout(to); rej(e); });
    });
    this.peers.set(this.myId, this.mine);
    this.peer.on('connection', (conn) => {
      conn.on('open', () => { this.conns.set(conn.peer, conn); for (const [id, p] of this.peers) conn.send({ t: 'u', id, d: p }); });
      conn.on('data', (m) => { if (m && m.t === 'p') { this.peers.set(conn.peer, m.d); this.ver.set(conn.peer, (this.ver.get(conn.peer) || 0) + 1); this.emitChange(); } });
      const gone = () => { this.conns.delete(conn.peer); this.peers.delete(conn.peer); for (const c of this.conns.values()) c.open && c.send({ t: 'x', id: conn.peer }); this.relaySend({ t: 'x', id: conn.peer }); this.emitChange(); };
      conn.on('close', gone); conn.on('error', gone);
    });
    this.peer.on('disconnected', () => { try { this.peer.reconnect(); } catch (e) { } });
    this.openRelay(code).catch(() => { });
    return true;
  }
  async join(code) {
    const hostId = PEER_PREFIX + code.toUpperCase();
    try { await this.joinDirect(hostId); this.mode = 'peer'; return true; }
    catch (e) {
      if (String(e && e.message).includes('nohost') && !this.cfg.backend) throw e;
      // respaldo por el servidor
      if (this.peer) { try { this.peer.destroy(); } catch (x) { } }
      const ok = await this.openRelay(code);
      if (!ok) throw new Error('nohost');
      this.viaRelay = true; this.mode = 'relay'; this.myId = 'r-' + uid() + uid();
      this.peers.set(this.myId, this.mine);
      this.relaySend({ t: 'hello', id: this.myId });
      // esperar señales del anfitrión
      for (let i = 0; i < 40; i++) { if ([...this.peers.values()].some((p) => p && p.g)) break; await new Promise((r) => setTimeout(r, 150)); if (i % 10 === 9) this.relaySend({ t: 'hello', id: this.myId }); }
      if (![...this.peers.values()].some((p) => p && p.g)) throw new Error('nohost');
      this.watch = setInterval(() => { if (Date.now() - this.lastHostMsg > 15000) this.emitStatus('hostgone'); }, 3000);
      return true;
    }
  }
  async joinDirect(hostId) {
    await this.ensureLib();
    await new Promise((res, rej) => {
      this.peer = new window.Peer(undefined, this.peerOpts());
      const to = setTimeout(() => rej(new Error('timeout')), 11000);
      this.peer.on('open', (id) => {
        this.myId = id;
        const conn = this.peer.connect(hostId, { reliable: true, serialization: 'json' });
        this.hostConn = conn;
        conn.on('open', () => { clearTimeout(to); this.peers.set(this.myId, this.mine); conn.send({ t: 'p', d: this.mine }); res(); });
        conn.on('data', (m) => {
          if (!m) return;
          if (m.t === 'u') { if (m.id !== this.myId) this.peers.set(m.id, m.d); this.emitChange(); }
          else if (m.t === 'x') { this.peers.delete(m.id); this.emitChange(); }
        });
        conn.on('close', () => this.emitStatus('hostgone'));
        conn.on('error', () => this.emitStatus('hostgone'));
      });
      this.peer.on('error', (e) => { clearTimeout(to); rej(e && e.type === 'peer-unavailable' ? new Error('nohost') : e); });
    });
  }
  setPresence(patch) {
    Object.assign(this.mine, patch);
    for (const k in patch) if (patch[k] === null) delete this.mine[k];
    this.peers.set(this.myId, this.mine);
    this.myDirty = true;
  }
  flush() {
    const now = performance.now();
    if (this.isHost) {
      if (this.myDirty) { this.ver.set(this.myId, (this.ver.get(this.myId) || 0) + 1); this.myDirty = false; }
      for (const [id, v] of this.ver) {
        if (this.sentVer.get(id) === v) continue;
        this.sentVer.set(id, v);
        const d = this.peers.get(id); if (!d) continue;
        for (const [cid, c] of this.conns) if (cid !== id && c.open) c.send({ t: 'u', id, d });
      }
      // respaldo: un solo mensaje con lo que cambió (máx ~7 por segundo)
      if (this.relay && this.relayIds.size && now - this.lastRelay > 140) {
        this.lastRelay = now;
        const full = this.relayFull || now - this.lastFull > 3000;
        const l = [];
        for (const [id, d] of this.peers) { const v = this.ver.get(id) || 0; if (full || this.relayVer.get(id) !== v) { l.push([id, d]); this.relayVer.set(id, v); } }
        if (full) { this.lastFull = now; this.relayFull = false; }
        if (l.length) this.relaySend({ t: 'u', l });
      }
    } else if (this.viaRelay) {
      if (this.myDirty && now - this.lastRelay > 140) { this.lastRelay = now; this.myDirty = false; this.relaySend({ t: 'p', id: this.myId, d: this.mine }); }
    } else if (this.myDirty && this.hostConn && this.hostConn.open) { this.hostConn.send({ t: 'p', d: this.mine }); this.myDirty = false; }
  }
  leave() {
    try { if (this.viaRelay) this.relaySend({ t: 'bye', id: this.myId }); } catch (e) { }
    clearInterval(this.watch);
    try { this.relay && this.relay.unsubscribe(); } catch (e) { }
    try { this.peer && this.peer.destroy(); } catch (e) { }
  }
}
