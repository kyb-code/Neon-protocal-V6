// ui.js — DOM screens: title, menu, meta, cores, codex, settings, pause, levelup, path, results + HUD
import { t, L, setLang, getLang } from './i18n.js';
import { META_UPGRADES, DASH_CORES, SPECIAL_ITEMS, SHIP_COLORS, SHIP_SHAPES, KILL_FX, DASH_FX } from './meta.js';
import { Player } from './player.js';
import { ENEMY_TYPES } from './enemies.js';
import { BOSSES } from './bosses.js';
import { UPGRADES, CATEGORIES } from './upgrades.js';
import { SKILLS, SLOT_OPTIONS } from './pvp.js';
import { SKILL_NODES, SKILL_BRANCHES, nodeState } from './skilltree.js';
import { formatTime } from './utils.js';

const NODE_ICONS = { combat: '▣', elite: '★', cache: '⬡', repair: '✚', boss: '☠', bonus: '◆' };

export class UI {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('ui-root');
    this.hud = document.getElementById('hud');
    this.currentScreen = null;
    this.announceTimeout = null;
    this.resetArmed = false;

    // cached HUD elements
    this.el = {
      shield: document.querySelector('#bar-shield .bar-fill'),
      shieldGhost: document.querySelector('#bar-shield .bar-ghost'),
      shieldVal: document.querySelector('#bar-shield .bar-value'),
      hp: document.querySelector('#bar-hp .bar-fill'),
      hpGhost: document.querySelector('#bar-hp .bar-ghost'),
      hpVal: document.querySelector('#bar-hp .bar-value'),
      xp: document.querySelector('#bar-xp .bar-fill'),
      level: document.getElementById('level-num'),
      pips: document.getElementById('dash-pips'),
      sector: document.getElementById('hud-sector'),
      wave: document.getElementById('hud-wave'),
      credits: document.getElementById('hud-credits'),
      bossWrap: document.getElementById('boss-bar-wrap'),
      bossName: document.getElementById('boss-name'),
      bossBar: document.querySelector('#boss-bar .bar-fill'),
      combo: document.getElementById('combo-display'),
      hint: document.getElementById('hud-hint'),
      announce: document.getElementById('announce'),
      damageFlash: document.getElementById('damage-flash'),
    };
  }

  // ---------- helpers ----------
  clear() {
    this.root.innerHTML = '';
    this.currentScreen = null;
    this.resetArmed = false;
  }

  screen(id, inner) {
    this.clear();
    const div = document.createElement('div');
    div.className = 'screen';
    div.id = id;
    div.innerHTML = inner;
    this.root.appendChild(div);
    this.currentScreen = id;
    // hover sfx on buttons/cards
    div.querySelectorAll('.btn, .card, .meta-node, .core-card').forEach((b) => {
      b.addEventListener('mouseenter', () => this.game.audio.sfx('uiHover'));
    });
    return div;
  }

  bind(el, selector, fn) {
    el.querySelectorAll(selector).forEach((node) => {
      node.addEventListener('click', (ev) => { this.game.audio.sfx('uiClick'); fn(node, ev); });
    });
  }

  showHUD(show) { this.hud.classList.toggle('hidden', !show); }

  // ---------- TITLE ----------
  showTitle() {
    const s = this.screen('screen-title', `
      <h1 class="logo">NEON<span class="accent">_</span>PROTOCOL</h1>
      <div class="tagline">${t('tagline')}</div>
      <div class="hint" style="animation: pulse 1.6s infinite;">${t('menu.press_any')}</div>
      <style>@keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:1} }</style>
    `);
    const go = () => {
      window.removeEventListener('keydown', go);
      s.removeEventListener('click', go);
      this.game.audio.ensure();
      this.game.audio.sfx('uiClick');
      this.game.afterTitle();
    };
    window.addEventListener('keydown', go, { once: true });
    s.addEventListener('click', go, { once: true });
  }

  // ---------- MAIN MENU ----------
  showMenu() {
    const st = this.game.meta.data.stats;
    const acc = this.game.accounts;
    const user = acc.current();
    const accountLine = user
      ? `<span style="color:${acc.isAdmin() ? '#ffd700' : 'var(--neon-cyan)'}">${acc.isAdmin() ? '👑 ' : '▣ '}${user}</span>
         &nbsp;<a href="#" data-acc="logout" class="mono" style="color:var(--text-dim);font-size:11px">[${t('login.logout')}]</a>`
      : `<a href="#" data-acc="login" class="mono" style="color:var(--neon-cyan);font-size:13px;letter-spacing:0.1em">▶ ${t('login.title')}</a>`;
    const s = this.screen('screen-menu', `
      <h1 class="logo" style="font-size:clamp(30px,5vw,60px)">NEON<span class="accent">_</span>PROTOCOL</h1>
      <div class="tagline">${t('tagline')}</div>
      <div class="mono" style="margin-bottom:14px;font-size:13px">${accountLine}</div>
      <button class="btn" data-act="start">${t('menu.start')}</button>
      <button class="btn" data-act="coop" style="border-color:rgba(255,94,138,0.45)">⚔ ${t('menu.coop')}</button>
      <button class="btn" data-act="ranking">🏆 ${t('rank.title')}</button>
      <button class="btn" data-act="meta">${t('menu.meta')}</button>
      <button class="btn" data-act="skills">${t('skill.title')}</button>
      <button class="btn" data-act="shop">◆ ${t('menu.shop')}</button>
      <button class="btn" data-act="cores">${t('menu.cores')}</button>
      <button class="btn" data-act="customize">${t('menu.customize')}</button>
      <button class="btn" data-act="archive">${t('menu.archive')}</button>
      <button class="btn" data-act="codex">${t('menu.codex')}</button>
      <button class="btn" data-act="story">${t('menu.story')}</button>
      <button class="btn" data-act="settings">${t('menu.settings')}</button>
      ${acc.isAdmin() ? `<button class="btn" data-act="admin" style="border-color:rgba(255,215,0,0.5)">⚙ ${t('admin.title')}</button>` : ''}
      <div class="hint mono">
        ⬡ ${this.game.meta.data.credits} &nbsp;|&nbsp; <span style="color:#ff5e8a">◆ ${this.game.meta.data.rubies}</span>
        &nbsp;|&nbsp; ${t('stats.runs')}: ${st.runs}
        &nbsp;|&nbsp; ${t('stats.bestSector')}: ${st.bestSector || '—'}
        &nbsp;|&nbsp; ${t('stats.victories')}: ${st.victories}
      </div>
    `);
    s.querySelectorAll('[data-acc]').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      this.game.audio.sfx('uiClick');
      if (a.dataset.acc === 'login') this.showLogin();
      else this.game.doLogout();
    }));
    this.bind(s, '.btn', (b) => {
      const act = b.dataset.act;
      if (act === 'start') this.game.requestStartRun();
      else if (act === 'coop') this.showCoopMenu();
      else if (act === 'ranking') this.showRanking();
      else if (act === 'meta') this.showMeta();
      else if (act === 'skills') this.showSkillTree();
      else if (act === 'shop') this.showShop();
      else if (act === 'cores') this.showCores();
      else if (act === 'customize') this.showCustomize();
      else if (act === 'archive') this.showArchive();
      else if (act === 'codex') this.showCodex();
      else if (act === 'story') this.game.startStory(true);
      else if (act === 'settings') this.showSettings('menu');
      else if (act === 'admin') this.showAdmin();
    });
  }

  // ---------- RUBY SHOP ----------
  showShop() {
    const meta = this.game.meta;
    const nodes = SPECIAL_ITEMS.map((item) => {
      const owned = meta.hasItem(item.id);
      const afford = meta.data.rubies >= item.cost;
      return `<div class="meta-node ${owned ? 'maxed' : ''} ${!owned && !afford ? 'locked' : ''}" data-id="${item.id}">
        <div class="mn-name">${item.icon} ${L(item.name)}</div>
        <div class="mn-desc">${L(item.desc)}</div>
        <div class="mn-cost" style="color:#ff5e8a">${owned ? '✓ ' + t('shop.owned') : '◆ ' + item.cost}</div>
      </div>`;
    }).join('');
    const s = this.screen('screen-shop', `
      <div class="panel" style="width:min(880px,94vw)">
        <h2 style="color:#ff5e8a;text-shadow:0 0 10px rgba(255,94,138,0.6)">${t('shop.title')}</h2>
        <div class="mono" style="text-align:center;color:#ff5e8a;margin-bottom:6px;letter-spacing:0.15em">
          ${t('shop.rubies')}: ◆ ${meta.data.rubies}
        </div>
        <div class="hint" style="margin:0 0 16px">${t('shop.hint')}</div>
        <div class="meta-grid">${nodes}</div>
        <div style="text-align:center;margin-top:20px">
          <button class="btn small" data-act="back">${t('menu.back')}</button>
        </div>
      </div>
    `);
    this.bind(s, '.meta-node', (node) => {
      const item = SPECIAL_ITEMS.find((d) => d.id === node.dataset.id);
      if (meta.buyItem(item)) { this.game.audio.sfx('purchase'); this.showShop(); }
      else this.game.audio.sfx('denied');
    });
    this.bind(s, '.btn', () => this.showMenu());
  }

  // ---------- PROTOCOL ARCHIVE (card compendium) ----------
  showArchive() {
    const rarOrder = { epic: 0, rare: 1, common: 2 };
    const sections = Object.keys(CATEGORIES).map((catKey) => {
      const cat = CATEGORIES[catKey];
      const cards = UPGRADES.filter((u) => u.cat === catKey)
        .sort((a, b) => rarOrder[a.rarity] - rarOrder[b.rarity])
        .map((u) => `
          <div class="meta-node" style="cursor:default;border-color:${u.rarity === 'epic' ? 'rgba(255,47,214,0.5)' : u.rarity === 'rare' ? 'rgba(0,240,255,0.5)' : 'var(--panel-border)'}">
            <div class="mn-name">${u.icon} ${L(u.name)}
              <span class="mn-level" style="color:${u.rarity === 'epic' ? 'var(--neon-magenta)' : u.rarity === 'rare' ? 'var(--neon-cyan)' : 'var(--text-dim)'}">${u.rarity.toUpperCase()}</span>
            </div>
            <div class="mn-desc">${L(u.desc)}</div>
            <div class="mn-cost" style="color:${cat.color}">${L(cat.name)} · ${t('archive.max')} ${u.max}</div>
          </div>`).join('');
      return `<div class="mono" style="color:${cat.color};font-size:13px;letter-spacing:0.25em;margin:18px 0 10px;text-shadow:0 0 8px ${cat.color}">
          ■ ${L(cat.name)}</div>
        <div class="meta-grid">${cards}</div>`;
    }).join('');
    const s = this.screen('screen-archive', `
      <div class="panel" style="width:min(920px,94vw)">
        <h2>${t('archive.title')}</h2>
        <div class="hint" style="margin:0 0 4px">${t('archive.hint')} (${UPGRADES.length})</div>
        ${sections}
        <div style="text-align:center;margin-top:20px">
          <button class="btn small" data-act="back">${t('menu.back')}</button>
        </div>
      </div>
    `);
    this.bind(s, '.btn', () => this.showMenu());
  }

  // ---------- ACCOUNT: login / ranking / admin ----------
  showLogin(errorKey) {
    const s = this.screen('screen-login', `
      <div class="panel" style="text-align:center;min-width:min(460px,92vw)">
        <h2>${t('login.title')}</h2>
        ${errorKey ? `<div class="mono" style="color:var(--neon-red);font-size:13px;margin-bottom:12px">${t(errorKey)}</div>` : ''}
        <div style="display:flex;flex-direction:column;gap:10px;max-width:300px;margin:0 auto 16px">
          <input id="login-id" class="mono" maxlength="16" placeholder="${t('login.id')}"
            style="background:rgba(0,240,255,0.05);border:1px solid var(--panel-border);color:#fff;padding:12px;font-size:15px;outline:none;text-align:center">
          <input id="login-pw" class="mono" type="password" maxlength="32" placeholder="${t('login.pw')}"
            style="background:rgba(0,240,255,0.05);border:1px solid var(--panel-border);color:#fff;padding:12px;font-size:15px;outline:none;text-align:center">
        </div>
        <button class="btn" data-act="login">${t('login.login')}</button>
        <button class="btn" data-act="register">${t('login.register')}</button>
        <div class="hint" style="margin-top:14px">${t('login.note')}</div>
        <button class="btn small" style="margin-top:10px" data-act="back">${t('menu.back')}</button>
      </div>
    `);
    const idI = s.querySelector('#login-id'), pwI = s.querySelector('#login-pw');
    [idI, pwI].forEach((inp) => inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') s.querySelector('[data-act="login"]').click();
    }));
    this.bind(s, '.btn', async (b) => {
      const act = b.dataset.act;
      if (act === 'back') { this.showMenu(); return; }
      const res = await this.game.doLogin(idI.value, pwI.value, act === 'register');
      if (!res.ok) this.showLogin('login.err_' + res.err);
    });
  }

  showRanking() {
    const acc = this.game.accounts;
    const board = acc.leaderboard();
    const me = acc.current();
    const rows = board.length ? board.map((e, i) => `
      <div class="srow" style="${e.id === me ? 'background:rgba(0,240,255,0.07)' : ''}">
        <span class="k" style="color:${i < 3 ? ['#ffd700', '#e2e8f0', '#cd7f32'][i] : 'var(--text)'}">
          ${i + 1}. ${e.id}${e.id === me ? ' ★' : ''}${e.source === 'imported' ? ' ⇣' : ''}</span>
        <span class="v mono" style="font-size:12px">${(e.score || 0).toLocaleString()} · S${e.bestSector || 0} · ${e.kills || 0}K</span>
      </div>`).join('') : `<div class="hint">${t('rank.empty')}</div>`;
    const s = this.screen('screen-ranking', `
      <div class="panel" style="min-width:min(560px,94vw)">
        <h2>${t('rank.title')}</h2>
        <div class="stats-table" style="min-width:auto">${rows}</div>
        <div style="text-align:center;margin-top:18px">
          <button class="btn small" data-act="export">⇡ ${t('rank.export')}</button>
          <button class="btn small" data-act="import">⇣ ${t('rank.import')}</button>
          <button class="btn small" data-act="back">${t('menu.back')}</button>
        </div>
        <div class="hint" style="margin-top:10px">${t('rank.note')}</div>
        <input type="file" id="rank-file" accept=".txt" style="display:none">
      </div>
    `);
    const fileInput = s.querySelector('#rank-file');
    fileInput.addEventListener('change', () => {
      const f = fileInput.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        const n = acc.importRankingsText(reader.result);
        this.game.audio.sfx(n > 0 ? 'purchase' : 'denied');
        this.showRanking();
      };
      reader.readAsText(f);
    });
    this.bind(s, '.btn', (b) => {
      const act = b.dataset.act;
      if (act === 'back') this.showMenu();
      else if (act === 'export') {
        const blob = new Blob([acc.exportRankingsText()], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'neon-protocol-rankings.txt';
        a.click();
        URL.revokeObjectURL(a.href);
      } else if (act === 'import') fileInput.click();
    });
  }

  showAdmin() {
    const acc = this.game.accounts;
    if (!acc.isAdmin()) { this.showMenu(); return; }
    const st = acc.adminStats();
    const fmt = (iso) => iso ? iso.slice(0, 10) : '—';
    const rows = st.users.length ? st.users.map((u) => `
      <div class="srow" style="align-items:center;flex-wrap:wrap;gap:4px 0">
        <span class="k" style="flex:1;min-width:180px">${u.id}${u.stats && u.stats.title ? ` <span style="color:#ffd700;font-size:9px">«${u.stats.title}»</span>` : ''}${u.source === 'imported' ? ' <span style="color:#c084fc;font-size:9px">(가져옴)</span>' : ''}<br><span style="font-size:10px;color:var(--text-dim)">${t('admin.joined')} ${fmt(u.created)} · ${t('admin.logins')} ${u.logins} · S${u.stats.bestSector || 0}/${u.stats.kills || 0}K</span></span>
        <span class="v" style="display:flex;gap:5px;flex-wrap:wrap">
          <button class="toggle-btn" data-grant="${u.id}" ${u.source === 'imported' ? 'disabled style="opacity:0.3;min-width:auto;padding:4px 7px;font-size:10px"' : 'style="min-width:auto;padding:4px 7px;font-size:10px"'}>${t('admin.reward')}</button>
          <button class="toggle-btn" data-title="${u.id}" ${u.source === 'imported' ? 'disabled style="opacity:0.3;min-width:auto;padding:4px 7px;font-size:10px"' : 'style="min-width:auto;padding:4px 7px;font-size:10px;border-color:rgba(255,215,0,0.5)"'}>${t('admin.title_btn')}</button>
          <button class="toggle-btn" data-del="${u.id}" ${u.source === 'imported' ? 'disabled style="opacity:0.3;min-width:auto;padding:4px 7px;font-size:10px"' : 'style="min-width:auto;padding:4px 7px;font-size:10px;border-color:rgba(255,59,92,0.5)"'}>✕</button>
        </span>
      </div>`).join('') : `<div class="hint">${t('admin.nousers')}</div>`;
    const s = this.screen('screen-admin', `
      <div class="panel" style="min-width:min(680px,94vw)">
        <h2 style="color:#ffd700;text-shadow:0 0 12px rgba(255,215,0,0.5)">⚙ ${t('admin.title')}</h2>
        <div class="mono" style="display:flex;gap:20px;justify-content:center;margin-bottom:14px;font-size:13px;flex-wrap:wrap">
          <span>${t('admin.total')}: <b style="color:#fff">${st.total}</b></span>
          <span>${t('admin.week')}: <b style="color:#4aff8f">+${st.recentSignups}</b></span>
          <span>${t('admin.logins')}: <b style="color:#00f0ff">${st.totalLogins}</b></span>
          ${st.imported ? `<span>가져온 계정: <b style="color:#c084fc">${st.imported}</b></span>` : ''}
        </div>
        <div class="mono" style="color:#4aff8f;font-size:12px;letter-spacing:0.2em;margin:4px 0 6px">▸ ${t('admin.live')}</div>
        <div id="admin-live" class="mono" style="text-align:left;font-size:11px;color:#8aa8c0;background:rgba(0,0,0,0.35);border:1px solid rgba(0,240,255,0.15);padding:8px 10px;min-height:40px;max-height:150px;overflow-y:auto;line-height:1.7">${t('admin.live_wait')}</div>
        <div class="mono" style="color:#4aff8f;font-size:12px;letter-spacing:0.2em;margin:14px 0 6px">▸ ${t('admin.accounts')}</div>
        <div class="hint" style="margin:0 0 10px">${t('admin.note')}</div>
        <div class="stats-table" style="min-width:auto">${rows}</div>
        <div style="text-align:center;margin-top:18px">
          <button class="btn small" data-act="selfgrant">👑 ${t('admin.selfgrant')}</button>
          <button class="btn small" data-act="import">⇣ ${t('rank.import')}</button>
          <button class="btn small" data-act="back">${t('menu.back')}</button>
        </div>
        <input type="file" id="admin-file" accept=".txt" style="display:none">
      </div>
    `);
    // ---- live game monitor (subscribes while this screen is open) ----
    const liveEl = s.querySelector('#admin-live');
    this.game.startAdminWatch((beacons) => {
      if (!document.body.contains(liveEl)) return;
      if (!beacons.length) { liveEl.innerHTML = t('admin.live_none'); return; }
      liveEl.innerHTML = beacons.map((b) => {
        let detail;
        if (b.mode === 'SOLO') detail = `S${b.sector} W${b.wave} · Lv${b.level} · ${b.kills}K · HP${b.hp}`;
        else if (b.mode === 'CO-OP') detail = `room ${b.room} · W${b.wave} · ${b.alive}/${b.players} alive · Lv${b.lvl}`;
        else if (b.mode === 'PVP') detail = `room ${b.room} · R${b.round} · ${b.score}`;
        else detail = `W${b.wave || 0}`;
        return `<div>● <b style="color:#fff">${b.name}</b> <span style="color:#ff5e8a">[${b.mode}]</span> ${detail}</div>`;
      }).join('');
    });
    const fileInput = s.querySelector('#admin-file');
    fileInput.addEventListener('change', () => {
      const f = fileInput.files[0]; if (!f) return;
      const reader = new FileReader();
      reader.onload = () => { acc.importRankingsText(reader.result); this.game.audio.sfx('purchase'); this.showAdmin(); };
      reader.readAsText(f);
    });
    s.querySelectorAll('[data-grant]').forEach((b) => b.addEventListener('click', () => {
      this.showAdminGrant(b.dataset.grant);
    }));
    s.querySelectorAll('[data-title]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.title;
      const cur = acc.titleOf(id);
      const val = window.prompt(t('admin.title_prompt') + ' (' + id + ')', cur);
      if (val !== null) { acc.adminSetTitle(id, val); this.game.audio.sfx('purchase'); this.showAdmin(); }
    }));
    s.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.armed) { acc.adminDeleteUser(b.dataset.del); this.game.audio.sfx('denied'); this.showAdmin(); }
      else { b.dataset.armed = '1'; b.textContent = '⚠'; }
    }));
    this.bind(s, '.btn', (b) => {
      if (b.dataset.act === 'selfgrant') {
        this.game.adminUnlockAll();
        this.game.audio.sfx('unlock');
        this.showAdmin();
      } else if (b.dataset.act === 'import') { fileInput.click(); }
      else { this.game.stopAdminWatch(); this.showMenu(); }
    });
  }

  // admin: choose a custom reward amount for a user
  showAdminGrant(id) {
    const acc = this.game.accounts;
    const s = this.screen('screen-admingrant', `
      <div class="panel" style="text-align:center;min-width:min(420px,90vw)">
        <h2 style="color:#ffd700">${t('admin.reward_title')}</h2>
        <div class="mono" style="color:#fff;margin-bottom:14px">${id}</div>
        <div style="display:flex;flex-direction:column;gap:8px;max-width:260px;margin:0 auto">
          <label class="mono" style="font-size:12px;text-align:left;color:#ff5e8a">◆ Rubies
            <input id="gr-rubies" type="number" value="10" style="width:100%;background:rgba(255,94,138,0.08);border:1px solid var(--panel-border);color:#fff;padding:8px;margin-top:3px"></label>
          <label class="mono" style="font-size:12px;text-align:left;color:var(--neon-yellow)">⬡ Coins
            <input id="gr-coins" type="number" value="500" style="width:100%;background:rgba(255,233,74,0.08);border:1px solid var(--panel-border);color:#fff;padding:8px;margin-top:3px"></label>
        </div>
        <div style="margin-top:16px">
          <button class="btn small" data-act="give">${t('admin.reward_give')}</button>
          <button class="btn small" data-act="back">${t('menu.back')}</button>
        </div>
        <div id="gr-status" class="mono" style="font-size:11px;color:var(--neon-green);margin-top:8px"></div>
      </div>
    `);
    s.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => e.stopPropagation()));
    this.bind(s, '.btn', (b) => {
      if (b.dataset.act === 'give') {
        const r = parseInt(s.querySelector('#gr-rubies').value, 10) || 0;
        const c = parseInt(s.querySelector('#gr-coins').value, 10) || 0;
        const ok = acc.adminGrant(id, r, c);
        this.game.audio.sfx(ok ? 'purchase' : 'denied');
        s.querySelector('#gr-status').textContent = ok ? t('admin.reward_done') : t('admin.reward_fail');
      } else this.showAdmin();
    });
  }

  // ---------- CO-OP: menu / lobby / offer / result ----------
  diagBlock(diag) {
    if (!diag || !diag.length) return '';
    return `<div class="mono" id="coop-diag" style="text-align:left;font-size:10.5px;color:#6d8aa5;background:rgba(0,0,0,0.35);
      border:1px solid rgba(0,240,255,0.15);padding:8px 10px;margin:12px auto 0;max-width:440px;max-height:120px;overflow-y:auto;line-height:1.6">
      ${diag.map((l) => `<div>› ${l}</div>`).join('')}</div>`;
  }

  showCoopMenu(errorMsg, diag) {
    const s = this.screen('screen-coopmenu', `
      <div class="panel" style="text-align:center;min-width:min(560px,92vw)">
        <h2 style="color:#ff5e8a;text-shadow:0 0 12px rgba(255,94,138,0.6)">${t('coop.title')}</h2>
        <div class="hint" style="margin:0 0 12px">${t('coop.subtitle')}</div>
        ${errorMsg ? `<div class="mono" style="color:var(--neon-red);font-size:13px;margin-bottom:14px">${errorMsg}</div>` : ''}
        <div style="display:flex;gap:8px;justify-content:center;align-items:center;margin:0 auto 14px;max-width:320px">
          <span class="mono" style="font-size:12px;color:var(--text-dim)">${t('coop.nick')}</span>
          <input id="coop-nick" class="mono" maxlength="14" placeholder="${t('coop.nick_ph')}" ${this.game.accounts.current() ? 'disabled' : ''}
            style="flex:1;background:rgba(0,240,255,0.05);border:1px solid var(--panel-border);color:#fff;padding:9px;font-size:14px;text-align:center;outline:none">
        </div>
        <button class="btn" data-act="host">⚑ ${t('coop.host')}</button>
        <button class="btn" data-act="hostpvp" style="border-color:rgba(192,132,252,0.5)">⚔ ${t('pvp.host')}</button>
        <div style="display:flex;gap:8px;justify-content:center;align-items:center;margin:7px auto;max-width:300px">
          <input id="coop-code-input" class="mono" maxlength="6" placeholder="${t('coop.enter_code')}"
            style="flex:1;background:rgba(0,240,255,0.05);border:1px solid var(--panel-border);color:#fff;
            padding:12px;font-size:16px;letter-spacing:0.4em;text-align:center;text-transform:uppercase;outline:none">
          <button class="btn small" style="min-width:auto;margin:0" data-act="join">${t('coop.join')}</button>
        </div>
        <div class="hint" style="margin-top:10px">${t('coop.relay_note')}</div>
        <div style="border-top:1px solid rgba(0,240,255,0.15);margin:16px auto 0;max-width:360px;padding-top:14px">
          <div class="hint" style="margin:0 0 8px">${t('coop.manual_hint')}</div>
          <button class="btn small" data-act="manualhost">🔗 ${t('coop.manual_host')}</button>
          <button class="btn small" data-act="manualjoin">🔗 ${t('coop.manual_join')}</button>
        </div>
        ${this.diagBlock(diag)}
        <button class="btn small" style="margin-top:14px" data-act="back">${t('menu.back')}</button>
      </div>
    `);
    const inp = s.querySelector('#coop-code-input');
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') this.game.joinCoop(inp.value);
    });
    const nick = s.querySelector('#coop-nick');
    if (nick) {
      nick.value = this.game.accounts.current() || this.game.meta.data.nickname || '';
      nick.addEventListener('keydown', (e) => e.stopPropagation());
      nick.addEventListener('input', () => { this.game.meta.data.nickname = nick.value.trim(); this.game.meta.save(); });
    }
    this.bind(s, '.btn', (b) => {
      const act = b.dataset.act;
      if (act === 'host') this.game.hostCoop('raid');
      else if (act === 'hostpvp') this.game.hostCoop('pvp');
      else if (act === 'join') this.game.joinCoop(inp.value);
      else if (act === 'manualhost') this.game.hostCoopManual('raid');
      else if (act === 'manualjoin') this.game.joinCoopManual();
      else this.game.toMenu();
    });
  }

  // ---------- MANUAL (serverless) CONNECT: copy/paste codes ----------
  showManualConnect(role, opts) {
    opts = opts || {};
    const codeBox = (label, code) => `
      <div class="mono" style="color:var(--text-dim);font-size:11px;letter-spacing:0.15em;margin:12px 0 5px">${label}</div>
      <textarea id="mc-out" readonly style="width:100%;height:70px;background:rgba(0,240,255,0.05);border:1px solid var(--panel-border);
        color:#7dffea;font-family:Consolas,monospace;font-size:10px;padding:8px;resize:none;outline:none">${code}</textarea>
      <button class="btn small" style="margin-top:6px" data-act="copy">📋 ${t('coop.copy')}</button>`;
    const inBox = (label, ph, actId) => `
      <div class="mono" style="color:var(--text-dim);font-size:11px;letter-spacing:0.15em;margin:14px 0 5px">${label}</div>
      <textarea id="mc-in" placeholder="${ph}" style="width:100%;height:70px;background:rgba(255,255,255,0.04);border:1px solid var(--panel-border);
        color:#fff;font-family:Consolas,monospace;font-size:10px;padding:8px;resize:none;outline:none"></textarea>
      <button class="btn small" style="margin-top:6px" data-act="${actId}">▶ ${t('coop.submit')}</button>`;

    let body;
    if (role === 'host') {
      body = `<div class="mono" style="color:#ff5e8a;font-size:12px;margin-bottom:8px">${t('coop.manual_host_steps')}</div>`
        + (opts.offerCode
            ? codeBox('① ' + t('coop.your_code'), opts.offerCode)
            : `<div class="mono" style="color:var(--text-dim);padding:20px">${t('coop.generating')}</div>`)
        + (opts.waiting
            ? `<div class="mono" style="color:var(--neon-cyan);margin-top:14px">${t('coop.connecting')}</div>`
            : inBox('② ' + t('coop.their_answer'), t('coop.paste_answer'), 'answer'));
    } else {
      body = `<div class="mono" style="color:#ff5e8a;font-size:12px;margin-bottom:8px">${t('coop.manual_join_steps')}</div>`
        + (opts.answerCode
            ? codeBox('② ' + t('coop.your_answer'), opts.answerCode) + `<div class="mono" style="color:var(--neon-cyan);margin-top:12px">${t('coop.answer_wait')}</div>`
            : inBox('① ' + t('coop.host_code'), t('coop.paste_offer'), 'offer'));
    }
    const s = this.screen('screen-manual', `
      <div class="panel" style="min-width:min(480px,92vw);text-align:center">
        <h2 style="color:#ff5e8a">${t('coop.manual_title')}</h2>
        ${opts.error ? `<div class="mono" style="color:var(--neon-red);font-size:12px;margin-bottom:10px">${opts.error}</div>` : ''}
        ${body}
        ${this.diagBlock(this.game.netDiag)}
        <button class="btn small danger" style="margin-top:14px" data-act="back">${t('menu.back')}</button>
      </div>
    `);
    this.bind(s, '.btn', (b) => {
      const act = b.dataset.act;
      if (act === 'copy') {
        const out = s.querySelector('#mc-out');
        if (out) { out.select(); try { document.execCommand('copy'); } catch (e) {} if (navigator.clipboard) navigator.clipboard.writeText(out.value).catch(() => {}); }
      } else if (act === 'answer') {
        this.game.submitManualAnswer(s.querySelector('#mc-in').value);
      } else if (act === 'offer') {
        this.game.submitManualOffer(s.querySelector('#mc-in').value);
      } else if (act === 'back') this.game.leaveCoop();
    });
    // keep textareas from triggering game hotkeys
    s.querySelectorAll('textarea').forEach((ta) => ta.addEventListener('keydown', (e) => e.stopPropagation()));
  }

  showLobby(opts) {
    // opts: {code, roster: [{name,color,shape}], isHost, youIndex, mode}
    const isPvp = opts.mode === 'pvp';
    const maxP = isPvp ? 2 : 4;
    const rows = opts.roster.map((r, i) => `
      <div class="srow"><span class="k" style="color:${r.color === 'rainbow' ? '#ffd700' : r.color}">▶ ${r.name}${i === 0 ? ' — ' + t('coop.hostTag') : ''}${opts.youIndex === i ? ' (' + t('coop.you') + ')' : ''}</span>
      <span class="v" style="color:${r.color === 'rainbow' ? '#ffd700' : r.color}">${r.shape.toUpperCase()}</span></div>`).join('');
    // PVP: QWER loadout picker
    let loadoutHtml = '';
    if (isPvp) {
      const lo = this.game.myLoadout();
      loadoutHtml = `<div class="mono" style="color:#c084fc;font-size:11px;letter-spacing:0.25em;margin:16px 0 8px">▸ ${t('pvp.loadout')}</div>`
        + Object.entries(SLOT_OPTIONS).map(([slot, ids]) => `
          <div style="display:flex;gap:8px;justify-content:center;align-items:center;margin-bottom:8px">
            <span class="mono" style="color:#c084fc;font-weight:bold;width:20px">${slot.toUpperCase()}</span>
            ${ids.map((id) => {
              const sk = SKILLS[id];
              const sel = lo[slot] === id;
              return `<div data-skill="${slot}:${id}" class="mono" title="${L(sk.desc)}" style="cursor:pointer;padding:8px 12px;min-width:150px;font-size:11px;text-align:left;
                border:1px solid ${sel ? '#c084fc' : 'rgba(255,255,255,0.14)'};background:${sel ? 'rgba(192,132,252,0.12)' : 'rgba(0,0,0,0.3)'};
                ${sel ? 'box-shadow:0 0 10px rgba(192,132,252,0.4);' : ''}">
                <span style="font-size:14px">${sk.icon}</span> <b style="color:${sel ? '#fff' : 'var(--text-dim)'}">${L(sk.name)}</b>
                <div style="color:var(--text-dim);font-size:9.5px;margin-top:3px;line-height:1.4">${L(sk.desc)}</div>
              </div>`;
            }).join('')}
          </div>`).join('')
        + `<div class="hint" style="margin-top:6px">${t('pvp.controls')}</div>`;
    }
    const s = this.screen('screen-lobby', `
      <div class="panel" style="text-align:center;min-width:min(620px,94vw)">
        <h2 style="color:${isPvp ? '#c084fc' : '#ff5e8a'}">${isPvp ? t('pvp.title') : t('coop.title')}</h2>
        ${opts.code ? `
          <div class="mono" style="color:var(--text-dim);font-size:11px;letter-spacing:0.3em">${t('coop.code_label')}</div>
          <div class="mono" style="color:#fff;font-size:44px;letter-spacing:0.35em;text-shadow:0 0 18px ${isPvp ? '#c084fc' : '#ff5e8a'};margin:6px 0 14px">${opts.code}</div>
        ` : `<div class="mono" style="color:var(--text-dim);margin:10px 0 14px">${t('coop.waiting')}</div>`}
        <div class="mono" style="color:var(--text-dim);font-size:11px;letter-spacing:0.25em;margin-bottom:6px">${t('coop.players')} (${opts.roster.length}/${maxP})</div>
        <div class="stats-table">${rows}</div>
        ${loadoutHtml}
        ${opts.isHost ? `<button class="btn" data-act="start" ${opts.roster.length < 2 ? 'disabled' : ''}>⚔ ${isPvp ? t('pvp.start') : t('coop.start')}</button>
          ${opts.roster.length < 2 ? `<div class="hint">${t('coop.need2')}</div>` : ''}` : `<div class="hint">${t('coop.waiting')}</div>`}
        ${this.diagBlock(this.game.netDiag)}
        <button class="btn small danger" style="margin-top:10px" data-act="back">${t('menu.back')}</button>
      </div>
    `);
    s.querySelectorAll('[data-skill]').forEach((node) => node.addEventListener('click', () => {
      const [slot, id] = node.dataset.skill.split(':');
      this.game.audio.sfx('uiClick');
      this.game.setLoadout(slot, id);
      this.showLobby(opts); // re-render with new selection
    }));
    this.bind(s, '.btn', (b) => {
      if (b.dataset.act === 'start') {
        if (isPvp) this.game.startPvpDuel();
        else this.game.startCoopRaid();
      } else this.game.leaveCoop();
    });
  }

  // non-blocking upgrade offer during co-op (game keeps running behind it)
  showCoopOffer(cards, cb) {
    this.hideCoopOffer();
    const div = document.createElement('div');
    div.id = 'coop-offer';
    div.style.cssText = 'position:absolute;bottom:26px;left:50%;transform:translateX(-50%);z-index:20;display:flex;gap:10px;pointer-events:auto';
    div.innerHTML = cards.map((u, i) => `
      <div class="card r-${u.rarity}" data-i="${i}" style="width:170px;min-height:150px;padding:12px 10px">
        <div class="rarity">${u.rarity}</div>
        <div class="icon" style="font-size:24px;margin:2px 0 6px">${u.icon}</div>
        <div class="name" style="font-size:12px;min-height:auto">${L(u.name)}</div>
        <div class="desc" style="font-size:10px">${L(u.desc)}</div>
        <div class="stacks">[${i + 1}]</div>
      </div>`).join('');
    document.getElementById('ui-root').appendChild(div);
    div.querySelectorAll('.card').forEach((c) => {
      c.addEventListener('click', () => {
        this.game.audio.sfx('uiClick');
        const u = cards[+c.dataset.i];
        this.hideCoopOffer();
        cb(u);
      });
    });
  }

  hideCoopOffer() {
    const el = document.getElementById('coop-offer');
    if (el) el.remove();
  }

  showCoopResult(victory, rewards, trophy, onDone, isPvp = false) {
    const trophyHtml = trophy ? `
      <div class="mono" style="border:1px solid rgba(255,215,0,0.5);background:rgba(255,215,0,0.06);padding:14px 18px;margin:0 auto 20px;max-width:380px">
        <div style="color:#ffd700;font-size:11px;letter-spacing:0.3em;margin-bottom:8px">★ ${t('coop.trophy')} ★</div>
        <div style="font-size:16px;color:#fff;margin-bottom:6px">${trophy.icon} ${L(trophy.name)}</div>
        <div style="font-size:12px;color:var(--text-dim);line-height:1.6">${L(trophy.desc)}</div>
      </div>` : '';
    const s = this.screen('screen-coopover', `
      <div class="panel" style="text-align:center;min-width:min(480px,92vw)">
        <div class="big-result ${victory ? 'victory' : 'defeat'}">${victory ? t(isPvp ? 'pvp.win' : 'coop.victory') : t(isPvp ? 'pvp.lose' : 'coop.defeat')}</div>
        <div class="mono" style="font-size:18px;margin-bottom:18px">
          <span style="color:#ff5e8a">+${rewards.rubies} ◆</span> &nbsp;
          <span style="color:var(--neon-yellow)">+${rewards.credits} ⬡</span>
        </div>
        ${trophyHtml}
        <button class="btn" data-act="menu">${t('menu.mainmenu')}</button>
      </div>
    `);
    this.bind(s, '.btn', () => onDone());
  }

  // ---------- CUSTOMIZE ----------
  drawShipPreview(canvas, colorHex, shapeId) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cx = canvas.width / 2, cy = canvas.height / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 2);
    ctx.beginPath();
    Player.tracePath(ctx, 26, shapeId);
    ctx.fillStyle = '#0a1020';
    ctx.fill();
    ctx.strokeStyle = colorHex;
    ctx.lineWidth = 3;
    ctx.shadowColor = colorHex;
    ctx.shadowBlur = 18;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(26 * 0.15, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  showCustomize() {
    const meta = this.game.meta;
    const cu = meta.data.custom;
    const colorBtns = SHIP_COLORS.map((col, i) => {
      const unlocked = meta.data.unlockedColors.includes(i);
      const sel = cu.color === i;
      const lockLabel = col.raid ? t('custom.raid_only') : '◆' + col.cost;
      return `<div data-ci="${i}" style="width:54px;height:54px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;
        border:1px solid ${sel ? col.c : 'rgba(255,255,255,0.15)'};box-shadow:${sel ? '0 0 14px ' + col.c : 'none'};background:rgba(0,0,0,0.3)">
        <div style="width:22px;height:22px;background:${col.c};box-shadow:0 0 10px ${col.c};${unlocked ? '' : 'opacity:0.35'}"></div>
        <div class="mono" style="font-size:8px;color:${unlocked ? 'var(--text-dim)' : col.raid ? '#ffd700' : '#ff5e8a'};white-space:nowrap">${unlocked ? (sel ? '✓' : '&nbsp;') : lockLabel}</div>
      </div>`;
    }).join('') + (this.game.accounts.isAdmin() ? `
      <div data-ci="rainbow" style="width:54px;height:54px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;
        border:1px solid ${cu.color === 'rainbow' ? '#fff' : 'rgba(255,255,255,0.15)'};box-shadow:${cu.color === 'rainbow' ? '0 0 14px #fff' : 'none'};background:rgba(0,0,0,0.3)">
        <div style="width:22px;height:22px;background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red);box-shadow:0 0 10px #fff"></div>
        <div class="mono" style="font-size:8px;color:#ffd700">👑</div>
      </div>` : '');
    const shapeBtns = SHIP_SHAPES.map((sh, i) => `
      <div data-si="${i}" class="mono" style="cursor:pointer;padding:14px 10px;text-align:center;min-width:110px;
        border:1px solid ${cu.shape === i ? 'var(--neon-cyan)' : 'rgba(255,255,255,0.15)'};
        box-shadow:${cu.shape === i ? '0 0 14px rgba(0,240,255,0.4)' : 'none'};background:rgba(0,0,0,0.3)">
        <canvas width="80" height="64" data-shape-preview="${i}"></canvas>
        <div style="font-size:11px;letter-spacing:0.15em;color:${cu.shape === i ? '#fff' : 'var(--text-dim)'}">${L(sh.name)}</div>
      </div>`).join('');
    const isAdmin = this.game.accounts.isAdmin();
    const fxChip = (fx, kind) => {
      const owned = meta.ownsFx(fx.id) || (fx.admin && isAdmin);
      const sel = (cu[kind] || (kind === 'killFx' ? 'k_default' : 'd_default')) === fx.id;
      const locked = !owned;
      const label = fx.admin ? '👑' : (owned ? (sel ? '✓' : '&nbsp;') : '⬡' + fx.cost);
      const swatch = fx.color || 'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)';
      const border = sel ? (fx.color || '#fff') : (fx.admin ? '#ffd700' : 'rgba(255,255,255,0.15)');
      return `<div data-fx="${kind}:${fx.id}" title="${L(fx.name)}" style="width:64px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 2px;
        border:1px solid ${border};box-shadow:${sel ? '0 0 12px ' + (fx.color || '#fff') : 'none'};background:rgba(0,0,0,0.3);${locked && !fx.admin ? 'opacity:0.7' : ''}">
        <div style="width:20px;height:20px;border-radius:50%;background:${swatch};box-shadow:0 0 8px ${fx.color || '#fff'}"></div>
        <div class="mono" style="font-size:7.5px;color:#d8f4ff;text-align:center;line-height:1.2;height:18px;overflow:hidden">${L(fx.name)}</div>
        <div class="mono" style="font-size:8px;color:${owned ? 'var(--neon-green)' : fx.admin ? '#ffd700' : 'var(--neon-yellow)'}">${label}</div>
      </div>`;
    };
    const killChips = KILL_FX.filter((f) => !f.admin || isAdmin).map((f) => fxChip(f, 'killFx')).join('');
    const dashChips = DASH_FX.filter((f) => !f.admin || isAdmin).map((f) => fxChip(f, 'dashFx')).join('');
    const s = this.screen('screen-custom', `
      <div class="panel" style="text-align:center;width:min(720px,94vw)">
        <h2>${t('custom.title')}</h2>
        <canvas id="custom-preview" width="180" height="120" style="margin:2px auto 10px;display:block"></canvas>
        <div class="mono" style="color:var(--text-dim);font-size:11px;letter-spacing:0.25em;margin:10px 0 8px">${t('custom.color')}</div>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">${colorBtns}</div>
        <div class="mono" style="color:var(--text-dim);font-size:11px;letter-spacing:0.25em;margin:18px 0 8px">${t('custom.shape')}</div>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">${shapeBtns}</div>
        <div class="mono" style="color:var(--text-dim);font-size:11px;letter-spacing:0.25em;margin:18px 0 8px">${t('custom.killfx')}</div>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">${killChips}</div>
        <div class="mono" style="color:var(--text-dim);font-size:11px;letter-spacing:0.25em;margin:18px 0 8px">${t('custom.dashfx')}</div>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">${dashChips}</div>
        <div class="mono" style="margin-top:14px"><span style="color:var(--neon-yellow)">⬡ ${meta.data.credits}</span> &nbsp; <span style="color:#ff5e8a">◆ ${meta.data.rubies}</span></div>
        <button class="btn small" style="margin-top:14px" data-act="back">${t('menu.back')}</button>
      </div>
    `);
    s.querySelectorAll('[data-fx]').forEach((node) => node.addEventListener('click', () => {
      const [kind, id] = node.dataset.fx.split(':');
      const list = kind === 'killFx' ? KILL_FX : DASH_FX;
      const fx = list.find((f) => f.id === id);
      if (fx.admin && !isAdmin) { this.game.audio.sfx('denied'); return; }
      if (!meta.ownsFx(id) && !fx.admin) {
        if (!meta.buyFx(fx)) { this.game.audio.sfx('denied'); return; }
        this.game.audio.sfx('purchase');
      }
      meta.selectFx(kind, id);
      this.showCustomize();
    }));
    // previews (rainbow renders as gold in the static preview)
    const previewHex = cu.color === 'rainbow' ? '#ffd700' : (SHIP_COLORS[cu.color] || SHIP_COLORS[0]).c;
    this.drawShipPreview(s.querySelector('#custom-preview'), previewHex, SHIP_SHAPES[cu.shape].id);
    s.querySelectorAll('[data-shape-preview]').forEach((c) => {
      this.drawShipPreview(c, previewHex, SHIP_SHAPES[+c.dataset.shapePreview].id);
    });
    this.bind(s, '[data-ci]', (node) => {
      if (node.dataset.ci === 'rainbow') {
        cu.color = 'rainbow';
        meta.save();
        this.showCustomize();
        return;
      }
      const i = +node.dataset.ci;
      if (!this.game.meta.data.unlockedColors.includes(i)) {
        const col = SHIP_COLORS[i];
        if (col.raid) { this.game.audio.sfx('denied'); return; } // raid trophy only
        if (meta.data.rubies >= col.cost) {
          meta.data.rubies -= col.cost;
          meta.data.unlockedColors.push(i);
          this.game.audio.sfx('purchase');
        } else { this.game.audio.sfx('denied'); return; }
      }
      cu.color = i;
      meta.save();
      this.showCustomize();
    });
    this.bind(s, '[data-si]', (node) => {
      cu.shape = +node.dataset.si;
      meta.save();
      this.showCustomize();
    });
    this.bind(s, '.btn', () => this.showMenu());
  }

  // ---------- SECTOR INTRO (story bridge between sectors) ----------
  showSectorIntro(sectorDef, onContinue) {
    const s = this.screen('screen-sectorintro', `
      <div class="panel" style="max-width:min(660px,92vw);text-align:center;border-color:${sectorDef.palette.accent}55">
        <div class="mono" style="color:var(--text-dim);font-size:11px;letter-spacing:0.35em;margin-bottom:10px">${t('intro.incoming')}</div>
        <h2 style="color:${sectorDef.palette.accent};text-shadow:0 0 14px ${sectorDef.palette.accent}">${L(sectorDef.name)}</h2>
        <div class="mono" style="color:var(--text);font-size:14px;line-height:1.9;margin:8px 0 20px;text-align:left">${L(sectorDef.lore)}</div>
        <div class="mono" style="border:1px solid ${sectorDef.palette.accent}44;background:${sectorDef.palette.accent}0d;padding:12px 16px;text-align:left">
          <span style="color:${sectorDef.palette.accent};font-size:11px;letter-spacing:0.25em">▸ ${t('intro.objective')}</span>
          <div style="color:var(--text);font-size:13px;line-height:1.7;margin-top:6px">${L(sectorDef.objective)}</div>
        </div>
        <button class="btn" style="margin-top:22px" data-act="go">${t('intro.continue')}</button>
      </div>
    `);
    this.bind(s, '.btn', () => onContinue());
  }

  // ---------- SECTOR START CHOICE (Sector Key owners) ----------
  showSectorStart() {
    const s = this.screen('screen-sectorstart', `
      <div class="panel" style="text-align:center">
        <h2>${t('sector_start.title')}</h2>
        <button class="btn" data-s="1">${t('sector_start.s1')}</button>
        <button class="btn" data-s="2">⌘ ${t('sector_start.s2')}</button>
        <button class="btn small" data-s="back">${t('menu.back')}</button>
      </div>
    `);
    this.bind(s, '.btn', (b) => {
      if (b.dataset.s === 'back') this.showMenu();
      else this.game.startRun(+b.dataset.s);
    });
  }

  // ---------- SKILL TREE ----------
  showSkillTree() {
    const meta = this.game.meta;
    const maxTier = Math.max(...SKILL_NODES.map((n) => n.tier));
    const branchKeys = Object.keys(SKILL_BRANCHES);
    // build a grid: columns = branches, rows = tiers
    const cols = branchKeys.map((bk) => {
      const br = SKILL_BRANCHES[bk];
      let cells = `<div class="mono" style="color:${br.color};letter-spacing:0.2em;font-size:13px;text-shadow:0 0 8px ${br.color};margin-bottom:10px">${L(br.name)}</div>`;
      for (let tier = 0; tier <= maxTier; tier++) {
        const nodes = SKILL_NODES.filter((n) => n.branch === bk && n.tier === tier);
        cells += nodes.map((n) => {
          const st = nodeState(meta, n);
          const owned = st === 'owned';
          const dim = st === 'locked';
          const border = owned ? br.color : st === 'available' ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.12)';
          return `<div data-skill="${n.id}" style="cursor:${owned || dim ? 'default' : 'pointer'};border:1px solid ${border};
            background:${owned ? br.color + '18' : 'rgba(0,0,0,0.35)'};box-shadow:${owned ? '0 0 12px ' + br.color + '66' : 'none'};
            padding:8px 8px;margin-bottom:10px;opacity:${dim ? 0.4 : 1};text-align:left;position:relative">
            <div class="mono" style="font-size:12px;color:#fff">${n.icon} ${L(n.name)}</div>
            <div class="mono" style="font-size:9.5px;color:var(--text-dim);line-height:1.4;margin:3px 0">${L(n.desc)}</div>
            <div class="mono" style="font-size:10px;color:${owned ? 'var(--neon-green)' : st === 'available' ? 'var(--neon-yellow)' : '#6d8aa5'}">
              ${owned ? '✓ ' + t('skill.owned') : dim ? '🔒 ' + t('skill.locked') : '⬡ ' + n.cost}</div>
          </div>`;
        }).join('') || '<div style="height:10px"></div>';
      }
      return `<div style="flex:1;min-width:180px">${cells}</div>`;
    }).join('');
    const s = this.screen('screen-skilltree', `
      <div class="panel" style="width:min(760px,95vw)">
        <h2>${t('skill.title')}</h2>
        <div class="mono" style="text-align:center;color:var(--neon-yellow);margin-bottom:6px">⬡ ${meta.data.credits}</div>
        <div class="hint" style="margin:0 0 16px">${t('skill.hint')}</div>
        <div style="display:flex;gap:14px;justify-content:center;align-items:flex-start">${cols}</div>
        <div style="text-align:center;margin-top:18px"><button class="btn small" data-act="back">${t('menu.back')}</button></div>
      </div>
    `);
    s.querySelectorAll('[data-skill]').forEach((node) => node.addEventListener('click', () => {
      const def = SKILL_NODES.find((n) => n.id === node.dataset.skill);
      if (meta.buySkill(def)) { this.game.audio.sfx('purchase'); this.showSkillTree(); }
      else this.game.audio.sfx('denied');
    }));
    this.bind(s, '.btn', () => this.showMenu());
  }

  // ---------- META (permanent augments) ----------
  showMeta() {
    const meta = this.game.meta;
    const nodes = META_UPGRADES.map((def) => {
      const lv = meta.metaLevel(def.id);
      const maxed = lv >= def.max;
      const cost = meta.metaCost(def);
      const afford = meta.data.credits >= cost;
      return `<div class="meta-node ${maxed ? 'maxed' : ''} ${!maxed && !afford ? 'locked' : ''}" data-id="${def.id}">
        <div class="mn-name">${def.icon} ${L(def.name)} <span class="mn-level">${t('meta.level')} ${lv}/${def.max}</span></div>
        <div class="mn-desc">${L(def.desc)}</div>
        <div class="mn-cost">${maxed ? t('meta.maxed') : '⬡ ' + cost}</div>
      </div>`;
    }).join('');
    const s = this.screen('screen-meta', `
      <div class="panel" style="width:min(880px,94vw)">
        <h2>${t('meta.title')}</h2>
        <div class="mono" style="text-align:center;color:var(--neon-yellow);margin-bottom:16px;letter-spacing:0.15em">
          ${t('meta.credits')}: ⬡ ${meta.data.credits}
        </div>
        <div class="meta-grid">${nodes}</div>
        <div style="text-align:center;margin-top:20px">
          <button class="btn small" data-act="back">${t('menu.back')}</button>
          <button class="btn small danger" data-act="reset">${t('meta.reset')}</button>
        </div>
      </div>
    `);
    this.bind(s, '.meta-node', (node) => {
      const def = META_UPGRADES.find((d) => d.id === node.dataset.id);
      if (meta.buy(def)) { this.game.audio.sfx('purchase'); this.showMeta(); }
      else this.game.audio.sfx('denied');
    });
    this.bind(s, '.btn', (b) => {
      if (b.dataset.act === 'back') this.showMenu();
      else if (b.dataset.act === 'reset') {
        if (!this.resetArmed) {
          this.resetArmed = true;
          b.textContent = t('meta.reset_confirm');
        } else {
          meta.reset();
          this.game.applySettings();
          this.game.audio.sfx('denied');
          this.showMenu();
        }
      }
    });
  }

  // ---------- CORES ----------
  showCores() {
    const meta = this.game.meta;
    const cards = DASH_CORES.map((core) => {
      const unlocked = meta.data.unlockedCores.includes(core.id);
      const selected = meta.data.core === core.id;
      return `<div class="core-card ${selected ? 'selected' : ''} ${!unlocked ? 'locked' : ''}" data-id="${core.id}">
        <div class="cc-icon">${core.icon}</div>
        <div class="cc-name">${L(core.name)}</div>
        <div class="cc-desc">${L(core.desc)}</div>
        ${!unlocked ? `<div class="cc-lock">🔒 ${L(core.unlock.text)}</div>` : selected ? `<div class="cc-lock" style="color:var(--neon-green)">✓ ${t('cores.equipped')}</div>` : ''}
      </div>`;
    }).join('');
    const s = this.screen('screen-cores', `
      <div class="panel" style="width:min(880px,94vw)">
        <h2>${t('cores.title')}</h2>
        <div class="hint" style="margin:0 0 18px">${t('cores.select')}</div>
        <div class="cores-row">${cards}</div>
        <div style="text-align:center;margin-top:20px">
          <button class="btn small" data-act="back">${t('menu.back')}</button>
        </div>
      </div>
    `);
    this.bind(s, '.core-card', (card) => {
      const id = card.dataset.id;
      if (!meta.data.unlockedCores.includes(id)) { this.game.audio.sfx('denied'); return; }
      meta.data.core = id;
      meta.save();
      this.showCores();
    });
    this.bind(s, '.btn', () => this.showMenu());
  }

  // ---------- CODEX ----------
  showCodex() {
    const meta = this.game.meta;
    const enemyRows = Object.entries(ENEMY_TYPES).map(([id, e]) => {
      const seen = meta.data.seenEnemies.includes(id);
      return `<div class="srow"><span class="k" style="color:${seen ? e.color : 'var(--text-dim)'}">${seen ? '◆' : '◇'} ${seen ? L(e.name) : '???'}</span>
        <span class="v" style="font-size:11px;color:var(--text-dim)">${seen ? 'HP ' + e.hp + ' · DMG ' + e.dmg : t('codex.locked')}</span></div>`;
    }).join('');
    const bossRows = Object.entries(BOSSES).map(([id, b]) => {
      const seen = meta.data.seenBosses.includes(id);
      return `<div class="srow"><span class="k" style="color:${seen ? b.color : 'var(--text-dim)'}">${seen ? '★' : '☆'} ${seen ? L(b.name) : '???'}</span>
        <span class="v" style="font-size:11px;color:var(--text-dim)">${seen ? 'HP ' + b.hp : t('codex.locked')}</span></div>`;
    }).join('');
    const s = this.screen('screen-codex', `
      <div class="panel" style="width:min(720px,94vw)">
        <h2>${t('codex.title')}</h2>
        <div class="mono" style="color:var(--neon-cyan);font-size:12px;letter-spacing:0.2em;margin:8px 0">${t('codex.enemies')}</div>
        <div class="stats-table">${enemyRows}</div>
        <div class="mono" style="color:var(--neon-red);font-size:12px;letter-spacing:0.2em;margin:16px 0 8px">${t('codex.bosses')}</div>
        <div class="stats-table">${bossRows}</div>
        <div style="text-align:center;margin-top:14px">
          <button class="btn small" data-act="back">${t('menu.back')}</button>
        </div>
      </div>
    `);
    this.bind(s, '.btn', () => this.showMenu());
  }

  // ---------- SETTINGS ----------
  showSettings(returnTo) {
    const st = this.game.meta.data.settings;
    const s = this.screen('screen-settings', `
      <div class="panel">
        <h2>${t('settings.title')}</h2>
        <div class="settings-row"><label>${t('settings.master')}</label>
          <span style="display:flex;align-items:center;gap:10px"><input type="range" min="0" max="100" value="${st.master * 100}" data-vol="master"><span class="set-val mono" data-val="master" style="color:var(--neon-cyan);min-width:42px;text-align:right">${Math.round(st.master * 100)}%</span></span></div>
        <div class="settings-row"><label>${t('settings.sfx')}</label>
          <span style="display:flex;align-items:center;gap:10px"><input type="range" min="0" max="100" value="${st.sfx * 100}" data-vol="sfx"><span class="set-val mono" data-val="sfx" style="color:var(--neon-cyan);min-width:42px;text-align:right">${Math.round(st.sfx * 100)}%</span></span></div>
        <div class="settings-row"><label>${t('settings.music')}</label>
          <span style="display:flex;align-items:center;gap:10px"><input type="range" min="0" max="100" value="${st.music * 100}" data-vol="music"><span class="set-val mono" data-val="music" style="color:var(--neon-cyan);min-width:42px;text-align:right">${Math.round(st.music * 100)}%</span></span></div>
        <div class="settings-row"><label>${t('settings.lang')}</label>
          <select id="lang-select">
            <option value="en" ${st.lang === 'en' ? 'selected' : ''}>English</option>
            <option value="ko" ${st.lang === 'ko' ? 'selected' : ''}>한국어</option>
          </select></div>
        <div class="settings-row"><label>${t('settings.shake')}</label>
          <button class="toggle-btn ${st.shake ? 'on' : ''}" data-tgl="shake">${st.shake ? t('settings.on') : t('settings.off')}</button></div>
        <div class="settings-row"><label>${t('settings.quality')}</label>
          <button class="toggle-btn ${st.quality === 'high' ? 'on' : ''}" data-tgl="quality">${st.quality === 'high' ? t('settings.high') : t('settings.low')}</button></div>
        <div class="settings-row"><label>${t('settings.fullscreen')}</label>
          <button class="toggle-btn" data-tgl="fs">⛶</button></div>
        <div style="border-top:1px solid rgba(0,240,255,0.15);margin-top:14px;padding-top:12px">
          <div class="mono" style="color:var(--neon-cyan);font-size:12px;letter-spacing:0.15em;margin-bottom:4px">${t('settings.turn')}</div>
          <div class="hint" style="margin:0 0 8px;text-align:left;line-height:1.6">${t('settings.turn_help')}</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <input id="turn-url" class="mono" placeholder="turn:… (URL)" style="background:rgba(0,240,255,0.05);border:1px solid var(--panel-border);color:#fff;padding:9px;font-size:12px;outline:none">
            <div style="display:flex;gap:6px">
              <input id="turn-user" class="mono" placeholder="username" style="flex:1;background:rgba(0,240,255,0.05);border:1px solid var(--panel-border);color:#fff;padding:9px;font-size:12px;outline:none">
              <input id="turn-cred" class="mono" placeholder="credential" style="flex:1;background:rgba(0,240,255,0.05);border:1px solid var(--panel-border);color:#fff;padding:9px;font-size:12px;outline:none">
            </div>
            <div><button class="btn small" style="min-width:auto" data-act="turnsave">${t('settings.turn_save')}</button>
              <button class="btn small" style="min-width:auto" data-act="turnclear">${t('settings.turn_clear')}</button>
              <span id="turn-status" class="mono" style="font-size:11px;color:var(--neon-green);margin-left:8px"></span></div>
          </div>
        </div>
        <div style="text-align:center;margin-top:18px">
          <button class="btn small" data-act="back">${t('menu.back')}</button>
        </div>
      </div>
    `);
    // load saved TURN into the fields
    try {
      const saved = JSON.parse(localStorage.getItem('np_turn') || 'null');
      if (saved) {
        s.querySelector('#turn-url').value = saved.urls || '';
        s.querySelector('#turn-user').value = saved.username || '';
        s.querySelector('#turn-cred').value = saved.credential || '';
        s.querySelector('#turn-status').textContent = '● ' + t('settings.turn_on');
      }
    } catch (e) { /* ignore */ }
    s.querySelectorAll('#turn-url,#turn-user,#turn-cred').forEach((i) => i.addEventListener('keydown', (e) => e.stopPropagation()));
    s.querySelectorAll('input[type=range]').forEach((r) => {
      r.addEventListener('input', () => {
        const kind = r.dataset.vol;
        st[kind] = r.value / 100;
        this.game.audio.setVolume(kind, st[kind]);
        this.game.meta.save();
        const valEl = s.querySelector(`[data-val="${kind}"]`);
        if (valEl) valEl.textContent = Math.round(r.value) + '%';
        if (kind !== 'music') this.game.audio.sfx('uiHover');
      });
    });
    s.querySelector('#lang-select').addEventListener('change', (e) => {
      st.lang = e.target.value;
      setLang(st.lang);
      this.game.meta.save();
      this.game.refreshStaticText();
      this.showSettings(returnTo);
    });
    this.bind(s, '.toggle-btn', (b) => {
      const k = b.dataset.tgl;
      if (k === 'shake') { st.shake = !st.shake; this.game.effects.shakeEnabled = st.shake; }
      else if (k === 'quality') { st.quality = st.quality === 'high' ? 'low' : 'high'; this.game.effects.quality = st.quality === 'high' ? 1 : 0.45; }
      else if (k === 'fs') {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().catch(() => {});
        return;
      }
      this.game.meta.save();
      this.showSettings(returnTo);
    });
    this.bind(s, '.btn', (b) => {
      const act = b.dataset.act;
      if (act === 'turnsave') {
        const url = s.querySelector('#turn-url').value.trim();
        if (!url) { s.querySelector('#turn-status').textContent = '✕ URL?'; this.game.audio.sfx('denied'); return; }
        localStorage.setItem('np_turn', JSON.stringify({ urls: url, username: s.querySelector('#turn-user').value.trim(), credential: s.querySelector('#turn-cred').value.trim() }));
        s.querySelector('#turn-status').textContent = '● ' + t('settings.turn_on');
        this.game.audio.sfx('purchase');
        return;
      }
      if (act === 'turnclear') {
        localStorage.removeItem('np_turn');
        s.querySelector('#turn-url').value = ''; s.querySelector('#turn-user').value = ''; s.querySelector('#turn-cred').value = '';
        s.querySelector('#turn-status').textContent = '';
        this.game.audio.sfx('uiBack');
        return;
      }
      if (returnTo === 'pause') this.showPause();
      else this.showMenu();
    });
  }

  // ---------- PAUSE ----------
  showPause() {
    const s = this.screen('screen-pause', `
      <div class="panel" style="text-align:center">
        <h2>${t('pause.title')}</h2>
        <button class="btn" data-act="resume">${t('menu.resume')}</button>
        <button class="btn" data-act="settings">${t('menu.settings')}</button>
        <button class="btn danger" data-act="quit">${t('menu.quit')}</button>
      </div>
    `);
    this.bind(s, '.btn', (b) => {
      const act = b.dataset.act;
      if (act === 'resume') this.game.togglePause();
      else if (act === 'settings') this.showSettings('pause');
      else if (act === 'quit') this.game.abortRun();
    });
  }

  // ---------- LEVEL UP ----------
  showLevelUp(choices, rerollsLeft) {
    const cards = choices.map((u, i) => {
      const count = this.game.player.upgradeCounts[u.id] || 0;
      const cat = CATEGORIES[u.cat];
      return `<div class="card r-${u.rarity}" data-i="${i}">
        <div class="rarity">${u.rarity} · <span style="color:${cat.color}">${L(cat.name)}</span></div>
        <div class="icon">${u.icon}</div>
        <div class="name">${L(u.name)}</div>
        <div class="desc">${L(u.desc)}</div>
        <div class="stacks">${count > 0 ? `${t('archive.max')} ${count}/${u.max} · [${i + 1}]` : `${t('archive.max')} ${u.max} · [${i + 1}]`}</div>
      </div>`;
    }).join('');
    const s = this.screen('screen-levelup', `
      <div style="text-align:center">
        <h2 class="mono" style="color:var(--neon-magenta);letter-spacing:0.3em;font-size:18px;text-shadow:0 0 12px rgba(255,47,214,0.7);margin-bottom:24px">
          ${t('levelup.title')}</h2>
        <div class="card-row">${cards}</div>
        <div style="margin-top:20px">
          <button class="btn small" data-act="reroll" ${rerollsLeft <= 0 ? 'disabled' : ''}>⟳ ${t('levelup.reroll', { n: rerollsLeft })}</button>
        </div>
      </div>
    `);
    // brief input guard so a stray click can't instantly pick a card
    const openedAt = performance.now();
    this.bind(s, '.card', (card) => {
      if (performance.now() - openedAt < 450) return;
      this.game.pickUpgrade(choices[+card.dataset.i]);
    });
    this.bind(s, '.btn', () => this.game.rerollUpgrades());
  }

  // ---------- EPIC REWARD (elite node) ----------
  showEpicReward(u) {
    const s = this.screen('screen-epic', `
      <div style="text-align:center">
        <h2 class="mono" style="color:var(--neon-yellow);letter-spacing:0.3em;font-size:18px;text-shadow:0 0 12px rgba(255,233,74,0.7);margin-bottom:24px">
          ★ ELITE REWARD ★</h2>
        <div class="card-row">
          <div class="card r-${u.rarity}" data-i="0">
            <div class="rarity">${u.rarity}</div>
            <div class="icon">${u.icon}</div>
            <div class="name">${L(u.name)}</div>
            <div class="desc">${L(u.desc)}</div>
            <div class="stacks">✓</div>
          </div>
        </div>
      </div>
    `);
    this.bind(s, '.card', () => this.game.takeEpicReward(u));
  }

  // ---------- PATH SELECT ----------
  showPath(options) {
    const descKey = { combat: 'path.combat_desc', elite: 'path.elite_desc', cache: 'path.cache_desc', repair: 'path.repair_desc', boss: 'path.boss_desc', bonus: 'path.bonus_desc' };
    const nameKey = { combat: 'path.combat', elite: 'path.elite', cache: 'path.cache', repair: 'path.repair', boss: 'path.boss', bonus: 'path.bonus' };
    const colors = { combat: 'var(--neon-cyan)', elite: 'var(--neon-yellow)', cache: 'var(--neon-green)', repair: 'var(--neon-green)', boss: 'var(--neon-red)', bonus: '#ff5e8a' };
    // each branch has a different difficulty — shown as a danger rating
    const danger = { repair: 1, combat: 2, cache: 3, elite: 4, boss: 5 };
    const dangerBar = (n) => {
      let s2 = '';
      for (let i = 0; i < 5; i++) s2 += i < n ? '◆' : '◇';
      return s2;
    };
    const dangerColor = ['', '#4aff8f', '#00f0ff', '#ffe94a', '#ff7b00', '#ff3b5c'];
    const cards = options.map((o, i) => `
      <div class="card" data-t="${o}" style="min-height:210px">
        <div class="icon" style="color:${colors[o]}">${NODE_ICONS[o]}</div>
        <div class="name" style="color:${colors[o]}">${t(nameKey[o])}</div>
        <div class="desc">${t(descKey[o])}</div>
        <div class="mono" style="font-size:10px;letter-spacing:0.2em;color:${dangerColor[danger[o]]};margin-top:6px;text-align:center">
          ${t('path.danger')} ${dangerBar(danger[o])}</div>
        <div class="stacks">[${i + 1}]</div>
      </div>`).join('');
    const s = this.screen('screen-path', `
      <div style="text-align:center">
        <h2 class="mono" style="color:var(--neon-cyan);letter-spacing:0.3em;font-size:18px;text-shadow:0 0 12px rgba(0,240,255,0.7);margin-bottom:24px">
          ${t('path.title')}</h2>
        <div class="card-row">${cards}</div>
      </div>
    `);
    this.bind(s, '.card', (card) => this.game.choosePath(card.dataset.t));
  }

  // ---------- GAME OVER / VICTORY ----------
  showResults(victory, data) {
    const rows = [
      [t('over.sector'), data.sector],
      [t('over.wave'), data.waves],
      [t('over.kills'), data.kills],
      [t('over.dashes'), data.dashes],
      [t('over.level'), data.level],
      [t('over.time'), formatTime(data.time)],
      [t('over.credits'), '⬡ ' + data.credits],
      [t('over.rubies'), '◆ ' + (data.rubies || 0)],
    ].map(([k, v]) => `<div class="srow"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('');
    const unlocks = (data.unlocks || []).map((c) =>
      `<div class="unlock-banner">✦ ${t('unlock.banner', { name: L(c.name) })}</div>`).join('');
    const s = this.screen('screen-over', `
      <div class="panel" style="text-align:center;min-width:min(520px,92vw)">
        <div class="big-result ${victory ? 'victory' : 'defeat'}">${victory ? t('over.victory') : t('over.defeat')}</div>
        ${data.newBest ? `<div class="unlock-banner">◆ ${t('over.newbest')} ◆</div>` : ''}
        ${unlocks}
        <div class="stats-table">${rows}</div>
        <button class="btn" data-act="retry">${t('menu.retry')}</button>
        <button class="btn" data-act="menu">${t('menu.mainmenu')}</button>
      </div>
    `);
    this.bind(s, '.btn', (b) => {
      if (b.dataset.act === 'retry') this.game.startRun();
      else this.game.toMenu();
    });
  }

  // ---------- HUD ----------
  buildPips(n) {
    this.el.pips.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const d = document.createElement('div');
      d.className = 'pip';
      this.el.pips.appendChild(d);
    }
  }

  updateHUD(world) {
    const p = world.player;
    const sh01 = Math.max(0, p.shield / p.maxShield);
    const hp01 = Math.max(0, p.hp / p.maxHp);
    this.el.shield.style.transform = `scaleX(${sh01})`;
    this.el.hp.style.transform = `scaleX(${hp01})`;
    // ghost bars trail behind on damage, snap forward on heal
    this.el.shieldGhost.style.transform = `scaleX(${sh01})`;
    this.el.hpGhost.style.transform = `scaleX(${hp01})`;
    this.el.shieldVal.textContent = `${Math.ceil(p.shield)}/${p.maxShield}`;
    this.el.hpVal.textContent = `${Math.ceil(p.hp)}/${p.maxHp}`;
    this.el.xp.style.transform = `scaleX(${world.isCoop ? Math.min(1, world.teamXp / world.teamXpNeed) : Math.min(1, p.xp / p.xpNeed)})`;
    this.el.level.textContent = `LV ${world.isCoop ? world.teamLevel : p.level}`;
    // pips
    const pips = this.el.pips.children;
    if (pips.length !== p.maxDashCharges) this.buildPips(p.maxDashCharges);
    for (let i = 0; i < pips.length; i++) {
      const full = p.dashCharges >= i + 1;
      const charging = !full && p.dashCharges > i;
      pips[i].className = 'pip' + (full ? ' full' : charging ? ' charging' : '');
    }
    if (world.isCoop) {
      this.el.sector.textContent = 'OVERCLOCK PROTOCOL';
      this.el.wave.textContent = `${t('coop.wave')} ${world.wave}/12 · LV ${world.teamLevel}`;
    } else {
      this.el.sector.textContent = L(world.sectorDef.name);
      this.el.wave.textContent = world.nodeType === 'boss'
        ? 'BOSS'
        : `${t('hud.wave')} ${world.wave}/${world.wavesInNode} · ${NODE_ICONS[world.nodeType]} ${world.nodeIndex + 1}/4`;
    }
    this.el.credits.innerHTML = `⬡ ${world.creditsEarned} &nbsp;<span style="color:#ff5e8a">◆ ${this.game.meta.data.rubies}</span>`;
    // boss bar
    const boss = world.boss && world.enemies.includes(world.boss) ? world.boss : null;
    this.el.bossWrap.classList.toggle('visible', !!boss);
    if (boss) {
      this.el.bossName.textContent = L(boss.def.name);
      this.el.bossBar.style.transform = `scaleX(${Math.max(0, boss.hp / boss.maxHp)})`;
    }
    // combo
    if (p.combo >= 3) {
      this.el.combo.classList.add('visible');
      this.el.combo.textContent = `${t('combo.label')} ×${p.combo}`;
    } else {
      this.el.combo.classList.remove('visible');
    }
  }

  setHint(text) { this.el.hint.textContent = text; }

  announce(text, color = '#ffffff') {
    const el = this.el.announce;
    el.textContent = text;
    el.style.color = color;
    el.style.textShadow = `0 0 20px ${color}, 0 0 60px ${color}`;
    el.style.transition = 'none';
    el.style.opacity = '1';
    if (this.announceTimeout) clearTimeout(this.announceTimeout);
    this.announceTimeout = setTimeout(() => {
      el.style.transition = 'opacity 0.8s';
      el.style.opacity = '0';
    }, 1300);
  }

  flashDamage() {
    const el = this.el.damageFlash;
    el.style.transition = 'none';
    el.style.opacity = '1';
    requestAnimationFrame(() => {
      el.style.transition = 'opacity 0.4s';
      el.style.opacity = '0';
    });
  }
}
