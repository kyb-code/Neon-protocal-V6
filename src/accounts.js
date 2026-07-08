// accounts.js — local accounts, per-user saves, rankings with text-file export/import, admin panel.
// NOTE: this is a static site (GitHub Pages) with no server, so accounts live in each
// browser's localStorage. Rankings sync across people via the exported rankings.txt file.
const STORE_KEY = 'np_accounts_v1';
const IMPORT_KEY = 'np_rankings_imported_v1';
const ADMIN_ID = 'admin';
const ADMIN_PW = 'rlaxodid1*';

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function nowISO() { return new Date().toISOString(); }

export function scoreOf(st) {
  return (st.bestSector || 0) * 100000 + (st.victories || 0) * 50000 + (st.bestWaves || 0) * 800 + (st.kills || 0);
}

export class Accounts {
  constructor() {
    this.data = { users: {}, current: null };
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) this.data = Object.assign({ users: {}, current: null }, JSON.parse(raw));
    } catch (e) { /* fresh */ }
  }

  save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(this.data)); } catch (e) { /* full */ }
  }

  current() { return this.data.current; }
  isLoggedIn() { return !!this.data.current; }
  isAdmin() { return this.data.current === ADMIN_ID; }

  validId(id) { return /^[a-zA-Z0-9_]{3,16}$/.test(id); }

  async register(id, pw) {
    id = (id || '').trim().toLowerCase();
    if (id === ADMIN_ID) return { ok: false, err: 'id_taken' };
    if (!this.validId(id)) return { ok: false, err: 'bad_id' };
    if (!pw || pw.length < 4) return { ok: false, err: 'bad_pw' };
    if (this.data.users[id]) return { ok: false, err: 'id_taken' };
    const salt = Math.random().toString(36).slice(2, 10);
    const hash = await sha256(salt + pw);
    this.data.users[id] = { salt, hash, created: nowISO(), logins: 0, lastLogin: null, stats: {} };
    this.save();
    return this.login(id, pw);
  }

  async login(id, pw) {
    id = (id || '').trim().toLowerCase();
    if (id === ADMIN_ID) {
      if (pw === ADMIN_PW) {
        if (!this.data.users[ADMIN_ID]) {
          this.data.users[ADMIN_ID] = { salt: '', hash: '', created: nowISO(), logins: 0, lastLogin: null, stats: {}, admin: true };
        }
        const u = this.data.users[ADMIN_ID];
        u.logins += 1; u.lastLogin = nowISO();
        this.data.current = ADMIN_ID;
        this.save();
        return { ok: true, admin: true };
      }
      return { ok: false, err: 'wrong_pw' };
    }
    const u = this.data.users[id];
    if (!u) return { ok: false, err: 'no_user' };
    const hash = await sha256(u.salt + pw);
    if (hash !== u.hash) return { ok: false, err: 'wrong_pw' };
    u.logins += 1; u.lastLogin = nowISO();
    this.data.current = id;
    this.save();
    return { ok: true };
  }

  logout() {
    this.data.current = null;
    this.save();
  }

  // snapshot the player's meta stats into their account (called after runs)
  snapshot(metaStats) {
    const id = this.data.current;
    if (!id || !this.data.users[id]) return;
    const st = this.data.users[id].stats || {};
    st.bestSector = Math.max(st.bestSector || 0, metaStats.bestSector || 0);
    st.bestWaves = Math.max(st.bestWaves || 0, metaStats.bestWaves || 0);
    st.kills = metaStats.kills || 0;
    st.victories = metaStats.victories || 0;
    st.minigameWins = metaStats.minigameWins || 0;
    st.score = scoreOf(st);
    this.data.users[id].stats = st;
    this.save();
  }

  // ---------- rankings ----------
  importedEntries() {
    try {
      const raw = localStorage.getItem(IMPORT_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  leaderboard() {
    const local = Object.entries(this.data.users)
      .filter(([id, u]) => id !== ADMIN_ID && u.stats && u.stats.score > 0)
      .map(([id, u]) => ({ id, ...u.stats, source: 'local' }));
    const imported = this.importedEntries().map((e) => ({ ...e, source: 'imported' }));
    // merge: keep the best entry per id
    const byId = new Map();
    for (const e of [...local, ...imported]) {
      const prev = byId.get(e.id);
      if (!prev || (e.score || 0) > (prev.score || 0)) byId.set(e.id, e);
    }
    return [...byId.values()].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 100);
  }

  exportRankingsText() {
    const lines = ['# NEON PROTOCOL rankings — share this file and import it on another machine',
      '# id\tscore\tbestSector\tbestWaves\tkills\tvictories'];
    for (const e of this.leaderboard()) {
      lines.push([e.id, e.score || 0, e.bestSector || 0, e.bestWaves || 0, e.kills || 0, e.victories || 0].join('\t'));
    }
    return lines.join('\n');
  }

  importRankingsText(text) {
    const entries = [];
    for (const line of (text || '').split(/\r?\n/)) {
      if (!line || line.startsWith('#')) continue;
      const parts = line.split('\t');
      if (parts.length < 6) continue;
      const [id, score, bestSector, bestWaves, kills, victories] = parts;
      if (!this.validId(id)) continue;
      entries.push({
        id: id.toLowerCase(), score: +score || 0, bestSector: +bestSector || 0,
        bestWaves: +bestWaves || 0, kills: +kills || 0, victories: +victories || 0,
      });
    }
    if (!entries.length) return 0;
    const existing = this.importedEntries();
    const byId = new Map(existing.map((e) => [e.id, e]));
    for (const e of entries) {
      const prev = byId.get(e.id);
      if (!prev || e.score > (prev.score || 0)) byId.set(e.id, e);
    }
    try { localStorage.setItem(IMPORT_KEY, JSON.stringify([...byId.values()])); } catch (err) { /* full */ }
    return entries.length;
  }

  // ---------- admin ----------
  adminStats() {
    // re-read from disk in case another tab registered since we loaded
    const currentId = this.data.current;
    this.load();
    this.data.current = currentId;
    const localEntries = Object.entries(this.data.users).filter(([id]) => id !== ADMIN_ID);
    const weekAgo = Date.now() - 7 * 86400e3;
    const list = localEntries.map(([id, u]) => ({
      id, created: u.created, logins: u.logins, lastLogin: u.lastLogin, stats: u.stats || {}, source: 'local',
    }));
    // merge users only known from an imported rankings file (registered on another device)
    const known = new Set(list.map((u) => u.id));
    for (const e of this.importedEntries()) {
      if (!known.has(e.id)) {
        known.add(e.id);
        list.push({ id: e.id, created: null, logins: 0, lastLogin: null, stats: e, source: 'imported' });
      }
    }
    list.sort((a, b) => {
      const ta = a.created ? new Date(a.created).getTime() : 0;
      const tb = b.created ? new Date(b.created).getTime() : 0;
      return tb - ta;
    });
    return {
      total: localEntries.length,
      imported: list.length - localEntries.length,
      recentSignups: localEntries.filter(([, u]) => new Date(u.created).getTime() > weekAgo).length,
      totalLogins: localEntries.reduce((s, [, u]) => s + (u.logins || 0), 0),
      users: list,
    };
  }

  adminDeleteUser(id) {
    if (!this.isAdmin() || id === ADMIN_ID) return false;
    delete this.data.users[id];
    try { localStorage.removeItem('neon_protocol_save_v1::' + id); } catch (e) { /* noop */ }
    this.save();
    return true;
  }

  // title/칭호 granted by an admin, shown next to the player's name in multiplayer
  titleOf(id) {
    const u = this.data.users[id];
    return (u && u.title) || '';
  }
  adminSetTitle(id, title) {
    if (!this.isAdmin()) return false;
    const u = this.data.users[id];
    if (!u) return false;
    u.title = (title || '').slice(0, 20);
    this.save();
    return true;
  }

  // grant currency directly into a user's save file
  adminGrant(id, rubies = 0, credits = 0) {
    if (!this.isAdmin()) return false;
    const key = 'neon_protocol_save_v1::' + id;
    try {
      const raw = localStorage.getItem(key);
      const save = raw ? JSON.parse(raw) : null;
      if (!save) return false;
      save.rubies = (save.rubies || 0) + rubies;
      save.credits = (save.credits || 0) + credits;
      localStorage.setItem(key, JSON.stringify(save));
      return true;
    } catch (e) { return false; }
  }
}
