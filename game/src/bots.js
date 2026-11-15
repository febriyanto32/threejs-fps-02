// EMBERLINE — the bots. Four Ember bots fight beside you, five Ash bots
// defend the yard. Each bot routes over the waypoint graph with BFS, holds
// a site or a lane, acquires targets with a human-like delay, fires in
// bursts with range-based error, strafes while it shoots, plants and
// defuses the charge, and picks the charge up when its carrier falls.

import * as THREE from 'three';
import { CONFIG, WEAPONS, BOT_NAMES, TEAMS } from './config.js';
import { resolveShot, applySpread } from './weapons.js';

const EYE = 1.5;

function nameSprite(name, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(8,10,16,0.72)';
  g.beginPath();
  g.roundRect(28, 8, 200, 48, 10);
  g.fill();
  g.fillStyle = '#' + color.toString(16).padStart(6, '0');
  g.font = 'bold 30px monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(name, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(1.7, 0.42, 1);
  return sprite;
}

// ---------------------------------------------------------------------------
// One bot
// ---------------------------------------------------------------------------

export class Bot {
  constructor({ scene, yard, sound, match, team, name, index }) {
    this.scene = scene;
    this.yard = yard;
    this.sound = sound;
    this.match = match;
    this.team = team;
    this.name = name;
    this.index = index;

    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.hp = CONFIG.bot.health;
    this.alive = true;
    this.isCarrier = false;

    this.role = 'hold';
    this.site = 'A';
    this.path = [];
    this.pathIndex = 0;
    this.repathTimer = 0;
    this.objective = null;

    this.target = null;
    this.acquireTimer = 0;
    this.burstLeft = 0;
    this.burstTimer = 0;
    this.burstPause = 0;
    this.strafeDir = 1;
    this.strafeTimer = 0;
    this.investigate = null;
    this.investigateTimer = 0;

    this.channel = null; // { kind: 'plant'|'defuse', progress, seconds }
    this.fireTimer = 0;
    this.mag = 0;
    this.reserve = 0;
    this.reloadTimer = 0;
    this.stepTimer = 0;

    this.weapon = this._pickWeapon();
    this.mag = this.weapon.mag;
    this.reserve = this.weapon.reserve;

    this.group = this._buildMesh();
    scene.add(this.group);
  }

  _pickWeapon() {
    const table = {
      ember: ['vk47', 'kestrel', 'breacher', 'longbow'],
      ash: ['vk47', 'vk47', 'kestrel', 'breacher', 'longbow'],
    };
    return WEAPONS[table[this.team][this.index % table[this.team].length]];
  }

  _buildMesh() {
    const group = new THREE.Group();
    const teamColor = TEAMS[this.team].color;
    const suit = new THREE.MeshStandardMaterial({ color: this.team === 'ember' ? 0x4a3a28 : 0x2c3a4a, roughness: 0.85 });
    const trim = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.5, emissive: teamColor, emissiveIntensity: 0.35 });
    const skin = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.8 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.36), suit);
    torso.position.y = 1.05;
    torso.castShadow = true;
    torso.userData = { bot: this, part: 'body' };
    group.add(torso);
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.3, 0.4), trim);
    vest.position.y = 1.18;
    vest.userData = { bot: this, part: 'body' };
    group.add(vest);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), skin);
    head.position.y = 1.66;
    head.castShadow = true;
    head.userData = { bot: this, part: 'head' };
    group.add(head);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.36), trim);
    visor.position.y = 1.68;
    visor.userData = { bot: this, part: 'head' };
    group.add(visor);
    const legs = [];
    for (const s of [-0.16, 0.16]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.22), suit);
      leg.position.set(s, 0.31, 0);
      leg.userData = { bot: this, part: 'body' };
      group.add(leg);
      legs.push(leg);
    }
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.72), new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.5, metalness: 0.6 }));
    gun.position.set(0.28, 1.18, 0.3);
    group.add(gun);
    this.gunMesh = gun;

    const tag = nameSprite(this.name, teamColor);
    tag.position.y = 2.15;
    group.add(tag);
    this.tag = tag;

    this.hitMeshes = [torso, vest, head, visor, ...legs];
    return group;
  }

  spawnAt(x, z, yaw) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.hp = CONFIG.bot.health;
    this.alive = true;
    this.channel = null;
    this.target = null;
    this.mag = this.weapon.mag;
    this.reserve = this.weapon.reserve;
    this.group.visible = true;
    this.group.rotation.set(0, yaw, 0);
    this.group.position.copy(this.pos);
  }

  takeDamage(amount, part, attacker) {
    if (!this.alive) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.channel = null;
      this.group.rotation.set(0, this.yaw, Math.PI / 2);
      this.group.position.y = 0.25;
      this.match.onKill(attacker, this, part);
    }
  }

  eyePos() {
    return new THREE.Vector3(this.pos.x, EYE, this.pos.z);
  }

  // -- routing ---------------------------------------------------------------

  setObjective(kind, siteOrPos) {
    this.objective = { kind, siteOrPos };
    this._repath();
  }

  _repath() {
    if (!this.objective) return;
    const from = this.yard.nearestWaypoint(this.pos.x, this.pos.z);
    let toId;
    if (this.objective.kind === 'site') toId = this.objective.siteOrPos === 'A' ? 'aSite' : 'bSite';
    else if (this.objective.kind === 'waypoint') toId = this.objective.siteOrPos;
    else if (this.objective.kind === 'pos') toId = this.yard.nearestWaypoint(this.objective.siteOrPos.x, this.objective.siteOrPos.z).id;
    else return;
    this.path = this.yard.bfsPath(from.id, toId).map((id) => {
      const w = this.yard.waypoints.find((n) => n.id === id);
      return { x: w.x, z: w.z };
    });
    this.pathIndex = 0;
  }

  _followPath(dt, speed) {
    if (this.pathIndex >= this.path.length) return new THREE.Vector3(0, 0, 0);
    const node = this.path[this.pathIndex];
    const dx = node.x - this.pos.x;
    const dz = node.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.7) {
      this.pathIndex += 1;
      return new THREE.Vector3(0, 0, 0);
    }
    return new THREE.Vector3(dx / d, 0, dz / d).multiplyScalar(speed);
  }

  // -- combat ------------------------------------------------------------------

  _scan(ctx) {
    // Find the nearest visible enemy. Bots see through nothing: the yard's
    // line-of-sight test decides.
    const enemies = ctx.enemies(this);
    let best = null;
    let bestD = Infinity;
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
      if (d > this.weapon.range) continue;
      if (!this.yard.hasLineOfSight(this.pos.x, this.pos.z, e.pos.x, e.pos.z)) continue;
      if (d < bestD) { bestD = d; best = e; }
    }
    if (best && this.target !== best) {
      this.acquireTimer = CONFIG.bot.reactMin + Math.random() * (CONFIG.bot.reactMax - CONFIG.bot.reactMin);
    }
    this.target = best;
    this.targetDist = bestD;
  }

  _combatMove(dt, ctx) {
    // Strafe across the target's line of fire, and keep a fighting range.
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeDir = Math.random() < 0.5 ? -1 : 1;
      this.strafeTimer = 0.7 + Math.random() * 0.7;
    }
    const t = this.target;
    const dx = t.pos.x - this.pos.x;
    const dz = t.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const nx = dx / d;
    const nz = dz / d;
    // Perpendicular strafe, plus a closing/backing component by range.
    let mx = -nz * this.strafeDir;
    let mz = nx * this.strafeDir;
    if (d > 18) { mx += nx * 0.7; mz += nz * 0.7; }
    if (d < 6) { mx -= nx * 0.7; mz -= nz * 0.7; }
    const l = Math.hypot(mx, mz) || 1;
    return new THREE.Vector3(mx / l, 0, mz / l).multiplyScalar(CONFIG.bot.walkSpeed * 0.8);
  }

  _fireAt(dt, ctx) {
    if (this.acquireTimer > 0) {
      this.acquireTimer -= dt;
      return;
    }
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const need = this.weapon.mag - this.mag;
        const take = Math.min(need, this.reserve);
        this.mag += take;
        this.reserve -= take;
      }
      return;
    }
    if (this.burstPause > 0) {
      this.burstPause -= dt;
      return;
    }
    if (this.burstLeft <= 0) {
      this.burstLeft = CONFIG.bot.burstMin + Math.floor(Math.random() * (CONFIG.bot.burstMax - CONFIG.bot.burstMin));
    }
    this.fireTimer -= dt;
    if (this.fireTimer > 0) return;
    if (this.mag <= 0) {
      this.reloadTimer = this.weapon.reloadSeconds;
      return;
    }
    this.fireTimer = 60 / this.weapon.rpm;
    this.burstLeft -= 1;
    if (this.burstLeft <= 0) this.burstPause = CONFIG.bot.burstPause;
    this.mag -= 1;

    const eye = this.eyePos();
    const targetPos = new THREE.Vector3(this.target.pos.x, 1.35, this.target.pos.z);
    const baseDir = targetPos.sub(eye).normalize();
    const errorDeg = CONFIG.bot.aimErrorDeg + this.targetDist * 0.06;
    const dir = applySpread(baseDir, errorDeg);
    const muzzle = eye.clone().addScaledVector(baseDir, 0.7);
    const targets = ctx.hitMeshes().filter((m) => m.userData.bot !== this);
    const hit = resolveShot(eye, dir, this.weapon.range, targets, this.yard.solids);
    ctx.tracers.add(muzzle, hit.point, this.team === 'ember' ? 0xffc46a : 0x9ac8ff);
    this.sound.distantShot();
    if (hit.kind === 'bot') {
      const dmg = this.weapon.damage * (hit.part === 'head' ? this.weapon.headMult : 1);
      ctx.match.applyDamage(hit.bot, dmg, hit.part, this);
    }
    ctx.match.heardShot(this.pos);
  }

  // -- the brain, one fixed step ----------------------------------------------

  update(dt, ctx) {
    if (!this.alive) return;
    const match = ctx.match;
    if (!match.isLive()) {
      this.group.position.copy(this.pos);
      return;
    }

    this._scan(ctx);
    this.repathTimer -= dt;
    if (this.repathTimer <= 0) {
      this.repathTimer = 2;
      if (this.objective && !this.target) this._repath();
    }

    // A channel (plant/defuse) holds the bot still.
    if (this.channel) {
      this.channel.progress += dt;
      const s = this.yard.sites[match.charge.site];
      const inSite = Math.hypot(this.pos.x - s.x, this.pos.z - s.z) <= s.r + 0.4;
      const done = this.channel.progress >= this.channel.seconds;
      if (!inSite && !done) {
        this.channel = null;
      } else if (done) {
        if (this.channel.kind === 'plant') match.plantComplete(this);
        else match.defuseComplete(this);
        this.channel = null;
      } else {
        if (this.channel.kind === 'plant') this.sound.plantBeep();
        else if (Math.floor(this.channel.progress * 4) !== Math.floor((this.channel.progress - dt) * 4)) this.sound.defuseBeep();
      }
      this._syncMesh();
      return;
    }

    let move = new THREE.Vector3(0, 0, 0);
    const charge = match.charge;

    if (this.target) {
      // Face the enemy and fight.
      const dx = this.target.pos.x - this.pos.x;
      const dz = this.target.pos.z - this.pos.z;
      this.yaw = Math.atan2(dx, dz);
      move = this._combatMove(dt, ctx);
      this._fireAt(dt, ctx);
    } else {
      // Objective behaviour.
      if (this.team === 'ember') {
        if (charge.state === 'dropped') {
          const d = Math.hypot(charge.x - this.pos.x, charge.z - this.pos.z);
          if (d < 1.3) {
            match.pickupCharge(this);
          } else if (this.objective?.kind !== 'pos' || this.repathTimer <= 0.01) {
            this.setObjective('pos', { x: charge.x, z: charge.z });
          }
          move = this._followPath(dt, CONFIG.bot.runSpeed);
        } else if (charge.state === 'planted') {
          if (this.objective?.kind !== 'site') this.setObjective('site', charge.site);
          move = this._followPath(dt, CONFIG.bot.walkSpeed);
        } else if (this.isCarrier) {
          const s = this.yard.sites[this.site];
          const d = Math.hypot(s.x - this.pos.x, s.z - this.pos.z);
          if (d <= s.r) {
            this.channel = { kind: 'plant', progress: 0, seconds: CONFIG.round.plantSeconds };
          } else {
            if (this.objective?.kind !== 'site') this.setObjective('site', this.site);
            move = this._followPath(dt, CONFIG.bot.runSpeed);
          }
        } else {
          // Escort: head for the same site, one lane over.
          if (this.objective?.kind !== 'site') this.setObjective('site', this.site);
          move = this._followPath(dt, CONFIG.bot.walkSpeed);
        }
      } else {
        // Ash defends.
        if (charge.state === 'planted') {
          const s = this.yard.sites[charge.site];
          const d = Math.hypot(s.x - this.pos.x, s.z - this.pos.z);
          if (d <= 1.6) {
            this.channel = { kind: 'defuse', progress: 0, seconds: CONFIG.round.defuseSeconds };
          } else {
            if (this.objective?.kind !== 'site' || this.objective.siteOrPos !== charge.site) {
              this.setObjective('site', charge.site);
            }
            move = this._followPath(dt, CONFIG.bot.runSpeed);
          }
        } else {
          if (this.role === 'roam') {
            if (this.investigate && this.investigateTimer > 0) {
              this.investigateTimer -= dt;
              if (this.objective?.kind !== 'pos') this.setObjective('pos', this.investigate);
              move = this._followPath(dt, CONFIG.bot.runSpeed);
            } else if (this.objective?.kind !== 'waypoint') {
              this.setObjective('waypoint', 'midGap');
              move = this._followPath(dt, CONFIG.bot.walkSpeed);
            } else {
              move = this._followPath(dt, CONFIG.bot.walkSpeed);
              if (this.pathIndex >= this.path.length) {
                this.setObjective('waypoint', this.objective.siteOrPos === 'midGap' ? 'midHigh' : 'midGap');
              }
            }
          } else {
            // Hold near the assigned site.
            const s = this.yard.sites[this.site];
            const hx = s.x + (this.index % 2 === 0 ? -2.5 : 2.5);
            const hz = s.z + 2.5;
            const d = Math.hypot(hx - this.pos.x, hz - this.pos.z);
            if (d > 0.8) {
              const dir = new THREE.Vector3(hx - this.pos.x, 0, hz - this.pos.z).normalize();
              move = dir.multiplyScalar(CONFIG.bot.walkSpeed);
            }
          }
        }
      }
    }

    // Integrate movement with collision.
    this.vel.copy(move);
    this.pos.addScaledVector(this.vel, dt);
    this.yard.collideCircle(this.pos, CONFIG.bot.radius);
    const b = this.yard.bounds;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, b.minX, b.maxX);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, b.minZ, b.maxZ);
    if (move.lengthSq() > 0.01) {
      this.yaw = Math.atan2(move.x, move.z);
      this.stepTimer -= dt * move.length();
      if (this.stepTimer <= 0) {
        this.stepTimer = 3.4;
        this.sound.step();
      }
    }
    this._syncMesh();
  }

  _syncMesh() {
    this.group.position.copy(this.pos);
    this.group.rotation.set(0, this.yaw, this.alive ? 0 : Math.PI / 2);
  }
}

// ---------------------------------------------------------------------------
// The squad: spawns both teams, assigns roles, routes the charge
// ---------------------------------------------------------------------------

export class BotSquad {
  constructor({ scene, yard, sound, match, player }) {
    this.scene = scene;
    this.yard = yard;
    this.sound = sound;
    this.match = match;
    this.player = player;
    this.bots = [];
    this.hud = null;
    this._spawnAll();
  }

  _spawnAll() {
    const emberNames = BOT_NAMES.ember;
    const ashNames = BOT_NAMES.ash;
    for (let i = 0; i < 4; i += 1) {
      this.bots.push(new Bot({
        scene: this.scene, yard: this.yard, sound: this.sound, match: this.match,
        team: 'ember', name: emberNames[i], index: i,
      }));
    }
    for (let i = 0; i < 5; i += 1) {
      this.bots.push(new Bot({
        scene: this.scene, yard: this.yard, sound: this.sound, match: this.match,
        team: 'ash', name: ashNames[i], index: i,
      }));
    }
  }

  all() {
    return this.bots;
  }

  alive(team) {
    return this.bots.filter((b) => b.team === team && b.alive);
  }

  hitMeshes() {
    const out = [];
    for (const b of this.bots) {
      if (b.alive) out.push(...b.hitMeshes);
    }
    return out;
  }

  // Place both teams for a round and hand out roles. Ember attacks the
  // site the round number picks; Ash splits across both sites with one
  // mid roamer. The charge goes to a random Ember bot.
  placeForRound(roundNumber) {
    const site = roundNumber % 2 === 1 ? 'A' : 'B';
    const emberBots = this.bots.filter((b) => b.team === 'ember');
    const ashBots = this.bots.filter((b) => b.team === 'ash');
    const carrier = emberBots[Math.floor(Math.random() * emberBots.length)];
    emberBots.forEach((b, i) => {
      const s = this.yard.spawns.ember[i + 1];
      b.spawnAt(s.x, s.z, Math.PI);
      b.site = site;
      b.isCarrier = b === carrier;
      b.role = 'attack';
      b.setObjective('site', site);
    });
    ashBots.forEach((b, i) => {
      const s = this.yard.spawns.ash[i];
      b.spawnAt(s.x, s.z, 0);
      b.isCarrier = false;
      if (i === 4) {
        b.role = 'roam';
        b.site = site;
        b.setObjective('waypoint', 'midGap');
      } else {
        b.role = 'hold';
        b.site = i < 2 ? 'A' : 'B';
        b.setObjective('waypoint', b.site === 'A' ? 'aSite' : 'bSite');
      }
    });
    return carrier;
  }

  hearShot(pos) {
    for (const b of this.bots) {
      if (!b.alive || b.team !== 'ash' || b.role !== 'roam') continue;
      const d = Math.hypot(pos.x - b.pos.x, pos.z - b.pos.z);
      if (d < CONFIG.bot.hearRadius) {
        b.investigate = { x: pos.x, z: pos.z };
        b.investigateTimer = 5;
      }
    }
  }

  update(dt, ctx) {
    for (const b of this.bots) b.update(dt, ctx);
  }
}
