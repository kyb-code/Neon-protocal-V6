// upgrades.js — in-run upgrade pool (level-up choices). apply(p) mutates player mods.
// cat: DASH | DEFENSE | MOBILITY | WEAPON | ECONOMY  (shown on cards & in the archive)
import { sample, weightedChoice } from './utils.js';

// rarity weights
const W = { common: 100, rare: 42, epic: 13 };

export const CATEGORIES = {
  DASH:    { name: { en: 'DASH',    ko: '대시' },     color: '#00f0ff' },
  DEFENSE: { name: { en: 'DEFENSE', ko: '방어' },     color: '#4aff8f' },
  MOBILITY:{ name: { en: 'MOBILITY',ko: '기동' },     color: '#ffe94a' },
  WEAPON:  { name: { en: 'WEAPON',  ko: '자동 무기' }, color: '#ff2fd6' },
  ECONOMY: { name: { en: 'ECONOMY', ko: '경제' },     color: '#c084fc' },
};

export const UPGRADES = [
  // ---- DASH OFFENSE ----
  { id: 'dash_dmg', rarity: 'common', icon: '✦', max: 6,
    name: { en: 'Sharpen Vector', ko: '벡터 연마' },
    desc: { en: '+20% dash damage.', ko: '대시 피해 +20%.' },
    apply: (p) => { p.mods.dashDmg += 0.20; } },
  { id: 'dash_width', rarity: 'common', icon: '⬌', max: 4,
    name: { en: 'Wide Wake', ko: '넓은 항적' },
    desc: { en: '+25% dash hit width.', ko: '대시 판정 폭 +25%.' },
    apply: (p) => { p.mods.dashWidth += 0.25; } },
  { id: 'dash_len', rarity: 'common', icon: '⇥', max: 4,
    name: { en: 'Extended Burst', ko: '연장 분사' },
    desc: { en: '+18% dash distance.', ko: '대시 거리 +18%.' },
    apply: (p) => { p.mods.dashLen += 0.18; } },
  { id: 'dash_cd', rarity: 'common', icon: '≫', max: 5,
    name: { en: 'Quick Cycle', ko: '고속 사이클' },
    desc: { en: 'Dash recharges 15% faster.', ko: '대시 재충전 15% 가속.' },
    apply: (p) => { p.mods.dashCd *= 0.85; } },
  { id: 'dash_charge', rarity: 'epic', icon: '⚡', max: 2,
    name: { en: 'Extra Cell', ko: '추가 셀' },
    desc: { en: '+1 dash charge.', ko: '대시 충전 +1.' },
    apply: (p) => { p.maxDashCharges += 1; p.dashCharges += 1; } },
  { id: 'refund', rarity: 'rare', icon: '↺', max: 3,
    name: { en: 'Kill Rebate', ko: '처치 환급' },
    desc: { en: 'Kills refund +20% more dash charge.', ko: '처치 시 대시 충전 환급 +20%.' },
    apply: (p) => { p.mods.killRefund += 0.20; } },
  { id: 'shockwave', rarity: 'rare', icon: '◉', max: 3,
    name: { en: 'Terminal Blast', ko: '터미널 블래스트' },
    desc: { en: 'Dash end releases a shockwave: 32 dmg, radius 95. Each stack: +14 dmg, +25 radius.', ko: '대시 종료 시 충격파 방출: 피해 32, 반경 95. 스택당 피해 +14, 반경 +25.' },
    apply: (p) => { p.mods.endBlast += 1; } },
  { id: 'chain_lightning', rarity: 'epic', icon: '⌁', max: 3,
    name: { en: 'Arc Discharge', ko: '아크 방전' },
    desc: { en: 'Dash kills chain lightning to 1 nearby enemy (45% dash dmg, range 240). Each stack: +1 jump.', ko: '대시 처치 시 주변 적 1기에게 전격 연쇄 (대시 피해의 45%, 사거리 240). 스택당 연쇄 +1.' },
    apply: (p) => { p.mods.arcs += 1; } },
  { id: 'trail_burn', rarity: 'rare', icon: '〜', max: 3,
    name: { en: 'Corrosive Wake', ko: '부식성 항적' },
    desc: { en: 'Dash leaves a burning trail for 1.2s (6 dmg per stack every 0.35s).', ko: '대시 경로에 1.2초간 피해 지대 (0.35초마다 스택당 피해 6).' },
    apply: (p) => { p.mods.trailBurn += 1; } },
  { id: 'crit', rarity: 'rare', icon: '✸', max: 4,
    name: { en: 'Exploit Fault', ko: '취약점 공략' },
    desc: { en: '+12% chance dash hits deal triple damage.', ko: '대시 명중 시 3배 피해 확률 +12%.' },
    apply: (p) => { p.mods.critChance += 0.12; } },
  { id: 'execute', rarity: 'epic', icon: '☠', max: 1,
    name: { en: 'Kill Signal', ko: '킬 시그널' },
    desc: { en: 'Dash instantly purges non-boss enemies below 20% HP.', ko: '대시가 체력 20% 이하의 일반 적을 즉시 정화합니다.' },
    apply: (p) => { p.mods.execute = 0.20; } },
  { id: 'first_strike', rarity: 'rare', icon: '➊', max: 3,
    name: { en: 'Alpha Strike', ko: '알파 스트라이크' },
    desc: { en: 'First enemy hit each dash takes +60% damage.', ko: '대시마다 첫 명중 적에게 +60% 피해.' },
    apply: (p) => { p.mods.firstStrike += 0.60; } },

  // ---- DEFENSE ----
  { id: 'hp_up', rarity: 'common', icon: '♥', max: 5,
    name: { en: 'Patch Integrity', ko: '무결성 패치' },
    desc: { en: '+20 max integrity, restore 20.', ko: '최대 무결성 +20, 즉시 20 회복.' },
    apply: (p) => { p.maxHp += 20; p.hp = Math.min(p.maxHp, p.hp + 20); } },
  { id: 'shield_up', rarity: 'common', icon: '◈', max: 5,
    name: { en: 'Shield Layer', ko: '실드 레이어' },
    desc: { en: '+15 max shield.', ko: '최대 실드 +15.' },
    apply: (p) => { p.maxShield += 15; p.shield = Math.min(p.maxShield, p.shield + 15); } },
  { id: 'shield_delay', rarity: 'common', icon: '↻', max: 4,
    name: { en: 'Hot Reboot', ko: '핫 리부트' },
    desc: { en: 'Shield regen starts 20% sooner.', ko: '실드 재생 대기 20% 단축.' },
    apply: (p) => { p.mods.shieldDelay *= 0.80; } },
  { id: 'shield_rate', rarity: 'common', icon: '⇈', max: 4,
    name: { en: 'Regen Boost', ko: '재생 부스트' },
    desc: { en: 'Shield regenerates 30% faster.', ko: '실드 재생 속도 +30%.' },
    apply: (p) => { p.mods.shieldRate += 0.30; } },
  { id: 'dash_shield', rarity: 'rare', icon: '⛨', max: 3,
    name: { en: 'Kinetic Siphon', ko: '키네틱 사이펀' },
    desc: { en: 'Dash kills restore 3 shield.', ko: '대시 처치 시 실드 3 회복.' },
    apply: (p) => { p.mods.killShield += 3; } },
  { id: 'lifesteal', rarity: 'epic', icon: '❥', max: 2,
    name: { en: 'Leech Protocol', ko: '리치 프로토콜' },
    desc: { en: 'Dash kills have 15% chance to restore 3 integrity.', ko: '대시 처치 시 15% 확률로 무결성 3 회복.' },
    apply: (p) => { p.mods.lifesteal += 0.15; } },
  { id: 'iframes', rarity: 'rare', icon: '◌', max: 3,
    name: { en: 'Ghost Frames', ko: '고스트 프레임' },
    desc: { en: '+30% invulnerability duration after being hit.', ko: '피격 후 무적 시간 +30%.' },
    apply: (p) => { p.mods.iframes += 0.30; } },
  { id: 'thorns', rarity: 'rare', icon: '✴', max: 3,
    name: { en: 'Static Field', ko: '스태틱 필드' },
    desc: { en: 'Taking a hit triggers a retaliation nova: 20 dmg per stack, radius 120+.', ko: '피격 시 보복 노바 발동: 스택당 피해 20, 반경 120+.' },
    apply: (p) => { p.mods.thorns += 1; } },
  { id: 'shield_blast', rarity: 'epic', icon: '❂', max: 1,
    name: { en: 'Overload Vent', ko: '과부하 배출' },
    desc: { en: 'When your shield breaks, unleash a massive nova.', ko: '실드가 깨질 때 대형 노바를 방출합니다.' },
    apply: (p) => { p.mods.shieldBlast = 1; } },

  // ---- MOBILITY / UTILITY ----
  { id: 'speed_up', rarity: 'common', icon: '➤', max: 4,
    name: { en: 'Thread Priority', ko: '스레드 우선권' },
    desc: { en: '+10% move speed.', ko: '이동 속도 +10%.' },
    apply: (p) => { p.mods.speed += 0.10; } },
  { id: 'magnet_up', rarity: 'common', icon: '◎', max: 4,
    name: { en: 'Wide Collector', ko: '광역 수집기' },
    desc: { en: '+40% pickup radius.', ko: '획득 반경 +40%.' },
    apply: (p) => { p.mods.magnet += 0.40; } },
  { id: 'xp_up', rarity: 'common', icon: '▲', max: 4,
    name: { en: 'Compression', ko: '압축 알고리즘' },
    desc: { en: '+15% data shard value.', ko: '데이터 조각 가치 +15%.' },
    apply: (p) => { p.mods.xpGain += 0.15; } },
  { id: 'greed', rarity: 'rare', icon: '⬡', max: 3,
    name: { en: 'Skim Routine', ko: '스킴 루틴' },
    desc: { en: '+20% credits from all sources.', ko: '모든 크레딧 획득 +20%.' },
    apply: (p) => { p.mods.creditGain += 0.20; } },
  { id: 'slow_field', rarity: 'epic', icon: '❄', max: 2,
    name: { en: 'Lag Aura', ko: '랙 오라' },
    desc: { en: 'Nearby enemies move 18% slower.', ko: '주변 적 이동 속도 -18%.' },
    apply: (p) => { p.mods.slowAura += 0.18; } },

  // ---- AUTOMATED WEAPONS ----
  { id: 'turret', rarity: 'epic', icon: '✚', max: 3,
    name: { en: 'Sentry Daemon', ko: '센트리 데몬' },
    desc: { en: 'An orbiting drone auto-fires at the nearest enemy (12 dmg, scales with dash dmg).', ko: '궤도 드론이 최근접 적을 자동 사격 (피해 12, 대시 피해 비례).' },
    apply: (p) => { p.mods.drones += 1; } },
  { id: 'orbitals', rarity: 'rare', icon: '❍', max: 3,
    name: { en: 'Orbit Shards', ko: '궤도 파편' },
    desc: { en: '2 shards orbit you — 8 dmg on touch, every 0.25s.', ko: '파편 2개가 주위를 돌며 접촉 시 0.25초마다 피해 8.' },
    apply: (p) => { p.mods.orbitals += 2; } },
  { id: 'seeker', rarity: 'rare', icon: '➶', max: 3,
    name: { en: 'Hunter Packet', ko: '헌터 패킷' },
    desc: { en: 'Dash kills launch 1 homing missile per stack (14 dmg).', ko: '대시 처치 시 스택당 유도 미사일 1발 (피해 14).' },
    apply: (p) => { p.mods.seekers += 1; } },
  { id: 'pulse', rarity: 'rare', icon: '◍', max: 3,
    name: { en: 'Heartbeat Pulse', ko: '하트비트 펄스' },
    desc: { en: 'Every 4s, emit a pulse: 26 dmg + 10 per stack, radius 150+.', ko: '4초마다 펄스 방출: 피해 26 + 스택당 10, 반경 150+.' },
    apply: (p) => { p.mods.pulse += 1; } },

  // ---- ECONOMY / SPECIAL ----
  { id: 'shard_bomb', rarity: 'rare', icon: '❖', max: 2,
    name: { en: 'Volatile Data', ko: '휘발성 데이터' },
    desc: { en: '10% chance per stack that collected shards explode (18 dmg, radius 80).', ko: '조각 획득 시 스택당 10% 확률로 폭발 (피해 18, 반경 80).' },
    apply: (p) => { p.mods.shardBomb += 0.10; } },
  { id: 'adrenaline', rarity: 'rare', icon: '⚠', max: 2,
    name: { en: 'Panic Overclock', ko: '패닉 오버클럭' },
    desc: { en: 'Below 30% integrity: +25% speed and dash recharge.', ko: '무결성 30% 이하: 속도·대시 재충전 +25%.' },
    apply: (p) => { p.mods.adrenaline += 0.25; } },
  { id: 'boss_dmg', rarity: 'rare', icon: '⌖', max: 3,
    name: { en: 'Admin Exploit', ko: '어드민 익스플로잇' },
    desc: { en: '+20% damage to guardians and elites.', ko: '수호자·엘리트에게 피해 +20%.' },
    apply: (p) => { p.mods.bossDmg += 0.20; } },

  // ---- EXPANSION SET ----
  { id: 'momentum', rarity: 'common', icon: '↟', max: 3,
    name: { en: 'Momentum Cache', ko: '모멘텀 캐시' },
    desc: { en: 'Kills grant +3% move speed for 5s per stack, up to 5 buffs.', ko: '처치 시 5초간 스택당 이동 속도 +3% (최대 5중첩).' },
    apply: (p) => { p.mods.momentum += 0.03; } },
  { id: 'glass_cannon', rarity: 'epic', icon: '◬', max: 1,
    name: { en: 'Glass Cannon', ko: '글래스 캐논' },
    desc: { en: '+50% dash damage, but −25 max integrity.', ko: '대시 피해 +50%, 대신 최대 무결성 −25.' },
    apply: (p) => { p.mods.dashDmg += 0.50; p.maxHp = Math.max(30, p.maxHp - 25); p.hp = Math.min(p.hp, p.maxHp); } },
  { id: 'blast_radius', rarity: 'common', icon: '⊚', max: 3,
    name: { en: 'Wide Detonation', ko: '광역 기폭' },
    desc: { en: 'All your explosions and novas: +20% radius per stack.', ko: '모든 폭발·노바 반경 스택당 +20%.' },
    apply: (p) => { p.mods.blastRadius += 0.20; } },
  { id: 'crit_dmg', rarity: 'rare', icon: '✷', max: 2,
    name: { en: 'Focus Lens', ko: '포커스 렌즈' },
    desc: { en: 'Critical hits deal ×4 instead of ×3 (then ×5).', ko: '치명타 배율 ×3 → ×4 (다음 스택 ×5).' },
    apply: (p) => { p.mods.critMult += 1; } },
  { id: 'second_wind', rarity: 'rare', icon: '⟲', max: 1,
    name: { en: 'Second Wind', ko: '세컨드 윈드' },
    desc: { en: 'When your shield breaks, all dash charges instantly refill.', ko: '실드가 깨질 때 대시 충전이 즉시 모두 회복됩니다.' },
    apply: (p) => { p.mods.secondWind = 1; } },
  { id: 'shard_credit', rarity: 'common', icon: '⬢', max: 3,
    name: { en: 'Data Miner', ko: '데이터 마이너' },
    desc: { en: '12% chance per stack that shards also drop 1 coin.', ko: '조각 획득 시 스택당 12% 확률로 코인 1 추가.' },
    apply: (p) => { p.mods.shardCredit += 0.12; } },
  { id: 'bullet_eater', rarity: 'rare', icon: '◑', max: 2,
    name: { en: 'Null Buffer', ko: '널 버퍼' },
    desc: { en: 'Each bullet destroyed by your dash restores 1 shield per stack.', ko: '대시로 파괴한 탄환 1개당 스택당 실드 1 회복.' },
    apply: (p) => { p.mods.bulletEater += 1; } },
  { id: 'long_combo', rarity: 'common', icon: '∞', max: 2,
    name: { en: 'Chain Buffer', ko: '체인 버퍼' },
    desc: { en: 'Combo lasts +1.5s per stack. Combo XP bonus doubled.', ko: '연쇄 유지시간 스택당 +1.5초, 연쇄 XP 보너스 2배.' },
    apply: (p) => { p.mods.comboTime += 1.5; p.mods.comboXp += 0.02; } },
  { id: 'stabilizer', rarity: 'common', icon: '⌗', max: 2,
    name: { en: 'Surge Protector', ko: '서지 프로텍터' },
    desc: { en: 'Damage from mines, lasers and hazards −30% per stack.', ko: '기뢰·레이저·환경 피해 스택당 −30%.' },
    apply: (p) => { p.mods.hazardResist += 0.30; } },
  { id: 'deflector', rarity: 'epic', icon: '⛊', max: 1,
    name: { en: 'Deflector Array', ko: '디플렉터 어레이' },
    desc: { en: 'Every 8s, automatically negate one hit completely.', ko: '8초마다 피격 1회를 완전히 무효화합니다.' },
    apply: (p) => { p.mods.deflector = 8; } },
  { id: 'level_nova', rarity: 'rare', icon: '✺', max: 2,
    name: { en: 'Growth Spike', ko: '그로스 스파이크' },
    desc: { en: 'Leveling up detonates a nova: 60 dmg per stack, radius 200.', ko: '레벨업 시 노바 폭발: 스택당 피해 60, 반경 200.' },
    apply: (p) => { p.mods.levelNova += 1; } },
  { id: 'drone_rate', rarity: 'common', icon: '✛', max: 3,
    name: { en: 'Rapid Sentry', ko: '래피드 센트리' },
    desc: { en: 'Sentry drones fire 25% faster per stack.', ko: '센트리 드론 발사 속도 스택당 +25%.' },
    apply: (p) => { p.mods.droneRate += 0.25; } },
  { id: 'orbit_speed', rarity: 'common', icon: '❂', max: 2,
    name: { en: 'Spin Cycle', ko: '스핀 사이클' },
    desc: { en: 'Orbit shards spin 40% faster and hit a wider area per stack.', ko: '궤도 파편 회전 속도 +40%, 판정 확대 (스택당).' },
    apply: (p) => { p.mods.orbitSpeed += 0.40; } },
];

// category assignment (used on cards and in the Protocol Archive)
const CAT_MAP = {
  dash_dmg: 'DASH', dash_width: 'DASH', dash_len: 'DASH', dash_cd: 'DASH', dash_charge: 'DASH',
  refund: 'DASH', shockwave: 'DASH', chain_lightning: 'DASH', trail_burn: 'DASH', crit: 'DASH',
  execute: 'DASH', first_strike: 'DASH', glass_cannon: 'DASH', blast_radius: 'DASH', crit_dmg: 'DASH',
  hp_up: 'DEFENSE', shield_up: 'DEFENSE', shield_delay: 'DEFENSE', shield_rate: 'DEFENSE',
  dash_shield: 'DEFENSE', lifesteal: 'DEFENSE', iframes: 'DEFENSE', thorns: 'DEFENSE',
  shield_blast: 'DEFENSE', second_wind: 'DEFENSE', bullet_eater: 'DEFENSE', stabilizer: 'DEFENSE', deflector: 'DEFENSE',
  speed_up: 'MOBILITY', magnet_up: 'MOBILITY', slow_field: 'MOBILITY', momentum: 'MOBILITY', adrenaline: 'MOBILITY',
  turret: 'WEAPON', orbitals: 'WEAPON', seeker: 'WEAPON', pulse: 'WEAPON',
  level_nova: 'WEAPON', drone_rate: 'WEAPON', orbit_speed: 'WEAPON',
  xp_up: 'ECONOMY', greed: 'ECONOMY', shard_bomb: 'ECONOMY', boss_dmg: 'ECONOMY',
  shard_credit: 'ECONOMY', long_combo: 'ECONOMY',
};
for (const u of UPGRADES) u.cat = CAT_MAP[u.id] || 'DASH';

// roll n choices; excludes maxed-out upgrades. epicLuck multiplies epic weight.
export function rollUpgrades(player, n = 3) {
  const epicLuck = (player.metaBonus && player.metaBonus.epicLuck) || 1;
  const pool = UPGRADES.filter((u) => (player.upgradeCounts[u.id] || 0) < u.max);
  if (pool.length <= n) return pool.slice();
  const out = [];
  const remaining = pool.slice();
  while (out.length < n && remaining.length > 0) {
    const pick = weightedChoice(remaining, (u) => W[u.rarity] * (u.rarity === 'epic' ? epicLuck : 1));
    out.push(pick);
    remaining.splice(remaining.indexOf(pick), 1);
  }
  return out;
}

export function rollEpic(player) {
  const pool = UPGRADES.filter((u) => u.rarity === 'epic' && (player.upgradeCounts[u.id] || 0) < u.max);
  if (pool.length === 0) return rollUpgrades(player, 1)[0] || null;
  return sample(pool, 1)[0];
}
