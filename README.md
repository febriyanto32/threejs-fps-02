# EMBERLINE — Harbor Yard

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/febriyanto32/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/febriyanto32/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A round-based tactical FPS in the browser, built on three.js 0.187.0 (vendored, no build step, no network). Counter-Strike-style, never a copy: its own map, art, sounds and names.

**Harbor Yard** is a 44 × 36 m container yard at dusk — three lanes, two bomb sites, a gantry crane on the skyline. You are Ember's fifth operator; four Ember bots fight beside you against five Ash bots.

## What is in the game

- **Rounds that matter** — first to 5, nine rounds at most. Buy phase, 100-second live rounds, plant (3 s) / defuse (5 s), a 35-second fuse, and wins by elimination, detonation, defuse or timeout.
- **Economy and a buy menu** — $800 to start, +$300 a kill, +$300 a plant, +$3,250 a round win, +$1,900 a loss with a streak bonus. Five weapons (P9, Kestrel-9 SMG, Breacher-12 shotgun, VK-47 rifle, Longbow .50 sniper) plus a frag grenade.
- **Gunplay where stopping pays** — headshots deal ×4, recoil kicks the view, bloom grows with sustained fire, and spread widens with movement. Crouch, stand still and aim down sights to tighten the cone.
- **Bots that play the objective** — BFS routing over a waypoint graph, site holds, a mid roamer that investigates gunfire, strafing duels with a human-like reaction delay, a carrier that plants, defenders that rotate and defuse, and the charge changing hands when its carrier falls.
- **A full HUD** — health, ammo and reserve, money, round timer, score, charge state, a crosshair that widens with your live spread, hitmarkers, killfeed, plant/defuse progress, and damage feedback.
- **Synthesized sound** — every shot, reload, footstep, plant beep and explosion is generated with WebAudio. No audio files are shipped.
- **Movement** — acceleration and friction, crouch, jump, and collision against every container, crate and wall.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

Click **DEPLOY**, then `WASD` to move, mouse to aim, click to fire, `R` to reload, `B` to buy, hold `E` to plant or defuse, `4` for a frag, `C` to crouch, `Space` to jump.

## Layout

| File | Job |
| --- | --- |
| `game/src/main.js` | Boot, renderer, fixed-step loop (60 Hz), input, test hooks |
| `game/src/config.js` | Every balance number: map, rounds, economy, weapons |
| `game/src/world.js` | Harbor Yard: geometry, colliders, waypoints, line of sight |
| `game/src/weapons.js` | Viewmodels, spread/recoil, hit resolution, tracers, grenades |
| `game/src/player.js` | First-person controller and gunplay |
| `game/src/bots.js` | Bot squad: routing, combat, plant/defuse, charge hand-off |
| `game/src/game.js` | The match: phases, economy, charge, win conditions |
| `game/src/hud.js` | DOM HUD, buy menu, banners, killfeed |
| `game/src/audio.js` | Synthesized WebAudio sounds |
| `main.ts` | Entrypoint: copies `game/` + `screenshots/` to `/output`, writes `dossier.json` |

The simulation runs on a fixed 60 Hz step, kept apart from rendering. No objects are allocated in the hot loops' inner paths beyond the small vectors the shot code reuses per pellet; state lives in the `Match`.

## Entry

`main.ts` (Node 22, standard library only) hands the game in:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

License: MIT — see `LICENSE`.
