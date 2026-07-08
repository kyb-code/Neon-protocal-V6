// skilltree.js — branching permanent skill tree (bought with coins, prerequisites).
// Each node's apply(b) mutates the run-bonus object built in meta.bonuses().
// Three branches × tiers; deeper nodes require their parent(s).

export const SKILL_BRANCHES = {
  offense: { name: { en: 'OFFENSE', ko: '공격' }, color: '#ff3b5c' },
  defense: { name: { en: 'DEFENSE', ko: '방어' }, color: '#4aff8f' },
  utility: { name: { en: 'UTILITY', ko: '유틸리티' }, color: '#c084fc' },
};

// tier = row (0-based). requires = node ids that must be owned first.
export const SKILL_NODES = [
  // ---------------- OFFENSE ----------------
  { id: 'o_edge1', branch: 'offense', tier: 0, cost: 60, icon: '✦', requires: [],
    name: { en: 'Honed Edge I', ko: '연마된 칼날 I' },
    desc: { en: '+8% dash damage.', ko: '대시 피해 +8%.' },
    apply: (b) => { b.dashDmg *= 1.08; } },
  { id: 'o_edge2', branch: 'offense', tier: 1, cost: 130, icon: '✦', requires: ['o_edge1'],
    name: { en: 'Honed Edge II', ko: '연마된 칼날 II' },
    desc: { en: '+12% dash damage.', ko: '대시 피해 +12%.' },
    apply: (b) => { b.dashDmg *= 1.12; } },
  { id: 'o_crit', branch: 'offense', tier: 1, cost: 150, icon: '✸', requires: ['o_edge1'],
    name: { en: 'Exploit Coder', ko: '취약점 코더' },
    desc: { en: 'Start every run with +10% crit chance.', ko: '매 런을 치명타 확률 +10%로 시작.' },
    apply: (b) => { b.crit0 = (b.crit0 || 0) + 0.10; } },
  { id: 'o_slayer', branch: 'offense', tier: 2, cost: 220, icon: '⌖', requires: ['o_edge2'],
    name: { en: 'Giant Slayer', ko: '자이언트 슬레이어' },
    desc: { en: '+20% damage to guardians & elites.', ko: '수호자·엘리트에게 피해 +20%.' },
    apply: (b) => { b.bossDmg0 = (b.bossDmg0 || 0) + 0.20; } },
  { id: 'o_cell', branch: 'offense', tier: 3, cost: 380, icon: '⚡', requires: ['o_slayer', 'o_crit'],
    name: { en: 'Overcharged Cell', ko: '과충전 셀' },
    desc: { en: '+1 dash charge, permanently.', ko: '대시 충전 영구 +1.' },
    apply: (b) => { b.dashCharges += 1; } },

  // ---------------- DEFENSE ----------------
  { id: 'd_hull1', branch: 'defense', tier: 0, cost: 60, icon: '♥', requires: [],
    name: { en: 'Plated Hull I', ko: '장갑 선체 I' },
    desc: { en: '+20 max integrity.', ko: '최대 무결성 +20.' },
    apply: (b) => { b.hp += 20; } },
  { id: 'd_shield1', branch: 'defense', tier: 1, cost: 130, icon: '◈', requires: ['d_hull1'],
    name: { en: 'Capacitor Bank', ko: '축전지 뱅크' },
    desc: { en: '+18 max shield.', ko: '최대 실드 +18.' },
    apply: (b) => { b.shield += 18; } },
  { id: 'd_regen', branch: 'defense', tier: 1, cost: 150, icon: '↻', requires: ['d_hull1'],
    name: { en: 'Coolant Loop', ko: '냉각 루프' },
    desc: { en: 'Shield regenerates 35% faster.', ko: '실드 재생 속도 +35%.' },
    apply: (b) => { b.shieldRegenMul = (b.shieldRegenMul || 1) * 1.35; } },
  { id: 'd_thorns', branch: 'defense', tier: 2, cost: 220, icon: '✴', requires: ['d_shield1'],
    name: { en: 'Reactive Plating', ko: '반응 장갑' },
    desc: { en: 'Start runs with a retaliation nova on hit.', ko: '피격 시 보복 노바를 지닌 채 시작합니다.' },
    apply: (b) => { b.thorns0 = (b.thorns0 || 0) + 1; } },
  { id: 'd_revive', branch: 'defense', tier: 3, cost: 400, icon: '✚', requires: ['d_thorns', 'd_regen'],
    name: { en: 'Failover Instance', ko: '페일오버 인스턴스' },
    desc: { en: '+1 revive per run (survive a fatal hit).', ko: '런당 부활 +1 (치명상 1회 생존).' },
    apply: (b) => { b.revives = (b.revives || 0) + 1; } },

  // ---------------- UTILITY ----------------
  { id: 'u_speed1', branch: 'utility', tier: 0, cost: 60, icon: '➤', requires: [],
    name: { en: 'Light Frame', ko: '경량 프레임' },
    desc: { en: '+8% move speed.', ko: '이동 속도 +8%.' },
    apply: (b) => { b.speed *= 1.08; } },
  { id: 'u_magnet', branch: 'utility', tier: 1, cost: 120, icon: '◎', requires: ['u_speed1'],
    name: { en: 'Wide Collector', ko: '광역 수집기' },
    desc: { en: '+40% pickup radius.', ko: '획득 반경 +40%.' },
    apply: (b) => { b.magnet *= 1.40; } },
  { id: 'u_greed', branch: 'utility', tier: 1, cost: 150, icon: '⬡', requires: ['u_speed1'],
    name: { en: 'Skimmer', ko: '스키머' },
    desc: { en: '+15% coins earned.', ko: '코인 획득 +15%.' },
    apply: (b) => { b.credits *= 1.15; } },
  { id: 'u_learn', branch: 'utility', tier: 2, cost: 220, icon: '▲', requires: ['u_magnet'],
    name: { en: 'Fast Learner', ko: '속성 학습' },
    desc: { en: '+15% XP, and +1 upgrade reroll.', ko: 'XP +15%, 업그레이드 리롤 +1.' },
    apply: (b) => { b.xp *= 1.15; b.rerolls += 1; } },
  { id: 'u_boot', branch: 'utility', tier: 3, cost: 360, icon: '⏻', requires: ['u_learn', 'u_greed'],
    name: { en: 'Warm Boot', ko: '웜 부트' },
    desc: { en: 'Start every run at level 2.', ko: '매 런을 레벨 2로 시작.' },
    apply: (b) => { b.startLevel = Math.max(b.startLevel || 1, 2); } },
];

export function nodeState(meta, node) {
  if (meta.hasSkill(node.id)) return 'owned';
  const prereqMet = node.requires.every((r) => meta.hasSkill(r));
  if (!prereqMet) return 'locked';
  return meta.data.credits >= node.cost ? 'available' : 'poor';
}
