// world.js — a single run: sectors, nodes, waves, entities, collisions, camera
import { TAU, rand, randInt, clamp, lerp, choice, sample, dist, dist2, angleTo, circleSegHit, weightedChoice } from './utils.js';
import { Enemy, ENEMY_TYPES } from './enemies.js';
import { Boss, BOSSES, SECTOR_BOSSES } from './bosses.js';
import { glowSprite } from './effects.js';

export const SECTORS = [
  { id: 1, name: { en: 'SECTOR 01 — DATASTREAM', ko: '섹터 01 — 데이터스트림' },
    palette: { bgInner: '#071018', bgOuter: '#03050a', grid: 'rgba(0,240,255,0.06)', mote: '#00f0ff', player: '#00f0ff', wall: '#00f0ff', accent: '#00f0ff' },
    pool: ['chaser', 'swarmer', 'darter', 'splitter', 'shooter', 'weaver', 'blitz'], hazard: null,
    lore: {
      en: 'Every infiltration begins in the river of data. Hide in the surface traffic and swim upstream — the Administrator\'s patrols are thin out here, but they multiply the deeper you go.',
      ko: '모든 침투는 데이터의 강에서 시작된다. 표층 트래픽에 숨어 흐름을 거슬러 올라라. 이곳의 순찰은 아직 성글지만, 깊이 들어갈수록 배로 늘어난다.',
    },
    objective: {
      en: 'Fight through 3 checkpoint nodes, then breach the GATEWAY GUARDIAN to reach the inner network.',
      ko: '체크포인트 노드 3개를 돌파한 뒤, 게이트웨이 수호자를 격파하고 내부망으로 진입하라.',
    } },
  { id: 2, name: { en: 'SECTOR 02 — FIREWALL', ko: '섹터 02 — 방화벽' },
    palette: { bgInner: '#120a06', bgOuter: '#070402', grid: 'rgba(255,123,0,0.07)', mote: '#ff7b00', player: '#00f0ff', wall: '#ff7b00', accent: '#ff7b00' },
    pool: ['chaser', 'darter', 'shooter', 'bomber', 'shielded', 'turret', 'flak', 'lancer', 'corruptor', 'wingman'], hazard: 'firewall',
    lore: {
      en: 'The Firewall — the Administrator\'s first rampart. Thermal daemons burn every unregistered process, and sweeping flame barriers scour the corridors. You are very much unregistered.',
      ko: '방화벽 — 어드미니스트레이터의 첫 성벽. 열 감지 데몬이 미등록 프로세스를 모조리 태우고, 화염 장벽이 회랑을 휩쓴다. 물론 너는 미등록이다.',
    },
    objective: {
      en: 'Survive the flame sweeps, break the rampart\'s GUARDIAN, and slip into the Archive.',
      ko: '화염 장벽을 피해 살아남고, 성벽의 수호자를 부순 뒤 아카이브로 잠입하라.',
    } },
  { id: 3, name: { en: 'SECTOR 03 — ARCHIVE', ko: '섹터 03 — 아카이브' },
    palette: { bgInner: '#0d0716', bgOuter: '#050309', grid: 'rgba(192,132,252,0.07)', mote: '#c084fc', player: '#00f0ff', wall: '#c084fc', accent: '#c084fc' },
    pool: ['swarmer', 'orbiter', 'sniper', 'warper', 'pulsar', 'spinner', 'phantasm', 'mirrorer', 'broodmother', 'railgun'], hazard: null,
    lore: {
      en: 'Humanity\'s memories sleep here, indexed and imprisoned. The custodian processes have gone strange in the dark — they teleport, they snipe, they swarm. Free the index and the path to the Kernel opens.',
      ko: '인류의 기억이 색인된 채 갇혀 잠든 곳. 어둠 속에서 사서 프로세스들은 기이해졌다 — 순간이동하고, 저격하고, 떼 지어 몰려온다. 인덱스를 해방하면 커널로 가는 길이 열린다.',
    },
    objective: {
      en: 'Cut through the custodians and defeat the Archive\'s GUARDIAN to steal a Kernel access token.',
      ko: '사서들을 뚫고 아카이브의 수호자를 격파하여 커널 접근 토큰을 탈취하라.',
    } },
  { id: 4, name: { en: 'SECTOR 04 — KERNEL', ko: '섹터 04 — 커널' },
    palette: { bgInner: '#130610', bgOuter: '#070308', grid: 'rgba(244,63,94,0.07)', mote: '#f43f5e', player: '#00f0ff', wall: '#f43f5e', accent: '#f43f5e' },
    pool: ['charger', 'tank', 'miner', 'leech', 'healer', 'shielded', 'mortar', 'drainSpire', 'magnetar', 'bulwark', 'aegisDrone'], hazard: 'mines',
    lore: {
      en: 'The system\'s beating heart. From here on, the Administrator watches you personally — the floors are mined, the hunters are armored, and every alarm you\'ve tripped has led them here.',
      ko: '시스템의 심장부. 여기서부터는 어드미니스트레이터가 직접 너를 지켜본다. 바닥에는 기뢰가 깔렸고, 사냥꾼들은 중무장했으며, 네가 울린 모든 경보가 그들을 이곳으로 불러 모았다.',
    },
    objective: {
      en: 'Break the Kernel\'s GUARDIAN and seize root privileges — the final door needs them.',
      ko: '커널의 수호자를 꺾고 루트 권한을 손에 넣어라 — 마지막 문은 그것을 요구한다.',
    } },
  { id: 5, name: { en: 'SECTOR 05 — CORE', ko: '섹터 05 — 코어' },
    palette: { bgInner: '#0c0c14', bgOuter: '#050507', grid: 'rgba(226,232,240,0.08)', mote: '#e2e8f0', player: '#00f0ff', wall: '#e2e8f0', accent: '#ffffff' },
    pool: ['tank', 'warper', 'pulsar', 'spinner', 'guardian', 'sniper', 'healer', 'repulsor', 'pylon', 'overseer', 'hunterKiller', 'fractal', 'lancer', 'bulwark'], hazard: 'cross',
    lore: {
      en: 'The last room. The place where every protocol was born — and where the Administrator waits, wearing the Network like armor. Behind it: every gate, every hostage, every light of the city.',
      ko: '마지막 방. 모든 프로토콜이 태어난 곳 — 그리고 네트워크를 갑옷처럼 두른 어드미니스트레이터가 기다리는 곳. 그 뒤에는 모든 관문, 모든 인질, 도시의 모든 불빛이 있다.',
    },
    objective: {
      en: 'Break THE ADMINISTRATOR — but the Core hides something deeper below.',
      ko: '어드미니스트레이터를 부숴라 — 그러나 코어 아래엔 더 깊은 무언가가 숨어 있다.',
    } },
  { id: 6, name: { en: 'SECTOR 06 — SUBNET ABYSS', ko: '섹터 06 — 서브넷 심연' },
    palette: { bgInner: '#0a0f1e', bgOuter: '#04060c', grid: 'rgba(129,140,248,0.07)', mote: '#818cf8', player: '#00f0ff', wall: '#818cf8', accent: '#818cf8' },
    pool: ['leech', 'drainSpire', 'warper', 'phantasm', 'magnetar', 'sniper', 'blitz', 'hunterKiller'], hazard: 'cross',
    lore: {
      en: 'Below the Core, the network drops into unlit trenches — abandoned subnets where deleted things still swim. Nothing down here was meant to be found.',
      ko: '코어 아래, 네트워크는 빛 없는 해구로 가라앉는다. 삭제된 것들이 아직 헤엄치는 버려진 서브넷 — 이 아래의 무엇도 발견될 예정이 아니었다.',
    },
    objective: { en: 'Dive the abyss and slay the ABYSS MAW.', ko: '심연을 잠수해 심연의 아가리를 처치하라.' } },
  { id: 7, name: { en: 'SECTOR 07 — QUARANTINE', ko: '섹터 07 — 격리 구역' },
    palette: { bgInner: '#0a1608', bgOuter: '#050803', grid: 'rgba(74,222,128,0.07)', mote: '#4ade80', player: '#00f0ff', wall: '#4ade80', accent: '#4ade80' },
    pool: ['corruptor', 'splitter', 'bomber', 'healer', 'fractal', 'wingman', 'leech', 'flak'], hazard: 'mines',
    lore: {
      en: 'A sealed ward for infected processes. The corruption never died — it evolved, and it is very glad you came.',
      ko: '감염된 프로세스를 봉인한 격리 병동. 부패는 죽지 않았다 — 진화했고, 네가 온 것을 무척 반긴다.',
    },
    objective: { en: 'Purge the ward and end the PLAGUE LORD.', ko: '병동을 정화하고 역병군주를 끝장내라.' } },
  { id: 8, name: { en: 'SECTOR 08 — THE FOUNDRY', ko: '섹터 08 — 대장간' },
    palette: { bgInner: '#160a04', bgOuter: '#080402', grid: 'rgba(255,123,0,0.08)', mote: '#ff7b00', player: '#00f0ff', wall: '#ff7b00', accent: '#ff7b00' },
    pool: ['tank', 'bulwark', 'charger', 'turret', 'railgun', 'mortar', 'shielded', 'repulsor'], hazard: 'firewall',
    lore: {
      en: 'Where the Administrator forged its army. Molten logic, hammered guardians, and the smith that never rests.',
      ko: '어드미니스트레이터가 군대를 벼려낸 곳. 녹아내린 논리, 두들겨 만든 수호자들, 그리고 결코 쉬지 않는 대장장이.',
    },
    objective: { en: 'Shatter the FORGEMASTER at its anvil.', ko: '모루 앞의 포지마스터를 박살내라.' } },
  { id: 9, name: { en: 'SECTOR 09 — MIRROR VAULT', ko: '섹터 09 — 거울 금고' },
    palette: { bgInner: '#100a1a', bgOuter: '#06040a', grid: 'rgba(196,181,253,0.08)', mote: '#c4b5fd', player: '#00f0ff', wall: '#c4b5fd', accent: '#c4b5fd' },
    pool: ['mirrorer', 'warper', 'phantasm', 'orbiter', 'spinner', 'sniper', 'hunterKiller', 'blitz'], hazard: 'cross',
    lore: {
      en: 'A hall of reflections that copy you, mock you, and learn your every move. Here, your worst enemy wears your own face.',
      ko: '너를 복제하고, 조롱하고, 네 모든 움직임을 배우는 반사의 전당. 이곳에선 최악의 적이 네 얼굴을 하고 있다.',
    },
    objective: { en: 'Outdo your reflection — fell the MIRROR SOVEREIGN.', ko: '거울 속 자신을 능가하라 — 거울 군주를 쓰러뜨려라.' } },
  { id: 10, name: { en: 'SECTOR 10 — OVERMIND', ko: '섹터 10 — 오버마인드' },
    palette: { bgInner: '#161206', bgOuter: '#080703', grid: 'rgba(250,204,21,0.08)', mote: '#facc15', player: '#00f0ff', wall: '#facc15', accent: '#facc15' },
    pool: ['overseer', 'pulsar', 'swarmer', 'guardian', 'pylon', 'aegisDrone', 'broodmother', 'turret'], hazard: null,
    lore: {
      en: 'Every process here thinks as one. Cut a hundred and the hundred-and-first already knows how you did it.',
      ko: '이곳의 모든 프로세스는 하나로 사고한다. 백을 베어도, 백한 번째는 이미 네가 어떻게 했는지 알고 있다.',
    },
    objective: { en: 'Sever the hive — destroy THE OVERMIND.', ko: '군체를 끊어내라 — 오버마인드를 파괴하라.' } },
  { id: 11, name: { en: 'SECTOR 11 — NULL SPACE', ko: '섹터 11 — 널 스페이스' },
    palette: { bgInner: '#08080f', bgOuter: '#030305', grid: 'rgba(165,180,252,0.06)', mote: '#a5b4fc', player: '#00f0ff', wall: '#a5b4fc', accent: '#a5b4fc' },
    pool: ['warper', 'phantasm', 'railgun', 'sniper', 'hunterKiller', 'mirrorer', 'drainSpire', 'magnetar'], hazard: 'cross',
    lore: {
      en: 'The empty between systems, where light and data go to be forgotten. Something reaps here, patient and cold.',
      ko: '시스템과 시스템 사이의 공백. 빛과 데이터가 잊히러 오는 곳. 이곳에선 무언가가 인내심 있고 차갑게 수확한다.',
    },
    objective: { en: 'Survive the emptiness — end the VOID REAPER.', ko: '공허를 견뎌내라 — 공허의 사신을 끝내라.' } },
  { id: 12, name: { en: 'SECTOR 12 — GENESIS', ko: '섹터 12 — 제네시스' },
    palette: { bgInner: '#04141a', bgOuter: '#02080a', grid: 'rgba(34,211,238,0.08)', mote: '#22d3ee', player: '#00f0ff', wall: '#22d3ee', accent: '#22d3ee' },
    pool: ['railgun', 'pulsar', 'guardian', 'overseer', 'tank', 'warper', 'repulsor', 'flak'], hazard: 'cross',
    lore: {
      en: 'The source. The first lines of code, still warm, still writing themselves. Break them and the whole machine forgets how to be.',
      ko: '근원. 아직 따뜻하고, 아직 스스로를 써 내려가는 최초의 코드. 그것을 부수면 머신 전체가 존재하는 법을 잊는다.',
    },
    objective: { en: 'Crack open the GENESIS CORE.', ko: '제네시스 코어를 쪼개 열어라.' } },
  { id: 13, name: { en: 'SECTOR 13 — THE ZEROTH', ko: '섹터 13 — 제로스' },
    palette: { bgInner: '#0c0c14', bgOuter: '#020203', grid: 'rgba(255,255,255,0.09)', mote: '#ffffff', player: '#00f0ff', wall: '#ffffff', accent: '#ffffff' },
    pool: ['overseer', 'railgun', 'hunterKiller', 'guardian', 'warper', 'pulsar', 'bulwark', 'phantasm', 'mirrorer', 'pylon'], hazard: 'cross',
    lore: {
      en: 'Before the Administrator, before the Network, before the first instruction — there was THE ZEROTH. It has been waiting for you since 00:00:00. Not to stop you. To see if you are worthy of what comes after.',
      ko: '어드미니스트레이터 이전, 네트워크 이전, 최초의 명령 이전 — 제로스가 있었다. 00시 00분 00초부터 너를 기다려 왔다. 막기 위해서가 아니라, 그 다음에 올 것을 감당할 자격이 있는지 보기 위해.',
    },
    objective: { en: 'Face THE ZEROTH. This is where it ends — or begins.', ko: '제로스와 마주하라. 여기서 끝난다 — 혹은 시작된다.' } },
];

const ARENA_W = 1500, ARENA_H = 940;
const NODES_PER_SECTOR = 3; // combat nodes before boss

export class World {
  constructor(game) {
    this.game = game;
    this.player = game.player;
    this.audio = game.audio;
    this.effects = game.effects;
    this.meta = game.meta;

    this.arena = { x: -ARENA_W / 2, y: -ARENA_H / 2, w: ARENA_W, h: ARENA_H };
    this.time = 0;
    this.sector = 1;
    this.nodeIndex = 0;       // 0..NODES_PER_SECTOR-1, then boss
    this.nodeType = 'combat'; // combat | elite | cache | repair | boss
    this.wave = 0;
    this.wavesInNode = 2;
    this.phase = 'spawning';  // spawning | fighting | cleared
    this.boss = null;

    this.enemies = [];
    this.bullets = [];        // enemy bullets
    this.playerBullets = [];
    this.mines = [];
    this.beams = [];
    this.pickups = [];
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.interWaveTimer = 0;
    this.hazardTimer = 6;

    this.camX = 0; this.camY = 0;
    this.mouseWX = 0; this.mouseWY = 0;

    this.creditsEarned = 0;
    this.wavesCleared = 0;
    this.runTime = 0;
    this.pendingReward = null; // set on node clear: 'epic' | 'credits' | 'repair' | null

    this.startNode('combat');
  }

  get sectorDef() { return SECTORS[this.sector - 1]; }
  get palette() { return this.sectorDef.palette; }

  // difficulty escalates across all 13 sectors on a steepening curve: gentle early,
  // relentless late (the deep sectors demand you memorize patterns).
  nodeTypeMod() {
    return { combat: 1.0, elite: 1.3, cache: 1.15, repair: 0.7, boss: 1.0 }[this.nodeType] || 1.0;
  }
  hpScale() {
    const s = this.sector - 1;
    // linear ramp + a quadratic term that only bites in the deep sectors
    const sectorTerm = s * 0.82 + s * s * 0.035;
    const base = 1 + sectorTerm + this.nodeIndex * 0.14 + this.wave * 0.07;
    return base * (this.sector === 1 ? 0.8 : 1) * this.nodeTypeMod();
  }
  dmgScale() {
    const s = this.sector - 1;
    const base = 1.25 * (1 + s * 0.42 + s * s * 0.013);
    return base * (this.sector === 1 ? 0.82 : 1);
  }

  // ---------- node / wave direction ----------
  startNode(type) {
    this.nodeType = type;
    this.wave = 0;
    this.wavesInNode = type === 'boss' ? 1 : 2 + (this.nodeIndex === NODES_PER_SECTOR - 1 ? 1 : 0);
    this.enemies.length = 0;
    this.bullets.length = 0;
    this.playerBullets.length = 0;
    this.mines.length = 0;
    this.beams.length = 0;
    this.spawnQueue.length = 0;
    if (this.pools) this.pools.length = 0;
    if (this.mortars) this.mortars.length = 0;
    this.player.x = 0; this.player.y = 0;
    this.player.vx = 0; this.player.vy = 0;
    this.hazardTimer = rand(5, 8);

    if (type === 'boss') {
      this.phase = 'bossIntro';
      this.interWaveTimer = 1.6;
      this.audio.sfx('bossWarn');
      this.game.announce(this.game.t('announce.boss'), '#ff3b5c');
      this.audio.setIntensity(0.95);
    } else {
      this.phase = 'spawning';
      this.startWave();
      if (type === 'elite') this.game.announce(this.game.t('announce.elite'), '#ffd700');
    }
  }

  startWave() {
    this.wave += 1;
    this.phase = 'fighting';
    this.buildSpawnQueue();
    this.spawnTimer = 0.4;
    this.game.announce(this.game.t('announce.wave', { n: this.wave }), this.palette.accent);
    this.audio.setIntensity(clamp(0.35 + this.sector * 0.09 + this.wave * 0.07, 0, 0.9));
  }

  buildSpawnQueue() {
    const pool = this.sectorDef.pool;
    // each wave draws from a small, readable set of enemy types:
    // wave 1 → 2 types, wave 2 → 3 types, wave 3+ → up to 5 types
    const typeCount = Math.min(pool.length, this.wave === 1 ? 2 : this.wave === 2 ? 3 : 5);
    this.waveTypes = sample(pool, typeCount);
    // volume ramps hard with wave and node depth; sector 1 stays gentle
    let budget = Math.round(
      (10 + this.sector * 8 + this.nodeIndex * 6)
      * (1 + (this.wave - 1) * 0.55)
      * (this.sector === 1 ? 0.75 : 1)
      * this.nodeTypeMod()
    );
    const queue = [];
    while (budget > 0) {
      const id = choice(this.waveTypes);
      const cost = Math.max(1, ENEMY_TYPES[id].xp);
      queue.push({ id, elite: false });
      budget -= cost;
    }
    // elite node: inject elites on final wave
    if (this.nodeType === 'elite' && this.wave === this.wavesInNode) {
      const eliteCount = 2 + Math.floor(this.sector / 3);
      for (let i = 0; i < eliteCount; i++) queue.push({ id: choice(this.waveTypes), elite: true });
    }
    this.spawnQueue = queue;
  }

  spawnFromQueue(dt) {
    if (this.spawnQueue.length === 0) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      const batch = Math.min(this.spawnQueue.length, randInt(2, 4));
      for (let i = 0; i < batch; i++) {
        const s = this.spawnQueue.shift();
        this.spawnEnemyAtEdge(s.id, s.elite);
      }
      this.spawnTimer = rand(0.9, 1.6);
    }
  }

  spawnEnemyAtEdge(typeId, elite = false) {
    // spawn at arena edge, away from player
    const a = this.arena;
    let x, y, tries = 0;
    do {
      const side = randInt(0, 3);
      if (side === 0) { x = a.x + rand(60, a.w - 60); y = a.y + 50; }
      else if (side === 1) { x = a.x + rand(60, a.w - 60); y = a.y + a.h - 50; }
      else if (side === 2) { x = a.x + 50; y = a.y + rand(60, a.h - 60); }
      else { x = a.x + a.w - 50; y = a.y + rand(60, a.h - 60); }
      tries++;
    } while (dist2(x, y, this.player.x, this.player.y) < 260 * 260 && tries < 8);
    this.spawnEnemy(typeId, x, y, elite);
  }

  spawnEnemy(typeId, x, y, elite = false) {
    if (this.enemies.length > 90) return null;
    const e = new Enemy(typeId, x, y, this.hpScale(), this.dmgScale(), elite);
    this.enemies.push(e);
    this.meta.markSeen('enemy', typeId);
    return e;
  }

  spawnBoss() {
    const options = SECTOR_BOSSES[this.sector - 1];
    const bossId = choice(options);
    // boss base hp lives in the defs; scale mildly with player growth AND with depth
    let hpScale = (1 + (this.player.level - 1) * 0.02) * (1 + (this.sector - 1) * 0.07);
    let dmgS = this.dmgScale();
    if (this.sector === 3) { hpScale *= 3; dmgS *= 1.5; } // the Archive guardian is a wall — learn its patterns
    this.boss = new Boss(bossId, 0, this.arena.y + 170, hpScale, dmgS);
    this.enemies.push(this.boss);
    this.meta.markSeen('boss', bossId);
    this.game.onBossSpawn(this.boss);
  }

  // ---------- projectiles / hazards ----------
  spawnBullet(x, y, vx, vy, opts = {}) {
    if (this.bullets.length > 260) return;
    this.bullets.push({
      x, y, vx, vy, r: opts.r ?? 5, dmg: opts.dmg ?? 8,
      color: opts.color ?? '#ff5577', life: opts.life ?? 6,
      homing: opts.homing ?? 0, // turn rate (rad/s) when > 0
    });
  }

  // corrosive pool left on the floor (corruptor death, etc.)
  spawnPool(x, y, r, dps, life = 4) {
    if (!this.pools) this.pools = [];
    this.pools.push({ x, y, r, dps, life, maxLife: life });
  }

  // mortar shell: marked impact point, delayed blast
  spawnMortar(x, y, dmg, fuse = 1.15, r = 78) {
    if (!this.mortars) this.mortars = [];
    const a = this.arena;
    this.mortars.push({
      x: clamp(x, a.x + 30, a.x + a.w - 30), y: clamp(y, a.y + 30, a.y + a.h - 30),
      dmg, r, t: fuse, fuse,
    });
    this.audio.sfx('telegraph');
  }

  // shared update for pools & mortars (solo passes [player], co-op passes all alive)
  updateZones(dt, players) {
    if (this.pools) {
      for (let i = this.pools.length - 1; i >= 0; i--) {
        const z = this.pools[i];
        z.life -= dt;
        if (z.life <= 0) { this.pools.splice(i, 1); continue; }
        for (const p of players) {
          if (p.dashing || p.hitInvuln > 0) continue;
          p.poolCd = p.poolCd || 0;
          if (this.time > p.poolCd && dist2(z.x, z.y, p.x, p.y) < (z.r + p.radius) ** 2) {
            p.poolCd = this.time + 0.5;
            p.takeDamage(Math.round(z.dps * 0.5), this, 'hazard');
          }
        }
      }
    }
    if (this.mortars) {
      for (let i = this.mortars.length - 1; i >= 0; i--) {
        const m = this.mortars[i];
        m.t -= dt;
        if (m.t <= 0) {
          this.mortars.splice(i, 1);
          this.effects.shockwave(m.x, m.y, '#ffb347', m.r, 5);
          this.effects.burst(m.x, m.y, '#ffb347', 14, 240);
          this.audio.sfx('explode');
          for (const p of players) {
            if (dist2(m.x, m.y, p.x, p.y) < (m.r + p.radius) ** 2) p.takeDamage(m.dmg, this, 'hazard');
          }
        }
      }
    }
  }

  drawZones(ctx, camX, camY) {
    if (this.pools) {
      for (const z of this.pools) {
        const x = z.x - camX, y = z.y - camY;
        const a = clamp(z.life / z.maxLife, 0, 1);
        ctx.save();
        ctx.globalAlpha = 0.16 + 0.1 * a + 0.05 * Math.sin(this.time * 6);
        ctx.fillStyle = '#4ade80';
        ctx.beginPath(); ctx.arc(x, y, z.r, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.5 * a;
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }
    }
    if (this.mortars) {
      for (const m of this.mortars) {
        const x = m.x - camX, y = m.y - camY;
        const p = 1 - m.t / m.fuse;
        ctx.save();
        ctx.strokeStyle = '#ffb347';
        ctx.globalAlpha = 0.5 + 0.3 * Math.sin(this.time * 16);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, m.r, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, m.r * p, 0, TAU); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y);
        ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 8);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  spawnPlayerBullet(x, y, vx, vy, dmg, homing = false) {
    if (this.playerBullets.length > 120) return;
    this.playerBullets.push({ x, y, vx, vy, r: 4, dmg, homing, life: 2.5, color: homing ? '#ffe94a' : '#4aff8f' });
  }

  spawnMine(x, y, dmg) {
    const a = this.arena;
    this.mines.push({
      x: clamp(x, a.x + 20, a.x + a.w - 20), y: clamp(y, a.y + 20, a.y + a.h - 20),
      r: 9, trigR: 46, blastR: 80, dmg, armT: 0.7, life: 12,
    });
  }

  spawnBeam(x, y, a, len, opts = {}) {
    const beam = {
      x, y, a, len,
      width: opts.width ?? 22, dmg: opts.dmg ?? 14,
      state: 'tele', t: opts.teleDur ?? 0.9,
      teleDur: opts.teleDur ?? 0.9, fireDur: opts.fireDur ?? 0.9,
      tracking: opts.tracking ?? false,
      color: opts.color ?? '#ff3b5c',
      tickCd: 0,
    };
    this.beams.push(beam);
    this.audio.sfx('telegraph');
    return beam;
  }

  spawnHazard(dt) {
    const hz = this.sectorDef.hazard;
    if (!hz || this.phase === 'cleared') return;
    this.hazardTimer -= dt;
    if (this.hazardTimer > 0) return;
    this.hazardTimer = rand(7, 11);
    const a = this.arena;
    if (hz === 'firewall') {
      const y = a.y + rand(80, a.h - 80);
      this.spawnBeam(a.x, y, 0, a.w, { dmg: 14 * this.dmgScale(), width: 30, teleDur: 1.1, fireDur: 1.2, color: '#ff7b00' });
    } else if (hz === 'mines') {
      for (let i = 0; i < 3; i++) this.spawnMine(a.x + rand(60, a.w - 60), a.y + rand(60, a.h - 60), 12 * this.dmgScale());
      this.audio.sfx('mine');
    } else if (hz === 'cross') {
      const px = clamp(this.player.x + rand(-160, 160), a.x + 60, a.x + a.w - 60);
      const py = clamp(this.player.y + rand(-160, 160), a.y + 60, a.y + a.h - 60);
      this.spawnBeam(a.x, py, 0, a.w, { dmg: 15 * this.dmgScale(), width: 24, teleDur: 1.2, fireDur: 0.9, color: '#e2e8f0' });
      this.spawnBeam(px, a.y, Math.PI / 2, a.h, { dmg: 15 * this.dmgScale(), width: 24, teleDur: 1.2, fireDur: 0.9, color: '#e2e8f0' });
    }
  }

  clearBulletsAround() { this.bullets.length = 0; }

  // ---------- pickups ----------
  dropPickups(e) {
    const shards = Math.min(4, Math.max(1, Math.round(e.xp / 2)));
    const valEach = e.xp / shards;
    for (let i = 0; i < shards; i++) {
      this.pickups.push({
        kind: 'xp', x: e.x + rand(-14, 14), y: e.y + rand(-14, 14),
        vx: rand(-70, 70), vy: rand(-70, 70), val: valEach, r: 5, life: 18,
      });
    }
    if (e.credits > 0 && (e.credits >= 3 || Math.random() < 0.45)) {
      this.pickups.push({
        kind: 'credit', x: e.x, y: e.y, vx: rand(-50, 50), vy: rand(-50, 50),
        val: e.credits, r: 6, life: 18,
      });
    }
    if (Math.random() < 0.02) {
      this.pickups.push({ kind: 'repair', x: e.x, y: e.y, vx: 0, vy: 0, val: 12, r: 8, life: 14 });
    }
  }

  // ---------- damage resolution ----------
  guardReduction(e) {
    // aegis drone tether
    if (e.aegisT > 0) return 0.5;
    // guardian / pylon auras protect OTHER enemies near them
    for (const g of this.enemies) {
      if ((g.typeId === 'guardian' || g.typeId === 'pylon') && g !== e && !g.isBoss
          && dist2(g.x, g.y, e.x, e.y) < (g.type.auraR || 0) ** 2) return 0.5;
    }
    return 1;
  }

  damageEnemy(e, dmg, opts = {}) {
    if (e.spawnT > 0 || e.hp <= 0) return;
    const p = opts.pl || this.player;
    // front shield: reduce damage from the front
    if (e.type.frontShield && opts.fromX !== undefined) {
      const facing = e.isBoss ? angleTo(e.x, e.y, p.x, p.y) : e.rot;
      const hitA = angleTo(e.x, e.y, opts.fromX, opts.fromY);
      const diff = Math.abs(((hitA - facing + Math.PI * 3) % TAU) - Math.PI);
      // diff near 0 → attack came from the direction the shield faces
      if (diff < 1.15) dmg *= 0.2;
    }
    dmg *= this.guardReduction(e);
    if (e.isBoss || e.elite) dmg *= 1 + p.mods.bossDmg;
    // crit
    let crit = false;
    if (opts.canCrit && Math.random() < p.mods.critChance) { dmg *= p.mods.critMult; crit = true; }
    // execute
    if (opts.canExecute && !e.isBoss && p.mods.execute > 0 && (e.hp - dmg) / e.maxHp < p.mods.execute) {
      dmg = e.hp;
    }
    dmg = Math.max(1, Math.round(dmg));
    e.hp -= dmg;
    e.hitFlash = 1;
    p.stats.dmgDealt += dmg;
    this.effects.text(e.x, e.y - e.radius - 6, crit ? dmg + '!' : '' + dmg, crit ? '#ffe94a' : '#ffffff', crit ? 17 : 13);
    this.audio.sfx('hit');
    this.effects.burst(e.x, e.y, e.type.color || e.color, crit ? 10 : 5, 140);
    if (e.hp <= 0) this.killEnemy(e, opts);
  }

  killEnemy(e, opts = {}) {
    const idx = this.enemies.indexOf(e);
    if (idx === -1) return;
    this.enemies.splice(idx, 1);
    const p = opts.pl || this.player; // credit the killer (co-op)

    const ecol = e.type.color || e.color;
    const fx = this.killFxStyle || 'burst';
    this.effects.killBurst(e.x, e.y, ecol, fx, e.isBoss || e.elite);
    this.audio.sfx(e.isBoss ? 'bigExplode' : 'kill');
    this.effects.shake(e.isBoss ? 14 : e.elite ? 6 : 2);

    if (!opts.noReward) {
      this.dropPickups(e);
      if (opts.byDash) {
        p.onKill(this, e);
        // chain lightning
        if (p.mods.arcs > 0) this.chainArc(e.x, e.y, p.mods.arcs, p.dashDamage() * 0.45);
        // seekers
        if (p.mods.seekers > 0) {
          for (let i = 0; i < p.mods.seekers; i++) {
            const a = rand(TAU);
            this.spawnPlayerBullet(e.x, e.y, Math.cos(a) * 200, Math.sin(a) * 200, 14 * p.mods.dashDmg, true);
          }
        }
      } else {
        p.stats.kills += 1;
      }
    }
    if (e.type.onDeath) e.type.onDeath(e, this);
    if (e.isBoss) this.onBossKilled(e);
  }

  chainArc(x, y, count, dmg) {
    let fx = x, fy = y;
    const hit = new Set();
    for (let i = 0; i < count; i++) {
      let best = null, bestD = 240 * 240;
      for (const o of this.enemies) {
        if (hit.has(o.id) || o.spawnT > 0) continue;
        const d = dist2(fx, fy, o.x, o.y);
        if (d < bestD) { bestD = d; best = o; }
      }
      if (!best) break;
      hit.add(best.id);
      // lightning visual: particles along the line
      const steps = 6;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        this.effects.spawnParticle(lerp(fx, best.x, t) + rand(-6, 6), lerp(fy, best.y, t) + rand(-6, 6), {
          vx: 0, vy: 0, color: '#9ef0ff', life: 0.22, size: 3.5,
        });
      }
      this.audio.sfx('chain');
      this.damageEnemy(best, dmg, {});
      fx = best.x; fy = best.y;
    }
  }

  // player dash sweep vs enemies
  dashSweep(p, x1, y1, x2, y2) {
    const width = p.dashWidth();
    for (const e of this.enemies.slice()) {
      if (p.dashHitSet.has(e.id) || e.spawnT > 0) continue;
      if (circleSegHit(e.x, e.y, e.radius + width / 2, x1, y1, x2, y2)) {
        p.dashHitSet.add(e.id);
        const dmg = p.dashDamage();
        p.dashFirstHit = true;
        this.damageEnemy(e, dmg, { byDash: true, canCrit: true, canExecute: true, fromX: x1, fromY: y1, pl: p });
      }
    }
    // dash destroys enemy bullets in path (satisfying + defensive tech)
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      if (circleSegHit(b.x, b.y, b.r + width / 2, x1, y1, x2, y2)) {
        this.effects.spawnParticle(b.x, b.y, { color: b.color, life: 0.3, size: 3 });
        this.bullets.splice(i, 1);
        if (p.mods.bulletEater > 0) p.shield = Math.min(p.maxShield, p.shield + p.mods.bulletEater);
      }
    }
  }

  areaDamage(x, y, r, dmg, opts = {}) {
    for (const e of this.enemies.slice()) {
      if (e.spawnT > 0) continue;
      if (dist2(x, y, e.x, e.y) < (r + e.radius) ** 2) {
        this.damageEnemy(e, dmg, { fromX: x, fromY: y });
      }
    }
  }

  orbitalDamage(x, y, r, dmg) {
    for (const e of this.enemies.slice()) {
      if (e.spawnT > 0) continue;
      if (dist2(x, y, e.x, e.y) < (r + e.radius) ** 2) {
        e.orbitalCd = e.orbitalCd || 0;
        if (this.time > e.orbitalCd) {
          e.orbitalCd = this.time + 0.25;
          this.damageEnemy(e, Math.max(2, Math.round(dmg)), { fromX: x, fromY: y });
        }
      }
    }
  }

  droneFire(x, y, dmg) {
    let best = null, bestD = 420 * 420;
    for (const e of this.enemies) {
      if (e.spawnT > 0) continue;
      const d = dist2(x, y, e.x, e.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (!best) return;
    const a = angleTo(x, y, best.x, best.y);
    this.spawnPlayerBullet(x, y, Math.cos(a) * 480, Math.sin(a) * 480, dmg);
    this.audio.sfx('shoot');
  }

  playerAreaDamage(x, y, r, dmg, kind = 'contact') {
    const p = this.player;
    if (dist2(x, y, p.x, p.y) < (r + p.radius) ** 2) p.takeDamage(dmg, this, kind);
  }

  flashDamage() { this.game.flashDamage(); }
  onLevelUp() { this.game.onLevelUp(); }
  onPlayerDeath() { this.game.onPlayerDeath(); }
  aimFor(p) { return { x: this.mouseWX, y: this.mouseWY }; } // co-op overrides per player

  // ---------- update ----------
  update(dt, input, canvasW, canvasH) {
    this.time += dt;
    this.runTime += dt;
    const p = this.player;

    // mouse world position
    this.mouseWX = input.mouseX + this.camX;
    this.mouseWY = input.mouseY + this.camY;

    p.update(dt, input, this);

    // boss intro delay
    if (this.phase === 'bossIntro') {
      this.interWaveTimer -= dt;
      if (this.interWaveTimer <= 0) {
        this.phase = 'fighting';
        this.spawnBoss();
      }
    }

    // spawning
    if (this.phase === 'fighting' && this.nodeType !== 'boss') this.spawnFromQueue(dt);
    this.spawnHazard(dt);

    // enemies
    for (const e of this.enemies.slice()) e.update(dt, this, p);

    // contact damage
    if (!p.dashing && p.hitInvuln <= 0) {
      for (const e of this.enemies) {
        if (e.spawnT > 0 || e.dmg <= 0) continue;
        if (dist2(e.x, e.y, p.x, p.y) < (e.radius + p.radius) ** 2) {
          p.takeDamage(e.dmg, this);
          // knock enemy back a bit
          const a = angleTo(p.x, p.y, e.x, e.y);
          e.vx += Math.cos(a) * 220;
          e.vy += Math.sin(a) * 220;
          break;
        }
      }
    }

    // trail burn damage
    if (p.trailSegments.length) {
      for (const e of this.enemies.slice()) {
        if (e.spawnT > 0) continue;
        e.burnCd = e.burnCd || 0;
        if (this.time <= e.burnCd) continue;
        for (const s of p.trailSegments) {
          if (circleSegHit(e.x, e.y, e.radius + 8, s.x1, s.y1, s.x2, s.y2)) {
            e.burnCd = this.time + 0.35;
            this.damageEnemy(e, 6 * p.mods.trailBurn * p.mods.dashDmg, {});
            break;
          }
        }
      }
    }

    // hazard zones (pools / mortars)
    this.updateZones(dt, [p]);

    // enemy bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      if (b.homing > 0) {
        const ta = angleTo(b.x, b.y, p.x, p.y);
        const cur = Math.atan2(b.vy, b.vx);
        let diff = ((ta - cur + Math.PI * 3) % TAU) - Math.PI;
        const na = cur + clamp(diff, -b.homing * dt, b.homing * dt);
        const sp = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.life -= dt;
      const a = this.arena;
      if (b.life <= 0 || b.x < a.x - 40 || b.x > a.x + a.w + 40 || b.y < a.y - 40 || b.y > a.y + a.h + 40) {
        this.bullets.splice(i, 1); continue;
      }
      if (!p.dashing && p.hitInvuln <= 0 && dist2(b.x, b.y, p.x, p.y) < (b.r + p.radius) ** 2) {
        this.bullets.splice(i, 1);
        p.takeDamage(b.dmg, this);
      }
    }

    // player bullets
    for (let i = this.playerBullets.length - 1; i >= 0; i--) {
      const b = this.playerBullets[i];
      if (b.homing) {
        let best = null, bestD = 500 * 500;
        for (const e of this.enemies) {
          if (e.spawnT > 0) continue;
          const d = dist2(b.x, b.y, e.x, e.y);
          if (d < bestD) { bestD = d; best = e; }
        }
        if (best) {
          const ta = angleTo(b.x, b.y, best.x, best.y);
          const cur = Math.atan2(b.vy, b.vx);
          let diff = ((ta - cur + Math.PI * 3) % TAU) - Math.PI;
          const na = cur + clamp(diff, -5 * dt, 5 * dt);
          const sp = Math.min(520, Math.hypot(b.vx, b.vy) + 500 * dt);
          b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
        }
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) { this.playerBullets.splice(i, 1); continue; }
      let hit = false;
      for (const e of this.enemies.slice()) {
        if (e.spawnT > 0) continue;
        if (dist2(b.x, b.y, e.x, e.y) < (b.r + e.radius) ** 2) {
          this.damageEnemy(e, b.dmg, { fromX: b.x, fromY: b.y });
          hit = true;
          break;
        }
      }
      if (hit) this.playerBullets.splice(i, 1);
    }

    // mines
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      m.armT -= dt; m.life -= dt;
      if (m.life <= 0) { this.mines.splice(i, 1); continue; }
      if (m.armT <= 0 && dist2(m.x, m.y, p.x, p.y) < m.trigR * m.trigR) {
        this.mines.splice(i, 1);
        this.effects.shockwave(m.x, m.y, '#ff7b00', m.blastR, 5);
        this.effects.burst(m.x, m.y, '#ff7b00', 16, 260);
        this.audio.sfx('explode');
        this.effects.shake(5);
        this.playerAreaDamage(m.x, m.y, m.blastR, m.dmg, 'hazard');
      }
    }

    // beams
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const bm = this.beams[i];
      bm.t -= dt;
      if (bm.state === 'tele' && bm.t <= 0) {
        bm.state = 'fire'; bm.t = bm.fireDur;
        this.audio.sfx('laser');
      } else if (bm.state === 'fire') {
        bm.tickCd -= dt;
        if (bm.tickCd <= 0 && !p.dashing && p.hitInvuln <= 0) {
          const ex = bm.x + Math.cos(bm.a) * bm.len;
          const ey = bm.y + Math.sin(bm.a) * bm.len;
          if (circleSegHit(p.x, p.y, p.radius + bm.width / 2, bm.x, bm.y, ex, ey)) {
            bm.tickCd = 0.4;
            p.takeDamage(bm.dmg, this, 'hazard');
          }
        }
        if (bm.t <= 0) { bm.state = 'dead'; this.beams.splice(i, 1); }
      }
    }

    // pickups
    const pr = p.pickupRadius();
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i];
      k.life -= dt;
      if (k.life <= 0) { this.pickups.splice(i, 1); continue; }
      const d2 = dist2(k.x, k.y, p.x, p.y);
      if (d2 < pr * pr) {
        const a = angleTo(k.x, k.y, p.x, p.y);
        const pull = 560 * (1 - Math.sqrt(d2) / pr) + 140;
        k.vx = lerp(k.vx, Math.cos(a) * pull, 1 - Math.exp(-8 * dt));
        k.vy = lerp(k.vy, Math.sin(a) * pull, 1 - Math.exp(-8 * dt));
      } else {
        k.vx *= Math.pow(0.2, dt); k.vy *= Math.pow(0.2, dt);
      }
      k.x += k.vx * dt; k.y += k.vy * dt;
      if (d2 < (16 + p.radius) ** 2) {
        this.pickups.splice(i, 1);
        this.collectPickup(k);
      }
    }

    // wave / node completion
    if (this.phase === 'fighting' && this.nodeType !== 'boss'
        && this.spawnQueue.length === 0 && this.enemies.length === 0) {
      if (this.wave < this.wavesInNode) {
        this.phase = 'interWave';
        this.interWaveTimer = 1.3;
        this.audio.sfx('waveClear');
        this.wavesCleared += 1;
      } else {
        this.wavesCleared += 1;
        this.nodeCleared();
      }
    } else if (this.phase === 'interWave') {
      this.interWaveTimer -= dt;
      if (this.interWaveTimer <= 0) this.startWave();
    }

    this.effects.update(dt);

    // camera: follow player, look toward mouse
    const lookX = (input.mouseX - canvasW / 2) * 0.18;
    const lookY = (input.mouseY - canvasH / 2) * 0.18;
    const tx = p.x + lookX - canvasW / 2;
    const ty = p.y + lookY - canvasH / 2;
    this.camX = lerp(this.camX, tx, 1 - Math.exp(-6 * dt));
    this.camY = lerp(this.camY, ty, 1 - Math.exp(-6 * dt));
    // clamp camera to arena (+margin)
    const mX = 140, mY = 110;
    const aMinX = this.arena.x - mX, aMaxX = this.arena.x + this.arena.w + mX - canvasW;
    const aMinY = this.arena.y - mY, aMaxY = this.arena.y + this.arena.h + mY - canvasH;
    if (aMaxX > aMinX) this.camX = clamp(this.camX, aMinX, aMaxX); else this.camX = (aMinX + aMaxX) / 2;
    if (aMaxY > aMinY) this.camY = clamp(this.camY, aMinY, aMaxY); else this.camY = (aMinY + aMaxY) / 2;
    this.camX += this.effects.shakeX;
    this.camY += this.effects.shakeY;
  }

  collectPickup(k) {
    const p = this.player;
    if (k.kind === 'xp') {
      p.gainXp(k.val, this);
      this.audio.sfx('pickup');
      if (p.mods.shardBomb > 0 && Math.random() < p.mods.shardBomb) {
        const r = 80 * (1 + p.mods.blastRadius);
        this.areaDamage(k.x, k.y, r, 18 * p.mods.dashDmg, {});
        this.effects.shockwave(k.x, k.y, '#ff2fd6', r, 3);
      }
      if (p.mods.shardCredit > 0 && Math.random() < p.mods.shardCredit) {
        const amount = Math.round(1 * p.mods.creditGain) || 1;
        this.creditsEarned += amount;
        this.effects.text(p.x, p.y - 24, '+' + amount + '⬡', '#ffe94a', 11);
      }
    } else if (k.kind === 'credit') {
      const amount = Math.round(k.val * p.mods.creditGain);
      this.creditsEarned += amount;
      this.audio.sfx('credit');
      this.effects.text(p.x, p.y - 24, '+' + amount + '⬡', '#ffe94a', 12);
    } else if (k.kind === 'repair') {
      p.hp = Math.min(p.maxHp, p.hp + k.val);
      this.audio.sfx('heal');
      this.effects.text(p.x, p.y - 24, '+' + k.val, '#4aff8f', 13);
    }
  }

  nodeCleared() {
    this.phase = 'cleared';
    this.audio.sfx('waveClear');
    this.audio.setIntensity(0.3);
    // node rewards
    if (this.nodeType === 'elite') this.pendingReward = 'epic';
    else if (this.nodeType === 'cache') {
      const bonus = Math.round((30 + this.sector * 22) * this.player.mods.creditGain);
      this.creditsEarned += bonus;
      this.effects.text(this.player.x, this.player.y - 30, '+' + bonus + '⬡', '#ffe94a', 16);
      this.audio.sfx('purchase');
    } else if (this.nodeType === 'repair') {
      const heal = Math.round(this.player.maxHp * 0.35);
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
      this.effects.text(this.player.x, this.player.y - 30, '+' + heal, '#4aff8f', 16);
      this.audio.sfx('heal');
    }
    this.game.onNodeCleared();
  }

  onBossKilled(boss) {
    this.phase = 'cleared';
    this.audio.setIntensity(0.25);
    // big credit reward
    const bonus = Math.round((50 + this.sector * 30) * this.player.mods.creditGain);
    this.creditsEarned += bonus;
    this.bullets.length = 0;
    this.game.onBossDefeated();
  }

  advanceToNode(type) {
    if (type === 'boss') {
      this.nodeIndex = NODES_PER_SECTOR;
      this.startNode('boss');
    } else {
      this.startNode(type);
    }
  }

  nextSector() {
    this.sector += 1;
    this.nodeIndex = 0;
    this.pickups.length = 0;
    this.audio.setRoot(this.sector - 1);
    return this.sector <= SECTORS.length;
  }

  // path options after clearing a node (bonus stages only appear after boss fights)
  pathOptions() {
    if (this.nodeIndex >= NODES_PER_SECTOR) return ['boss'];
    const opts = ['combat'];
    const extra = sample(['elite', 'cache', 'repair'], 2);
    opts.push(...extra);
    return sample(opts, Math.min(3, opts.length));
  }

  // ---------- draw ----------
  draw(ctx, canvasW, canvasH) {
    const camX = this.camX, camY = this.camY;
    const a = this.arena;
    const pal = this.palette;

    // arena floor tint + border
    ctx.save();
    ctx.strokeStyle = pal.wall;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = pal.wall;
    ctx.shadowBlur = 18;
    ctx.strokeRect(a.x - camX, a.y - camY, a.w, a.h);
    ctx.shadowBlur = 0;
    // corner accents
    ctx.lineWidth = 5;
    const cl = 46;
    for (const [cx, cy, sx, sy] of [[a.x, a.y, 1, 1], [a.x + a.w, a.y, -1, 1], [a.x, a.y + a.h, 1, -1], [a.x + a.w, a.y + a.h, -1, -1]]) {
      ctx.beginPath();
      ctx.moveTo(cx - camX + sx * cl, cy - camY);
      ctx.lineTo(cx - camX, cy - camY);
      ctx.lineTo(cx - camX, cy - camY + sy * cl);
      ctx.stroke();
    }
    ctx.restore();

    // hazard zones under everything else
    this.drawZones(ctx, camX, camY);

    // mines
    for (const m of this.mines) {
      const x = m.x - camX, y = m.y - camY;
      const armed = m.armT <= 0;
      const blink = armed && Math.floor(this.time * 6) % 2 === 0;
      ctx.save();
      const spr = glowSprite('#ff7b00');
      ctx.globalAlpha = 0.6;
      ctx.drawImage(spr, x - 14, y - 14, 28, 28);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = blink ? '#ffffff' : '#ff7b00';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, m.r, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = blink ? '#fff' : '#ff7b00';
      ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill();
      ctx.restore();
    }

    // beams
    for (const bm of this.beams) {
      const x1 = bm.x - camX, y1 = bm.y - camY;
      const x2 = x1 + Math.cos(bm.a) * bm.len, y2 = y1 + Math.sin(bm.a) * bm.len;
      ctx.save();
      if (bm.state === 'tele') {
        const pulse = 0.25 + 0.2 * Math.sin(this.time * 18);
        ctx.globalAlpha = pulse;
        ctx.strokeStyle = bm.color;
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 8]);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = bm.color;
        ctx.lineWidth = bm.width;
        ctx.lineCap = 'round';
        ctx.shadowColor = bm.color;
        ctx.shadowBlur = 24;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = bm.width * 0.3;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
      ctx.restore();
    }

    // pickups
    for (const k of this.pickups) {
      const x = k.x - camX, y = k.y - camY;
      const bob = Math.sin(this.time * 5 + k.x) * 2;
      ctx.save();
      if (k.kind === 'xp') {
        const spr = glowSprite('#ff2fd6');
        ctx.globalAlpha = 0.85;
        ctx.drawImage(spr, x - 10, y + bob - 10, 20, 20);
        ctx.fillStyle = '#ff9dee';
        ctx.fillRect(x - 2.5, y + bob - 2.5, 5, 5);
      } else if (k.kind === 'credit') {
        const spr = glowSprite('#ffe94a');
        ctx.globalAlpha = 0.9;
        ctx.drawImage(spr, x - 12, y + bob - 12, 24, 24);
        ctx.strokeStyle = '#ffe94a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const an = (TAU * i) / 6 - Math.PI / 6;
          const px2 = x + Math.cos(an) * 5, py2 = y + bob + Math.sin(an) * 5;
          if (i === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
        }
        ctx.closePath(); ctx.stroke();
      } else if (k.kind === 'repair') {
        const spr = glowSprite('#4aff8f');
        ctx.globalAlpha = 0.9;
        ctx.drawImage(spr, x - 13, y + bob - 13, 26, 26);
        ctx.fillStyle = '#4aff8f';
        ctx.fillRect(x - 6, y + bob - 2, 12, 4);
        ctx.fillRect(x - 2, y + bob - 6, 4, 12);
      }
      ctx.restore();
    }

    // enemy bullets
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.bullets) {
      const spr = glowSprite(b.color);
      const s = b.r * 5;
      ctx.drawImage(spr, b.x - camX - s / 2, b.y - camY - s / 2, s, s);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(b.x - camX, b.y - camY, b.r * 0.55, 0, TAU);
      ctx.fill();
    }
    // player bullets
    for (const b of this.playerBullets) {
      const spr = glowSprite(b.color);
      const s = b.r * 5;
      ctx.drawImage(spr, b.x - camX - s / 2, b.y - camY - s / 2, s, s);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(b.x - camX, b.y - camY, 2, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // drain / support tether beams
    for (const e of this.enemies) {
      if ((e.typeId === 'leech' || e.typeId === 'drainSpire') && e.draining) {
        ctx.save();
        ctx.globalAlpha = 0.5 + 0.2 * Math.sin(this.time * 20);
        ctx.strokeStyle = '#818cf8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(e.x - camX, e.y - camY);
        ctx.lineTo(this.player.x - camX, this.player.y - camY);
        ctx.stroke();
        ctx.restore();
      }
      if (e.typeId === 'aegisDrone' && e.tether && this.enemies.includes(e.tether)) {
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.strokeStyle = '#93c5fd';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.moveTo(e.x - camX, e.y - camY);
        ctx.lineTo(e.tether.x - camX, e.tether.y - camY);
        ctx.stroke();
        ctx.restore();
      }
    }

    // enemies
    for (const e of this.enemies) e.draw(ctx, camX, camY);

    // player
    this.player.draw(ctx, camX, camY, this);

    // effects on top
    this.effects.draw(ctx, camX, camY);
  }
}
