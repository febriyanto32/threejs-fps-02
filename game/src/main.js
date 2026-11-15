// EMBERLINE — Harbor Yard. A round-based tactical FPS in the browser.
// Three.js 0.187.0 (vendored), no build step, no network requests, bots
// included. You are Ember; Ash defends the yard. Plant the charge, or
// clear the yard — first to five rounds takes the match.
//
// main.js is the bootstrapper: it builds the renderer and the scene,
// wires the match, the player, the bots and the HUD together, and runs a
// fixed-step simulation (60 Hz) apart from rendering. The game itself
// lives in the sibling modules, one job each.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { buildYard } from './world.js';
import { SoundBank } from './audio.js';
import { Player } from './player.js';
import { BotSquad } from './bots.js';
import { Match } from './game.js';
import { Hud } from './hud.js';

const STEP = 1 / 60;
const MAX_STEPS_PER_FRAME = 600;

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

const params = new URLSearchParams(location.search);
const quickStart = params.has('quick');

const canvasHolder = document.getElementById('app');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  const note = document.createElement('div');
  note.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#e8e6df;font:16px sans-serif;text-align:center;padding:24px;';
  note.textContent = 'EMBERLINE needs WebGL 2. Please open this page in desktop Chrome with hardware acceleration on.';
  canvasHolder.appendChild(note);
  throw err;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
canvasHolder.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b2036);
scene.fog = new THREE.Fog(0x1b2036, 26, 78);

// Dusk over the harbor: a low amber sun, a cool sky fill, and two warm
// yard lamps. Shadows come from the sun only, to keep the frame cheap.
const sun = new THREE.DirectionalLight(0xffb36b, 1.5);
sun.position.set(-26, 30, -14);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -30;
sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30;
sun.shadow.camera.bottom = -30;
sun.shadow.camera.far = 90;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0x5a6ea8, 0x2a2118, 1.0));
// A dim warm fill from the south-east so the containers' south faces
// read instead of going black at dusk.
const fill = new THREE.DirectionalLight(0xffd9a0, 0.55);
fill.position.set(18, 24, 26);
scene.add(fill);

// The yard: ground, containers, crates, lamps, sites, waypoints.
const yard = buildYard(scene);

// Shared sound bank. It stays silent until the first gesture unlocks it.
const sound = new SoundBank();

// The match owns score, money, timers, the charge and the round phases.
const match = new Match({ yard, sound });

// The player is Ember's fifth operator; the squads are four bots a side.
const player = new Player({ scene, yard, sound, match });
const bots = new BotSquad({ scene, yard, sound, match, player });
match.attach(player, bots);

// HUD: health, ammo, money, timer, score, buy menu, banners, overlays.
const hud = new Hud({ match, player, bots, sound });
match.hud = hud;
player.hud = hud;
bots.hud = hud;

// ---------------------------------------------------------------------------
// Input: keys, mouse look, pointer lock
// ---------------------------------------------------------------------------

const keys = new Set();
let locked = false;

addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'KeyB') hud.toggleBuy();
  if (e.code === 'KeyR') player.reload();
  if (e.code === 'Digit4') player.throwGrenade();
  if (e.code === 'KeyE') match.interact(player);
  if (e.code === 'Digit1') player.selectSlot(0);
  if (e.code === 'Digit2') player.selectSlot(1);
  if (e.code === 'Digit3') player.selectSlot(2);
  if (e.code === 'KeyM') sound.toggleMute();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

renderer.domElement.addEventListener('mousedown', (e) => {
  if (!match.started) return;
  if (!locked && !quickStart) renderer.domElement.requestPointerLock();
  if (e.button === 0) player.triggerDown = true;
  if (e.button === 2) player.aiming = true;
});
addEventListener('mouseup', (e) => {
  if (e.button === 0) player.triggerDown = false;
  if (e.button === 2) player.aiming = false;
});
addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
});
document.addEventListener('mousemove', (e) => {
  if (!match.started) return;
  if (locked || (quickStart && e.buttons === 1)) {
    player.look(e.movementX, e.movementY);
  }
});

// ---------------------------------------------------------------------------
// Fixed-step loop
// ---------------------------------------------------------------------------

const clock = { last: performance.now(), getDelta() { const now = performance.now(); const d = (now - this.last) / 1000; this.last = now; return d; } };
let accumulator = 0;
let timeScale = 1;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);
  accumulator += dt * timeScale;
  let steps = 0;
  while (accumulator >= STEP && steps < MAX_STEPS_PER_FRAME) {
    match.update(STEP, keys);
    accumulator -= STEP;
    steps += 1;
  }
  if (steps === MAX_STEPS_PER_FRAME) accumulator = 0;
  renderer.render(scene, player.camera);
  hud.refresh();
}

addEventListener('resize', () => {
  player.camera.aspect = innerWidth / innerHeight;
  player.camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------------------
// Start / restart, and the test hooks
// ---------------------------------------------------------------------------

hud.onDeploy = () => {
  sound.ensure();
  match.startMatch();
  if (!quickStart) renderer.domElement.requestPointerLock();
};
hud.onRestart = () => {
  match.startMatch();
};

if (quickStart) {
  // Screenshot and test mode: no overlay, no pointer lock, straight in.
  sound.ensure();
  match.startMatch();
  hud.hideOverlays();
}

// Debug and test hooks. They only steer the match through its own public
// methods, and they never run during normal play.
window.__ember = {
  match,
  player,
  bots,
  yard,
  sound,
  version: 'emberline-2',
  debug: {
    set timeScale(v) { timeScale = Math.max(0.25, Math.min(40, v)); },
    get timeScale() { return timeScale; },
    setRoundTime(s) { match.setRoundTime(s); },
    forcePlant() { return match.debugForcePlant(); },
    killBot(bot) { bot.takeDamage(999, 'body', player); },
    killAll(team) { bots.alive(team).forEach((b) => b.takeDamage(999, 'body', player)); },
    teleportPlayer(x, z, yaw) { player.teleport(x, z, yaw); },
    giveMoney(n) { match.money.ember += n; },
    dropCharge() { match.dropCharge(); },
  },
};

frame();
