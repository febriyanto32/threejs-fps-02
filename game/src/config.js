// EMBERLINE — one place for every number the game balances on.
// Nothing here touches three.js; the simulation modules read it.

export const CONFIG = {
  // Harbor Yard: 44 m wide (x) by 36 m deep (z). Attackers spawn south
  // (z +), defenders north (z -). Site A sits north-west, site B north-east.
  yard: { width: 44, depth: 36, wallHeight: 4.2 },

  // A round: buy window, live time, fuse after a plant, post-round pause.
  round: {
    buySeconds: 10,
    liveSeconds: 100,
    plantSeconds: 3,
    defuseSeconds: 5,
    fuseSeconds: 35,
    postSeconds: 4,
    winRounds: 5,
    maxRounds: 9,
  },

  economy: {
    startMoney: 800,
    kill: 300,
    plant: 300,
    win: 3250,
    loss: 1900,
    lossStreakBonus: 500,
    maxLossStreakBonus: 1500,
  },

  player: {
    radius: 0.38,
    eyeStanding: 1.62,
    eyeCrouch: 1.08,
    walkSpeed: 5.4,
    crouchSpeed: 2.6,
    aimSpeed: 3.2,
    accel: 42,
    friction: 11,
    jumpSpeed: 5.2,
    gravity: 13.5,
    health: 100,
  },

  bot: {
    radius: 0.38,
    walkSpeed: 4.6,
    runSpeed: 5.2,
    health: 100,
    // Reaction and aim error, in seconds and degrees. Bots are beatable:
    // they need a beat to acquire you and they miss at range.
    reactMin: 0.35,
    reactMax: 0.8,
    aimErrorDeg: 2.6,
    burstMin: 3,
    burstMax: 6,
    burstPause: 0.55,
    hearRadius: 20,
  },
};

// Weapons. Damage is per pellet; a headshot multiplies it by four.
// spread is the base cone in degrees while standing still; moving,
// firing and firing on the move all widen it (see weapons.js).
export const WEAPONS = {
  p9: {
    id: 'p9', name: 'P9', kind: 'pistol', price: 0,
    damage: 22, headMult: 4, pellets: 1,
    mag: 12, reserve: 48, rpm: 340, auto: false,
    reloadSeconds: 1.5, spread: 0.7, moveSpread: 2.4,
    recoil: 0.55, bloom: 0.35, range: 60, zoom: 1,
    color: 0x2e2a26, barrel: 0.42,
  },
  kestrel: {
    id: 'kestrel', name: 'Kestrel-9', kind: 'smg', price: 1500,
    damage: 17, headMult: 4, pellets: 1,
    mag: 28, reserve: 112, rpm: 780, auto: true,
    reloadSeconds: 2.0, spread: 1.1, moveSpread: 3.4,
    recoil: 0.42, bloom: 0.5, range: 55, zoom: 1,
    color: 0x27303a, barrel: 0.5,
  },
  breacher: {
    id: 'breacher', name: 'Breacher-12', kind: 'shotgun', price: 1200,
    damage: 11, headMult: 4, pellets: 8,
    mag: 6, reserve: 24, rpm: 68, auto: false,
    reloadSeconds: 2.6, spread: 3.4, moveSpread: 5.2,
    recoil: 2.4, bloom: 1.2, range: 26, zoom: 1,
    color: 0x3a2a22, barrel: 0.62,
  },
  vk47: {
    id: 'vk47', name: 'VK-47', kind: 'rifle', price: 2700,
    damage: 30, headMult: 4, pellets: 1,
    mag: 30, reserve: 90, rpm: 600, auto: true,
    reloadSeconds: 2.2, spread: 0.8, moveSpread: 3.0,
    recoil: 0.85, bloom: 0.55, range: 70, zoom: 1.15,
    color: 0x3d2f1e, barrel: 0.58,
  },
  longbow: {
    id: 'longbow', name: 'Longbow .50', kind: 'sniper', price: 4750,
    damage: 96, headMult: 4, pellets: 1,
    mag: 5, reserve: 15, rpm: 48, auto: false,
    reloadSeconds: 3.2, spread: 0.15, moveSpread: 7.5,
    recoil: 3.4, bloom: 0.2, range: 120, zoom: 2.6,
    color: 0x1f2a1e, barrel: 0.85,
  },
  frag: {
    id: 'frag', name: 'Frag Grenade', kind: 'grenade', price: 300,
    damage: 95, headMult: 1, pellets: 1,
    mag: 1, reserve: 0, rpm: 60, auto: false,
    reloadSeconds: 0, spread: 0, moveSpread: 0,
    recoil: 0, bloom: 0, range: 0, zoom: 1,
    color: 0x2c4426, barrel: 0,
  },
};

export const BUY_ORDER = ['p9', 'kestrel', 'breacher', 'vk47', 'longbow', 'frag'];

// Ember attacks, Ash defends. The player always plays Ember.
export const TEAMS = {
  ember: { name: 'Ember', color: 0xff9a3c, dark: 0x8a4d12, spawnZ: 15.5 },
  ash: { name: 'Ash', color: 0x6fb3ff, dark: 0x1d4a7a, spawnZ: -15.5 },
};

export const BOT_NAMES = {
  ember: ['Juno', 'Mara', 'Kite', 'Sol'],
  ash: ['Vex', 'Rook', 'Hale', 'Nyx', 'Bram'],
};
