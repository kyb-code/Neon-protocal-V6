# NEON PROTOCOL

**Dash through the machine.** A neon arcade dash-action roguelite. You are a rogue process
infiltrating a hostile network — your dash is both your weapon and your escape.

네온 아케이드 대시 액션 로그라이트. 당신은 적대적 네트워크에 침투한 프로그램이며,
**대시가 곧 공격이자 회피**입니다.

## Play / 실행

**Easiest:** double-click **`play.bat`**. It finds a free port, serves this folder, waits
until the game responds, then opens your browser. Keep the small window open while playing.

**Manual:** ES modules can't load from `file://`, so run a local server from this folder:

```
python -m http.server 8791
# then open http://localhost:8791
```

**가장 쉬운 방법**: `play.bat` 더블클릭 — 빈 포트를 찾아 서버를 띄우고 게임이 준비되면
브라우저를 자동으로 엽니다. 플레이 중에는 뜬 창을 닫지 마세요. (index.html을 직접 열면
브라우저가 ES 모듈을 막아 실행되지 않습니다.)

## Controls / 조작

| Input | Action |
|---|---|
| `WASD` / Arrows | Move / 이동 |
| `Space` / `Left Click` / `Shift` | Dash toward cursor / 커서 방향 대시 |
| `1` `2` `3` | Select cards / 카드 선택 |
| `Esc` | Pause / 일시정지 |

## Game Structure / 게임 구조

- **Animated story intro** on first launch (replayable from the menu).
- **5 sectors** (Datastream → Firewall → Archive → Kernel → Core), each with its own
  **story briefing + objective**, palette, enemy pool, and environmental hazard.
  Difficulty rises steeply every sector.
- Each sector: **combat nodes → path choices (elite / cache / repair) → sector boss
  → reward stage (minigame)**.
- **Reward stages: 10 different minigames** (rhythm, catcher, memory, mouse-maze, typing,
  breakout, flappy, bullet-dodge, reaction test, stacker). Win → **3+ rubies ◆ + coins**;
  even a loss pays 1 ruby.
- **Two currencies**: coins ⬡ (permanent augments) and rubies ◆ (special hardware shop,
  10 unique items + ship color unlocks).
- **Ship customization**: 8 hull colors (4 unlockable with rubies) × 3 chassis shapes.
- **CO-OP RAID (2–4 players)** — *Overclock Protocol*: host a raid, share the 5-letter
  code, friends join in real time (P2P via WebRTC). 12 brutal waves ending in a
  **double-boss finale**, shared team levels, per-player upgrade drafts, and a
  down-but-not-out revive system. Difficulty scales with party size.
- **20 enemy types**, **9 bosses** (2 variants per sector, fixed final boss).
- **46 in-run upgrade cards** in 5 categories (dash/defense/mobility/weapon/economy),
  fully documented in the in-game **Protocol Archive**.
- **12 permanent augments** bought with coins between runs.
- **4 dash cores** (Vector / Blink / Phantom / Surge) unlocked by milestones.
- Shield regenerates (slowly — guard it); integrity does not. Kills refund dash charge.
- **Charge dash**: tap Space/left-click for an instant dash, or **hold right-click** (up to
  2s) to wind up a long, heavy dash — up to ~2.4× range and ~2.6× damage.
- **Skill Tree**: spend coins on a branching permanent tree (Offense / Defense / Utility,
  15 nodes with prerequisites), separate from the flat Augments shop.
- **Cosmetics**: 10 kill-effect skins and 10 dash-trail skins, bought with coins in
  Customize (one ultra-flashy effect in each set is admin-only).
- English / 한국어, synthesized SFX + procedural synthwave music (no asset files).

### Accounts, rankings & admin / 계정·랭킹·관리자

- Sign in from the main menu. Accounts are stored per-browser (localStorage); your save
  and best records follow your login. Each account has its own save slot.
- **Rankings**: export your board to `neon-protocol-rankings.txt` and share it; friends
  **import** it to merge everyone's scores for comparison.
- **Admin**: log in as `admin` to open the Admin Console — see signups/logins, grant
  currency to any account, and unlock the exclusive **rainbow hull**.
- 계정은 브라우저별로 저장되고 로그인에 따라 세이브·기록이 따라갑니다. 랭킹은 txt로
  내보내 공유하고, 친구가 가져오기로 합쳐서 비교합니다. 관리자 계정으로 로그인하면
  유입 현황 확인·재화 지급 등 관리 기능을 쓸 수 있습니다.

### Multiplayer / 멀티플레이

- **Co-op Raid (2–4P)** and **1v1 Duel (Versus Protocol)**. Host to get a 5-letter code;
  friends enter it under *Join with Code*.
- Duels use **QWER skill loadouts** (pick one skill per key in the lobby): bolt/lance,
  ward/mend, flicker/hook, nova/railstorm. Move with arrows or hold RMB to glide, dash
  with Space, first to 3 wins.
- Connectivity uses STUN + a TURN relay with fallback signaling servers, so it works
  across most home networks. **Both players need internet access.** If a direct link is
  slow, both retry once — the relay kicks in.
- 협동 레이드(2~4인)와 1:1 결투. 호스트가 코드를 공유하면 친구가 입력해 접속합니다.
  결투는 로비에서 QWER 스킬을 하나씩 골라 구성하고, 방향키/우클릭 이동·스페이스 대시로
  3선승 대결을 벌입니다.

## Tech

- Vanilla ES modules, Canvas 2D, Web Audio. Zero dependencies, zero external assets.
- Save data in `localStorage` (`neon_protocol_save_v1`).
- `src/` layout: `main.js` (state machine/loop), `world.js` (run director),
  `player.js`, `enemies.js`, `bosses.js`, `upgrades.js`, `meta.js` (persistence),
  `audio.js`, `effects.js`, `ui.js`, `i18n.js`, `input.js`, `utils.js`.

## Steam packaging (next step)

The game is a fully static web app, designed to be wrapped with
[Tauri](https://tauri.app) (or Electron) for a Windows/Steam build:
point the wrapper at this directory as its frontend, add Steamworks
integration (e.g. `steamworks.js`) for achievements/leaderboards later.
