// EMBERLINE — Harbor Yard, an original 44 x 36 m container yard at dusk.
// Three lanes run south to north: west lane to site A, mid lane through
// the crane gate, east lane to site B. Attackers spawn south, defenders
// north. Everything the simulation needs — colliders, waypoints, sites,
// line of sight — is built here, next to the meshes that draw it.

import * as THREE from 'three';

// -- palette ---------------------------------------------------------------
const ASPHALT = 0x2b2b31;
const WALL = 0x3a3f4a;
const CONTAINER_COLORS = [0xb4502a, 0x2e7f7a, 0x4a6a8a, 0x8a6a2e, 0x5a4a6a];
const CRATE = 0x7a5c38;
const LAMP_WARM = 0xffc06a;

// -- helpers ---------------------------------------------------------------

function corrugated(color) {
  // A runtime-painted container face: vertical ribs and a stencilled code.
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#' + color.toString(16).padStart(6, '0');
  g.fillRect(0, 0, 256, 128);
  for (let x = 0; x < 256; x += 16) {
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(x, 0, 5, 128);
    g.fillStyle = 'rgba(255,255,255,0.07)';
    g.fillRect(x + 8, 0, 4, 128);
  }
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.font = 'bold 26px monospace';
  g.fillText('EMBL-' + (100 + (color % 89)), 14, 44);
  g.font = '16px monospace';
  g.fillText('HARBOR YARD', 14, 72);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function letterSign(letter) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#101018';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#ffc06a';
  g.lineWidth = 6;
  g.strokeRect(6, 6, 116, 116);
  g.fillStyle = '#ffc06a';
  g.font = 'bold 84px monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(letter, 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// -- the yard --------------------------------------------------------------

export function buildYard(scene) {
  const colliders = [];
  const solids = []; // meshes bullets can hit: walls, containers, crates, ground
  const group = new THREE.Group();
  scene.add(group);

  const addBox = (x, z, w, d, h, material, y = 0, collide = true) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    solids.push(mesh);
    if (collide) {
      colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY: y, maxY: y + h });
    }
    return mesh;
  };

  // Ground and painted lane guides.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(44, 36),
    new THREE.MeshStandardMaterial({ color: ASPHALT, roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  solids.push(ground);
  const laneMat = new THREE.MeshBasicMaterial({ color: 0x8a7a3a, transparent: true, opacity: 0.5 });
  for (const x of [-13.5, 0, 13.5]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 33), laneMat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(x, 0.02, 0);
    group.add(strip);
  }

  // Perimeter walls.
  const wallMat = new THREE.MeshStandardMaterial({ color: WALL, roughness: 0.9 });
  addBox(0, -18.3, 44.6, 0.6, 4.2, wallMat);
  addBox(0, 18.3, 44.6, 0.6, 4.2, wallMat);
  addBox(-22.3, 0, 0.6, 36.6, 4.2, wallMat);
  addBox(22.3, 0, 0.6, 36.6, 4.2, wallMat);

  // Shipping containers. [x, z, w, d, h, y, colorIndex]
  const boxes = [
    [-18.6, 10, 2.4, 6, 2.6, 0, 0], [-18.6, 0, 2.4, 6, 2.6, 0, 1],
    [-18.6, -8, 2.4, 6, 2.6, 0, 2], [-11, 6, 2.4, 5, 2.6, 0, 0],
    [-11, -4, 2.4, 5, 2.6, 0, 1], [-13, -13.5, 6, 2.4, 2.6, 0, 3],
    [-20, -13.5, 2.4, 2.4, 2.6, 0, 2], [-18.6, 0, 2.4, 6, 2.6, 2.6, 4],
    [18.6, 10, 2.4, 6, 2.6, 0, 1], [18.6, 0, 2.4, 6, 2.6, 0, 0],
    [18.6, -8, 2.4, 6, 2.6, 0, 1], [11, 6, 2.4, 5, 2.6, 0, 2],
    [11, -4, 2.4, 5, 2.6, 0, 0], [13, -13.5, 6, 2.4, 2.6, 0, 3],
    [20, -13.5, 2.4, 2.4, 2.6, 0, 1], [18.6, 0, 2.4, 6, 2.6, 2.6, 4],
    [-5.5, 0, 5, 2.4, 2.6, 0, 0], [5.5, 0, 5, 2.4, 2.6, 0, 1],
    [-5.5, 0, 5, 2.4, 2.6, 2.6, 2], [0, -11, 5, 2.4, 1.3, 0, 3],
  ];
  for (const [x, z, w, d, h, y, ci] of boxes) {
    const color = CONTAINER_COLORS[ci % CONTAINER_COLORS.length];
    const mat = new THREE.MeshStandardMaterial({ map: corrugated(color), roughness: 0.75, metalness: 0.25 });
    addBox(x, z, w, d, h, mat, y);
  }

  // Wooden crates.
  const crateMat = new THREE.MeshStandardMaterial({ color: CRATE, roughness: 0.9 });
  const crates = [
    [-8, 10, 1], [8, 10, 1], [-8, -8, 1], [8, -8, 1], [0, 8, 1],
    [0, 8, 2], [-2, -13, 1], [2, -13, 1], [-14, 8, 1], [14, 8, 1],
    [-20, 2, 1], [20, 2, 1],
  ];
  for (const [x, z, level] of crates) {
    addBox(x, z, 1.15, 1.15, 1.15, crateMat, (level - 1) * 1.15);
  }

  // Yard lamps: two warm pools of light over mid yard.
  for (const x of [-8, 8]) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.12, 5.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.6, metalness: 0.6 }),
    );
    pole.position.set(x, 2.6, 0);
    pole.castShadow = true;
    group.add(pole);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.18, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x332e22, emissive: LAMP_WARM, emissiveIntensity: 1.4 }),
    );
    head.position.set(x, 5.25, 0);
    group.add(head);
    const light = new THREE.PointLight(LAMP_WARM, 26, 17, 1.8);
    light.position.set(x, 5.0, 0);
    scene.add(light);
  }

  // Bomb sites: glowing rings on the asphalt and a letter board each.
  const sites = {
    A: { x: -16.5, z: -12, r: 2.6 },
    B: { x: 16.5, z: -12, r: 2.6 },
  };
  for (const [key, s] of Object.entries(sites)) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(s.r - 0.18, s.r, 40),
      new THREE.MeshBasicMaterial({ color: 0xffc06a, transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(s.x, 0.03, s.z);
    group.add(ring);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(s.r - 0.18, 40),
      new THREE.MeshBasicMaterial({ color: 0xffc06a, transparent: true, opacity: 0.08, side: THREE.DoubleSide }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(s.x, 0.03, s.z);
    group.add(disc);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 1.6),
      new THREE.MeshBasicMaterial({ map: letterSign(key), transparent: true }),
    );
    board.position.set(s.x, 3.1, s.z - 1.6);
    group.add(board);
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 3.1, 6),
      new THREE.MeshStandardMaterial({ color: 0x222226 }),
    );
    post.position.set(s.x, 1.55, s.z - 1.6);
    group.add(post);
  }

  // Skyline beyond the walls: a gantry crane and distant stacks, silhouettes.
  const skyMat = new THREE.MeshBasicMaterial({ color: 0x141828 });
  const crane = new THREE.Group();
  const legGeo = new THREE.BoxGeometry(1.2, 20, 1.2);
  for (const x of [-14, 14]) {
    const leg = new THREE.Mesh(legGeo, skyMat);
    leg.position.set(x, 10, -26);
    crane.add(leg);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(34, 1.6, 1.6), skyMat);
  beam.position.set(0, 19, -26);
  crane.add(beam);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 3), skyMat);
  cab.position.set(6, 16.5, -26);
  crane.add(cab);
  scene.add(crane);
  for (const [x, z, w, h] of [[-30, -24, 8, 6], [26, -25, 10, 8], [-8, -28, 12, 5], [34, 8, 6, 9], [-34, 10, 7, 7]]) {
    const stack = new THREE.Mesh(new THREE.BoxGeometry(w, h, 4), skyMat);
    stack.position.set(x, h / 2, z);
    scene.add(stack);
  }
  // Low dusk sun disc on the horizon.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(4.5, 32),
    new THREE.MeshBasicMaterial({ color: 0xff9a4a, fog: false }),
  );
  sunDisc.position.set(-30, 7, -60);
  sunDisc.lookAt(0, 7, 0);
  scene.add(sunDisc);

  // -- waypoints -----------------------------------------------------------
  // Nodes the bots route over. Edges are listed by node id.
  const waypointDefs = [
    ['emberSpawn', 0, 15.5, ['westLow', 'midLow', 'eastLow']],
    ['westLow', -13.5, 12, ['westMid']],
    ['westMid', -13.5, 4, ['westHigh', 'midGap']],
    ['westHigh', -13.5, -5, ['aApproach', 'westConnector']],
    ['aApproach', -13.5, -9.5, ['aSite']],
    ['aSite', -16.5, -12, ['ashSpawn', 'westConnector']],
    ['midLow', 0, 12, ['midGap']],
    ['midGap', 0, 4, ['midHigh', 'westMid', 'eastMid']],
    ['midHigh', 0, -4, ['midNorth', 'westConnector', 'eastConnector']],
    ['midNorth', 0, -9, ['ashSpawn']],
    ['eastLow', 13.5, 12, ['eastMid']],
    ['eastMid', 13.5, 4, ['eastHigh', 'midGap']],
    ['eastHigh', 13.5, -5, ['bApproach', 'eastConnector']],
    ['bApproach', 13.5, -9.5, ['bSite']],
    ['bSite', 16.5, -12, ['ashSpawn', 'eastConnector']],
    ['westConnector', -9, -8, ['midNorth', 'aApproach']],
    ['eastConnector', 9, -8, ['midNorth', 'bApproach']],
    ['ashSpawn', 0, -15.5, ['midNorth', 'aSite', 'bSite']],
  ];
  const waypoints = waypointDefs.map(([id, x, z, edges]) => ({ id, x, z, edges }));

  // Spawn points: five spread positions per team.
  const spawns = {
    ember: [-8, -4, 0, 4, 8].map((x) => ({ x, z: 15.5 })),
    ash: [-8, -4, 0, 4, 8].map((x) => ({ x, z: -15.5 })),
  };

  // -- queries ---------------------------------------------------------------

  function collideCircle(pos, radius) {
    // Push a circle (XZ) out of every AABB it overlaps. Returns true if
    // any push happened. Called per axis so sliding along walls works.
    let hit = false;
    for (const c of colliders) {
      const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      hit = true;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radius;
        pos.z = cz + (dz / d) * radius;
      } else {
        // Center inside the box: shove out along the smallest overlap.
        const pushL = pos.x - c.minX + radius;
        const pushR = c.maxX - pos.x + radius;
        const pushB = pos.z - c.minZ + radius;
        const pushF = c.maxZ - pos.z + radius;
        const m = Math.min(pushL, pushR, pushB, pushF);
        if (m === pushL) pos.x = c.minX - radius;
        else if (m === pushR) pos.x = c.maxX + radius;
        else if (m === pushB) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
    return hit;
  }

  function segmentBlocked(ax, ay, az, bx, by, bz) {
    // Slab test: does the segment cross any solid AABB?
    for (const c of colliders) {
      let t0 = 0;
      let t1 = 1;
      const dx = bx - ax;
      const dy = by - ay;
      const dz = bz - az;
      const mins = [c.minX, c.minY, c.minZ];
      const maxs = [c.maxX, c.maxY, c.maxZ];
      const origins = [ax, ay, az];
      const dirs = [dx, dy, dz];
      let blocked = true;
      for (let i = 0; i < 3; i += 1) {
        if (Math.abs(dirs[i]) < 1e-9) {
          if (origins[i] < mins[i] || origins[i] > maxs[i]) { blocked = false; break; }
        } else {
          let ta = (mins[i] - origins[i]) / dirs[i];
          let tb = (maxs[i] - origins[i]) / dirs[i];
          if (ta > tb) { const t = ta; ta = tb; tb = t; }
          t0 = Math.max(t0, ta);
          t1 = Math.min(t1, tb);
          if (t0 > t1) { blocked = false; break; }
        }
      }
      if (blocked) return true;
    }
    return false;
  }

  function hasLineOfSight(ax, az, bx, bz) {
    const eye = 1.5;
    return !segmentBlocked(ax, eye, az, bx, eye, bz);
  }

  function nearestWaypoint(x, z) {
    let best = waypoints[0];
    let bestD = Infinity;
    for (const w of waypoints) {
      const d = (w.x - x) ** 2 + (w.z - z) ** 2;
      if (d < bestD) { bestD = d; best = w; }
    }
    return best;
  }

  function bfsPath(fromId, toId) {
    if (fromId === toId) return [fromId];
    const byId = new Map(waypoints.map((w) => [w.id, w]));
    const prev = new Map([[fromId, null]]);
    const queue = [fromId];
    while (queue.length > 0) {
      const cur = queue.shift();
      for (const next of byId.get(cur).edges) {
        if (prev.has(next)) continue;
        prev.set(next, cur);
        if (next === toId) {
          const path = [toId];
          let n = cur;
          while (n !== null) { path.unshift(n); n = prev.get(n); }
          return path;
        }
        queue.push(next);
      }
    }
    return [fromId];
  }

  return {
    colliders, solids, waypoints, sites, spawns,
    bounds: { minX: -21.5, maxX: 21.5, minZ: -17.5, maxZ: 17.5 },
    collideCircle, hasLineOfSight, nearestWaypoint, bfsPath,
  };
}
