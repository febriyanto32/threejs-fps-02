// EMBERLINE — the player: Ember's fifth operator. Mouse look, WASD with
// acceleration and friction, crouch and jump, collision against the yard,
// and the gunplay: recoil, bloom, spread that punishes firing on the move,
// headshots, reloads, and a frag on key 4.

import * as THREE from 'three';
import { CONFIG, WEAPONS } from './config.js';
import { makeViewModel, spreadAngle, applySpread, resolveShot, Grenade } from './weapons.js';

const EYE_STAND = CONFIG.player.eyeStanding;
const EYE_CROUCH = CONFIG.player.eyeCrouch;

export class Player {
  constructor({ scene, yard, sound, match }) {
    this.scene = scene;
    this.yard = yard;
    this.sound = sound;
    this.match = match;
    this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 200);
    scene.add(this.camera);

    this.pos = new THREE.Vector3(0, 0, 15.5);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = true;
    this.crouched = false;
    this.eyeHeight = EYE_STAND;
    this.hp = CONFIG.player.health;
    this.alive = true;
    this.team = 'ember';

    this.triggerDown = false;
    this.aiming = false;
    this.fireTimer = 0;
    this.reloadTimer = 0;
    this.bloom = 0;
    this.stepTimer = 0;
    this.moveSpeed = 0;

    // Loadout: slot 0 primary (empty at first), slot 1 the P9, frags.
    this.slots = [null, this._freshLoadout('p9')];
    this.slot = 1;
    this.frags = 0;
    this.viewmodel = null;
    this._equipViewmodel();
    this.hud = null;
  }

  _freshLoadout(id) {
    const def = WEAPONS[id];
    return { def, mag: def.mag, reserve: def.reserve };
  }

  _equipViewmodel() {
    const loadout = this.slots[this.slot];
    if (this.viewmodel) this.camera.remove(this.viewmodel.group);
    this.viewmodel = loadout ? makeViewModel(loadout.def) : null;
    if (this.viewmodel) this.camera.add(this.viewmodel.group);
  }

  get weapon() {
    return this.slots[this.slot];
  }

  get eyePos() {
    return new THREE.Vector3(this.pos.x, this.eyeHeight, this.pos.z);
  }

  look(dx, dy) {
    if (!this.alive) return;
    const sens = this.aiming ? 0.0011 : 0.0019;
    this.yaw -= dx * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * sens, -1.45, 1.45);
  }

  teleport(x, z, yaw = null) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    if (yaw !== null) this.yaw = yaw;
    this.pitch = 0;
  }

  selectSlot(i) {
    if (!this.alive || this.reloadTimer > 0) return;
    if (i === 0 && !this.slots[0]) return;
    if (i > 1) return;
    if (this.slot === i) return;
    this.slot = i;
    this._equipViewmodel();
    this.sound.click();
  }

  buy(id) {
    return this.match.buyWeapon(this, id);
  }

  reload() {
    const w = this.weapon;
    if (!w || !this.alive || this.reloadTimer > 0) return;
    if (w.mag >= w.def.mag || w.reserve <= 0) return;
    this.reloadTimer = w.def.reloadSeconds;
    this.sound.reload();
  }

  throwGrenade() {
    if (!this.alive || this.frags <= 0 || !this.match.isLive()) return;
    this.frags -= 1;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const pos = this.eyePos();
    const vel = dir.multiplyScalar(15).add(new THREE.Vector3(0, 3.5, 0));
    this.match.spawnGrenade(pos, vel, this);
    this.sound.grenadeThrow();
  }

  takeDamage(amount, attacker) {
    if (!this.alive || !this.match.isLive()) return;
    this.hp -= amount;
    this.sound.hurt();
    if (this.hud) this.hud.flashDamage();
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.match.onKill(attacker, this, 'body');
    }
  }

  // -- per-step --------------------------------------------------------------

  update(dt, keys) {
    // Camera follows the head, always.
    this.camera.position.set(this.pos.x, this.eyeHeight, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    if (!this.alive || !this.match.isLive()) {
      if (this.viewmodel) this.viewmodel.update(dt, 0, false);
      return;
    }

    // Wish direction from keys, rotated by yaw.
    const fwd = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let wx = -sin * fwd + cos * strafe;
    let wz = -cos * fwd - sin * strafe;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }

    this.crouched = keys.has('ControlLeft') || keys.has('KeyC');
    const targetEye = this.crouched ? EYE_CROUCH : EYE_STAND;
    this.eyeHeight += (targetEye - this.eyeHeight) * Math.min(1, dt * 12);

    const speed = this.crouched
      ? CONFIG.player.crouchSpeed
      : this.aiming ? CONFIG.player.aimSpeed : CONFIG.player.walkSpeed;
    const accel = CONFIG.player.accel;
    this.vel.x += wx * accel * dt;
    this.vel.z += wz * accel * dt;
    // Friction when no input, so you stop instead of gliding.
    if (wl === 0) {
      const f = Math.max(0, 1 - CONFIG.player.friction * dt);
      this.vel.x *= f;
      this.vel.z *= f;
    }
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (hSpeed > speed) {
      this.vel.x = (this.vel.x / hSpeed) * speed;
      this.vel.z = (this.vel.z / hSpeed) * speed;
    }
    this.moveSpeed = Math.hypot(this.vel.x, this.vel.z);

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.yard.collideCircle(this.pos, CONFIG.player.radius);
    const b = this.yard.bounds;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, b.minX, b.maxX);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, b.minZ, b.maxZ);

    // Jump and gravity.
    if (keys.has('Space') && this.onGround) {
      this.vel.y = CONFIG.player.jumpSpeed;
      this.onGround = false;
    }
    if (!this.onGround) {
      this.vel.y -= CONFIG.player.gravity * dt;
      this.pos.y += this.vel.y * dt;
      if (this.pos.y <= 0) {
        this.pos.y = 0;
        this.vel.y = 0;
        this.onGround = true;
      }
    }
    this.camera.position.y = this.eyeHeight + this.pos.y;

    // Footsteps.
    if (this.moveSpeed > 1 && this.onGround) {
      this.stepTimer -= dt * this.moveSpeed;
      if (this.stepTimer <= 0) {
        this.stepTimer = 3.2;
        this.sound.step();
      }
    }

    // Reload timer.
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const w = this.weapon;
        const need = w.def.mag - w.mag;
        const take = Math.min(need, w.reserve);
        w.mag += take;
        w.reserve -= take;
      }
    }

    // Bloom decays when you stop firing.
    this.bloom = Math.max(0, this.bloom - dt * 1.6);
    this.fireTimer -= dt;

    // Firing.
    const w = this.weapon;
    if (w && this.triggerDown && this.fireTimer <= 0 && this.reloadTimer <= 0) {
      if (w.mag <= 0) {
        this.sound.dryFire();
        this.fireTimer = 0.3;
        this.reload();
      } else {
        this._fire(w);
      }
    }

    if (this.viewmodel) this.viewmodel.update(dt, this.moveSpeed, this.aiming);

    // The planted charge is defused or planted with E; the match reads the
    // key itself. Keep the crosshair spread honest in the HUD.
    if (this.hud) {
      const def = w ? w.def : WEAPONS.p9;
      this.hud.spreadDeg = spreadAngle(def, this.moveSpeed, this.crouched, !this.onGround, this.bloom, this.aiming);
    }
  }

  _fire(w) {
    const def = w.def;
    w.mag -= 1;
    this.fireTimer = 60 / def.rpm;
    this.bloom = Math.min(1, this.bloom + 0.22);
    this.pitch += def.recoil * 0.011;
    this.yaw += (Math.random() - 0.5) * def.recoil * 0.006;
    if (this.viewmodel) this.viewmodel.fire();
    this.sound.shot(def.kind);

    const eye = this.eyePos();
    const baseDir = new THREE.Vector3();
    this.camera.getWorldDirection(baseDir);
    const muzzle = eye.clone().addScaledVector(baseDir, 0.7);
    muzzle.y -= 0.12;
    for (let p = 0; p < def.pellets; p += 1) {
      const spread = spreadAngle(def, this.moveSpeed, this.crouched, !this.onGround, this.bloom, this.aiming);
      const dir = applySpread(baseDir, spread);
      const hit = resolveShot(eye, dir, def.range, this.match.hitMeshes(), this.yard.solids);
      this.match.tracers.add(muzzle, hit.point);
      if (hit.kind === 'bot') {
        const dmg = def.damage * (hit.part === 'head' ? def.headMult : 1);
        this.match.applyDamage(hit.bot, dmg, hit.part, this);
      } else if (hit.kind === 'world') {
        this.match.spark(hit.point);
      }
    }
    this.match.heardShot(this.pos);
  }
}
