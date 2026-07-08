// meta.js — persistent save: credits, permanent augments, dash cores, unlocks, stats, settings
import { SKILL_NODES } from './skilltree.js';
const SAVE_KEY = 'neon_protocol_save_v1';

export const META_UPGRADES = [
  { id: 'hp', icon: '♥', max: 5, baseCost: 40, costMul: 1.7,
    name: { en: 'Reinforced Kernel', ko: '강화 커널' },
    desc: { en: '+15 max integrity per level.', ko: '레벨당 최대 무결성 +15.' } },
  { id: 'shield', icon: '◈', max: 5, baseCost: 40, costMul: 1.7,
    name: { en: 'Shield Capacitor', ko: '실드 축전기' },
    desc: { en: '+12 max shield per level.', ko: '레벨당 최대 실드 +12.' } },
  { id: 'shieldRegen', icon: '↻', max: 4, baseCost: 60, costMul: 1.8,
    name: { en: 'Fast Reboot', ko: '고속 리부트' },
    desc: { en: 'Shield regen starts 0.35s sooner per level.', ko: '레벨당 실드 재생 시작 0.35초 단축.' } },
  { id: 'dashCharge', icon: '⚡', max: 2, baseCost: 220, costMul: 2.6,
    name: { en: 'Charge Bank', ko: '충전 뱅크' },
    desc: { en: '+1 dash charge per level.', ko: '레벨당 대시 충전 +1.' } },
  { id: 'dashDmg', icon: '✦', max: 5, baseCost: 55, costMul: 1.75,
    name: { en: 'Sharpened Vector', ko: '예리한 벡터' },
    desc: { en: '+10% dash damage per level.', ko: '레벨당 대시 피해 +10%.' } },
  { id: 'dashCd', icon: '≫', max: 4, baseCost: 70, costMul: 1.8,
    name: { en: 'Overclock', ko: '오버클럭' },
    desc: { en: 'Dash recharges 8% faster per level.', ko: '레벨당 대시 재충전 8% 가속.' } },
  { id: 'speed', icon: '➤', max: 4, baseCost: 50, costMul: 1.7,
    name: { en: 'Optimized Runtime', ko: '최적화 런타임' },
    desc: { en: '+6% move speed per level.', ko: '레벨당 이동 속도 +6%.' } },
  { id: 'magnet', icon: '◎', max: 3, baseCost: 45, costMul: 1.6,
    name: { en: 'Data Magnet', ko: '데이터 자석' },
    desc: { en: '+30% pickup radius per level.', ko: '레벨당 획득 반경 +30%.' } },
  { id: 'credits', icon: '⬡', max: 4, baseCost: 80, costMul: 1.9,
    name: { en: 'Mining Subroutine', ko: '채굴 서브루틴' },
    desc: { en: '+12% credits earned per level.', ko: '레벨당 크레딧 획득 +12%.' } },
  { id: 'xp', icon: '▲', max: 4, baseCost: 80, costMul: 1.9,
    name: { en: 'Learning Model', ko: '학습 모델' },
    desc: { en: '+10% data shards value per level.', ko: '레벨당 데이터 조각 가치 +10%.' } },
  { id: 'reroll', icon: '⟳', max: 3, baseCost: 100, costMul: 2.0,
    name: { en: 'Fork Process', ko: '포크 프로세스' },
    desc: { en: '+1 upgrade reroll per run per level.', ko: '레벨당 런마다 업그레이드 리롤 +1.' } },
  { id: 'revive', icon: '✚', max: 1, baseCost: 600, costMul: 1,
    name: { en: 'Backup Instance', ko: '백업 인스턴스' },
    desc: { en: 'Once per run, survive fatal damage with 30% integrity.', ko: '런당 1회, 치명상을 무결성 30%로 버텨냅니다.' } },
];

export const DASH_CORES = [
  { id: 'standard', icon: '▶',
    name: { en: 'VECTOR CORE', ko: '벡터 코어' },
    desc: { en: 'Balanced dash. 3 charges. Kills refund 40% of a charge.', ko: '균형 잡힌 대시. 충전 3회. 처치 시 충전 40% 환급.' },
    unlock: null },
  { id: 'blink', icon: '✧',
    name: { en: 'BLINK CORE', ko: '블링크 코어' },
    desc: { en: 'Teleport instead of dashing. Arrival detonation. 2 charges, faster recharge.', ko: '대시 대신 순간이동. 도착 지점 폭발. 충전 2회, 재충전 빠름.' },
    unlock: { type: 'bestSector', value: 2, text: { en: 'Reach Sector 2', ko: '섹터 2 도달' } } },
  { id: 'phantom', icon: '◇',
    name: { en: 'PHANTOM CORE', ko: '팬텀 코어' },
    desc: { en: 'Longer dash with lingering damage wake. Slower recharge, wider hits.', ko: '더 긴 대시와 잔류 피해 항적. 재충전 느림, 판정 넓음.' },
    unlock: { type: 'kills', value: 800, text: { en: 'Purge 800 hostiles', ko: '적 800기 정화' } } },
  { id: 'surge', icon: '✹',
    name: { en: 'SURGE CORE', ko: '서지 코어' },
    desc: { en: 'Short dash that ends in a shockwave blast. 4 charges.', ko: '짧은 대시 후 충격파 폭발. 충전 4회.' },
    unlock: { type: 'bestSector', value: 3, text: { en: 'Reach Sector 3', ko: '섹터 3 도달' } } },
  { id: 'ricochet', icon: '⟁',
    name: { en: 'RICOCHET CORE', ko: '리코셰 코어' },
    desc: { en: 'Dashes bounce off arena walls up to twice, hitting fresh targets each bounce.', ko: '대시가 벽에 최대 2번 튕기며, 튕길 때마다 새로 적을 벱니다. 당구처럼 각을 재보세요.' },
    unlock: { type: 'minigameWins', value: 5, text: { en: 'Win 5 bonus stages', ko: '보너스 스테이지 5회 승리' } } },
  { id: 'gemini', icon: '⧉',
    name: { en: 'GEMINI CORE', ko: '제미니 코어' },
    desc: { en: 'Every dash sends a phantom twin slicing the opposite direction.', ko: '대시할 때마다 반대 방향으로 쌍둥이 잔상이 함께 벱니다. 앞뒤가 동시에 뚫려요.' },
    unlock: { type: 'kills', value: 2500, text: { en: 'Purge 2,500 hostiles', ko: '적 2,500기 정화' } } },
  { id: 'vortex', icon: '৩',
    name: { en: 'VORTEX CORE', ko: '볼텍스 코어' },
    desc: { en: 'Dash exit tears open a vortex — enemies get dragged in for the next one. 2 charges.', ko: '대시가 끝나는 지점에 소용돌이가 열려 적을 끌어당깁니다. 다음 대시의 밥상 차리기. 충전 2회.' },
    unlock: { type: 'victories', value: 1, text: { en: 'Liberate the Core once', ko: '코어 해방 1회 달성' } } },
];

// ---- raid trophies: earned only by clearing the co-op raid, never sold ----
export const RAID_ITEMS = [
  { id: 'raid_banner', icon: '🏅',
    name: { en: 'GOLDEN SIGNATURE', ko: '골든 시그니처' },
    desc: { en: 'Unlocks the golden hull color — proof you cleared the raid.', ko: '황금 기체 색상 해금 — 레이드를 함께 뚫어냈다는 증표입니다.' } },
  { id: 'raid_core', icon: '⚙',
    name: { en: 'OVERCLOCK RELAY', ko: '오버클럭 릴레이' },
    desc: { en: '+1 dash charge and 10% faster recharge, in every mode.', ko: '모든 모드에서 대시 충전 +1, 재충전 10% 가속.' } },
  { id: 'raid_aegis', icon: '🛡',
    name: { en: 'WARBOND PLATING', ko: '전우의 장갑판' },
    desc: { en: '+15 max shield, and revives grant 5s of invulnerability.', ko: '최대 실드 +15, 부활 시 5초 무적.' } },
  { id: 'raid_sigil', icon: '👑',
    name: { en: 'ADMIN SIGIL', ko: '어드민 시길' },
    desc: { en: '+25% damage to guardians and elites, permanently.', ko: '수호자·엘리트에게 주는 피해 영구 +25%.' } },
];

// ---- special items: bought with rubies, permanent, unique ----
export const SPECIAL_ITEMS = [
  { id: 'backup_core', icon: '✚', cost: 12,
    name: { en: 'BACKUP CORE', ko: '백업 코어' },
    desc: { en: '+1 revive every run (stacks with Backup Instance).', ko: '매 런마다 부활 +1 (백업 인스턴스와 중첩).' } },
  { id: 'head_start', icon: '▲', cost: 8,
    name: { en: 'BOOT LOADER', ko: '부트 로더' },
    desc: { en: 'Start every run at level 3 — pick 2 upgrades immediately.', ko: '매 런을 레벨 3으로 시작 — 즉시 업그레이드 2개 선택.' } },
  { id: 'golden_router', icon: '⬡', cost: 6,
    name: { en: 'GOLDEN ROUTER', ko: '골든 라우터' },
    desc: { en: '+50% coins from all sources.', ko: '모든 코인 획득 +50%.' } },
  { id: 'prism_shard', icon: '◆', cost: 5,
    name: { en: 'PRISM SHARD', ko: '프리즘 샤드' },
    desc: { en: '+1 ruby from every minigame victory.', ko: '미니게임 승리 보상 루비 +1.' } },
  { id: 'overdrive_chip', icon: '✦', cost: 7,
    name: { en: 'OVERDRIVE CHIP', ko: '오버드라이브 칩' },
    desc: { en: '+15% dash damage, permanently.', ko: '대시 피해 영구 +15%.' } },
  { id: 'nano_plating', icon: '♥', cost: 6,
    name: { en: 'NANO PLATING', ko: '나노 도금' },
    desc: { en: '+25 max integrity, permanently.', ko: '최대 무결성 영구 +25.' } },
  { id: 'aegis_loop', icon: '↻', cost: 9,
    name: { en: 'AEGIS LOOP', ko: '이지스 루프' },
    desc: { en: 'Shield regenerates 50% faster.', ko: '실드 재생 속도 +50%.' } },
  { id: 'lucky_protocol', icon: '★', cost: 10,
    name: { en: 'LUCKY PROTOCOL', ko: '럭키 프로토콜' },
    desc: { en: 'Epic cards appear twice as often.', ko: '에픽 카드 등장 확률 2배.' } },
  { id: 'time_dilator', icon: '◔', cost: 5,
    name: { en: 'TIME DILATOR', ko: '타임 딜레이터' },
    desc: { en: 'Minigame timers run 25% slower.', ko: '미니게임 제한시간 25% 여유.' } },
  { id: 'sector_key', icon: '⌘', cost: 15,
    name: { en: 'SECTOR KEY', ko: '섹터 키' },
    desc: { en: 'Option to start runs from Sector 2.', ko: '런을 섹터 2부터 시작 가능.' } },
];

// ---- cosmetics: kill effect + dash trail skins (bought with coins) ----
// style drives effects.killBurst / player trail rendering. admin:true = admin-only ultra.
export const KILL_FX = [
  { id: 'k_default', cost: 0,  style: 'burst',   color: null,       name: { en: 'STANDARD', ko: '기본' } },
  { id: 'k_ember',   cost: 120, style: 'ember',   color: '#ff7b00', name: { en: 'EMBER BLOOM', ko: '잉걸불' } },
  { id: 'k_prism',   cost: 160, style: 'prism',   color: '#ff2fd6', name: { en: 'PRISM SHATTER', ko: '프리즘 파쇄' } },
  { id: 'k_void',    cost: 200, style: 'void',    color: '#9b5cff', name: { en: 'VOID IMPLODE', ko: '보이드 붕괴' } },
  { id: 'k_bloom',   cost: 140, style: 'bloom',   color: '#4aff8f', name: { en: 'DATA BLOSSOM', ko: '데이터 개화' } },
  { id: 'k_glitch',  cost: 180, style: 'glitch',  color: '#ff2fd6', name: { en: 'GLITCH BYTES', ko: '글리치 바이트' } },
  { id: 'k_frost',   cost: 160, style: 'frost',   color: '#7dd8ff', name: { en: 'FROST BURST', ko: '서리 폭발' } },
  { id: 'k_gold',    cost: 240, style: 'gold',    color: '#ffd700', name: { en: 'GOLD RUSH', ko: '골드 러시' } },
  { id: 'k_ring',    cost: 200, style: 'ring',    color: '#00f0ff', name: { en: 'PULSE RINGS', ko: '펄스 링' } },
  { id: 'k_super',   cost: 0,   style: 'supernova', color: null, admin: true, name: { en: 'SUPERNOVA', ko: '슈퍼노바' } },
];

export const DASH_FX = [
  { id: 'd_default', cost: 0,  style: 'streak',  color: null,       name: { en: 'STANDARD', ko: '기본' } },
  { id: 'd_flame',   cost: 120, style: 'flame',   color: '#ff7b00', name: { en: 'FLAME WAKE', ko: '화염 항적' } },
  { id: 'd_rainbow', cost: 200, style: 'rainbow', color: null,      name: { en: 'CHROMA STREAM', ko: '크로마 스트림' } },
  { id: 'd_shadow',  cost: 140, style: 'shadow',  color: '#9b5cff', name: { en: 'SHADOW STEP', ko: '그림자 밟기' } },
  { id: 'd_star',    cost: 160, style: 'star',    color: '#ffe94a', name: { en: 'STARDUST', ko: '별가루' } },
  { id: 'd_ice',     cost: 160, style: 'ice',     color: '#7dd8ff', name: { en: 'FROST TRAIL', ko: '서리 자국' } },
  { id: 'd_pulse',   cost: 180, style: 'pulse',   color: '#00f0ff', name: { en: 'NEON PULSE', ko: '네온 펄스' } },
  { id: 'd_bolt',    cost: 220, style: 'bolt',    color: '#a5b4fc', name: { en: 'ARC BOLT', ko: '아크 볼트' } },
  { id: 'd_petal',   cost: 140, style: 'petal',   color: '#4aff8f', name: { en: 'BLOSSOM WAKE', ko: '꽃잎 항적' } },
  { id: 'd_galaxy',  cost: 0,   style: 'galaxy',  color: null, admin: true, name: { en: 'GALAXY DRIVE', ko: '갤럭시 드라이브' } },
];

// ---- ship customization ----
export const SHIP_COLORS = [
  { c: '#00f0ff', cost: 0 }, { c: '#4aff8f', cost: 0 }, { c: '#ffe94a', cost: 0 }, { c: '#ff2fd6', cost: 0 },
  { c: '#ff7b00', cost: 4 }, { c: '#ff3b5c', cost: 4 }, { c: '#c084fc', cost: 4 }, { c: '#ffffff', cost: 6 },
  { c: '#ffd700', cost: 0, raid: true }, // golden hull — raid trophy only
];
export const SHIP_SHAPES = [
  { id: 'vector', name: { en: 'VECTOR', ko: '벡터' } },
  { id: 'arrow', name: { en: 'ARROW', ko: '애로우' } },
  { id: 'delta', name: { en: 'DELTA', ko: '델타' } },
];

function defaultSave() {
  return {
    credits: 0,
    rubies: 0,
    meta: {},           // id -> level
    items: [],          // special item ids purchased
    custom: { color: 0, shape: 0, killFx: 'k_default', dashFx: 'd_default' },
    ownedFx: ['k_default', 'd_default'],
    skills: [],         // unlocked skill-tree node ids
    unlockedColors: [0, 1, 2, 3],
    core: 'standard',
    unlockedCores: ['standard'],
    seenEnemies: [],
    seenBosses: [],
    playedMinigames: [],
    storySeen: false,
    stats: { kills: 0, runs: 0, bestSector: 0, bestWaves: 0, victories: 0, dashes: 0, bestKillsRun: 0, minigameWins: 0 },
    settings: { lang: 'en', master: 0.8, sfx: 0.8, music: 0.6, shake: true, quality: 'high' },
  };
}

export class Meta {
  constructor() {
    this.key = SAVE_KEY; // guest save by default; switches per logged-in user
    this.data = defaultSave();
    this.load();
  }

  // switch to a user's save slot (null → guest slot). Saves current data first.
  setUser(userId) {
    this.save();
    this.key = userId ? SAVE_KEY + '::' + userId : SAVE_KEY;
    this.data = defaultSave();
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.data = Object.assign(defaultSave(), parsed);
        this.data.stats = Object.assign(defaultSave().stats, parsed.stats || {});
        this.data.settings = Object.assign(defaultSave().settings, parsed.settings || {});
      }
    } catch (e) { /* corrupted save -> fresh */ }
  }

  save() {
    try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { /* storage unavailable */ }
  }

  reset() {
    this.data = defaultSave();
    this.save();
  }

  metaLevel(id) { return this.data.meta[id] || 0; }

  metaCost(def) {
    const lv = this.metaLevel(def.id);
    return Math.round(def.baseCost * Math.pow(def.costMul, lv));
  }

  canBuy(def) {
    return this.metaLevel(def.id) < def.max && this.data.credits >= this.metaCost(def);
  }

  buy(def) {
    if (!this.canBuy(def)) return false;
    this.data.credits -= this.metaCost(def);
    this.data.meta[def.id] = this.metaLevel(def.id) + 1;
    this.save();
    return true;
  }

  hasItem(id) { return this.data.items.includes(id); }

  canBuyItem(item) {
    return !this.hasItem(item.id) && this.data.rubies >= item.cost;
  }

  buyItem(item) {
    if (!this.canBuyItem(item)) return false;
    this.data.rubies -= item.cost;
    this.data.items.push(item.id);
    this.save();
    return true;
  }

  addRubies(n) {
    this.data.rubies += n;
    this.save();
  }

  // ---- skill tree (coins) ----
  hasSkill(id) { return (this.data.skills || []).includes(id); }

  buySkill(node) {
    if (this.hasSkill(node.id)) return false;
    if (!node.requires.every((r) => this.hasSkill(r))) return false;
    if (this.data.credits < node.cost) return false;
    this.data.credits -= node.cost;
    if (!this.data.skills) this.data.skills = [];
    this.data.skills.push(node.id);
    this.save();
    return true;
  }

  // ---- cosmetic FX skins (coins) ----
  ownsFx(id) { return (this.data.ownedFx || []).includes(id); }

  buyFx(fx) {
    if (this.ownsFx(fx.id) || fx.admin) return false;
    if (this.data.credits < fx.cost) return false;
    this.data.credits -= fx.cost;
    if (!this.data.ownedFx) this.data.ownedFx = [];
    this.data.ownedFx.push(fx.id);
    this.save();
    return true;
  }

  selectFx(kind, id) { // kind: 'killFx' | 'dashFx'
    if (!this.data.custom) this.data.custom = { color: 0, shape: 0 };
    this.data.custom[kind] = id;
    this.save();
  }

  killFxStyle() {
    const list = KILL_FX;
    const sel = list.find((f) => f.id === (this.data.custom && this.data.custom.killFx)) || list[0];
    return sel;
  }
  dashFxStyle() {
    const list = DASH_FX;
    const sel = list.find((f) => f.id === (this.data.custom && this.data.custom.dashFx)) || list[0];
    return sel;
  }

  // check & apply unlocks; returns list of newly unlocked core defs
  checkUnlocks() {
    const newly = [];
    for (const core of DASH_CORES) {
      if (!core.unlock || this.data.unlockedCores.includes(core.id)) continue;
      const u = core.unlock;
      const s = this.data.stats;
      const ok = (u.type === 'bestSector' && s.bestSector >= u.value)
              || (u.type === 'kills' && s.kills >= u.value)
              || (u.type === 'victories' && s.victories >= u.value)
              || (u.type === 'minigameWins' && s.minigameWins >= u.value);
      if (ok) {
        this.data.unlockedCores.push(core.id);
        newly.push(core);
      }
    }
    if (newly.length) this.save();
    return newly;
  }

  markSeen(kind, id) {
    const arr = kind === 'boss' ? this.data.seenBosses : this.data.seenEnemies;
    if (!arr.includes(id)) { arr.push(id); this.save(); }
  }

  // grant a random unowned raid trophy; returns the item def or null if all owned
  grantRaidTrophy() {
    const unowned = RAID_ITEMS.filter((it) => !this.hasItem(it.id));
    if (unowned.length === 0) return null;
    const item = unowned[Math.floor(Math.random() * unowned.length)];
    this.data.items.push(item.id);
    if (item.id === 'raid_banner') {
      const goldIdx = SHIP_COLORS.findIndex((c) => c.raid);
      if (goldIdx !== -1 && !this.data.unlockedColors.includes(goldIdx)) this.data.unlockedColors.push(goldIdx);
    }
    this.save();
    return item;
  }

  // aggregate permanent bonuses applied to a new run (meta upgrades + items + skill tree)
  bonuses() {
    const lv = (id) => this.metaLevel(id);
    const has = (id) => this.hasItem(id);
    const b = {
      hp: lv('hp') * 15 + (has('nano_plating') ? 25 : 0),
      shield: lv('shield') * 12 + (has('raid_aegis') ? 15 : 0),
      shieldRegenDelay: lv('shieldRegen') * 0.35,
      shieldRegenMul: has('aegis_loop') ? 1.5 : 1,
      dashCharges: lv('dashCharge') + (has('raid_core') ? 1 : 0),
      dashDmg: (1 + lv('dashDmg') * 0.10) * (has('overdrive_chip') ? 1.15 : 1),
      dashCd: (1 - lv('dashCd') * 0.08) * (has('raid_core') ? 0.9 : 1),
      bossDmg0: has('raid_sigil') ? 0.25 : 0,
      reviveInvuln: has('raid_aegis') ? 5 : 2,
      speed: 1 + lv('speed') * 0.06,
      magnet: 1 + lv('magnet') * 0.30,
      credits: (1 + lv('credits') * 0.12) * (has('golden_router') ? 1.5 : 1),
      xp: 1 + lv('xp') * 0.10,
      rerolls: lv('reroll'),
      revives: (lv('revive') > 0 ? 1 : 0) + (has('backup_core') ? 1 : 0),
      startLevel: has('head_start') ? 3 : 1,
      epicLuck: has('lucky_protocol') ? 2 : 1,
      minigameTime: has('time_dilator') ? 1.25 : 1,
      minigameRubyBonus: has('prism_shard') ? 1 : 0,
      sectorKey: has('sector_key'),
      crit0: 0,
      thorns0: 0,
    };
    // fold in unlocked skill-tree nodes
    for (const node of SKILL_NODES) {
      if (this.hasSkill(node.id)) node.apply(b);
    }
    return b;
  }
}
