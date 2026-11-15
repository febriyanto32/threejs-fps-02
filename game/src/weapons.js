// EMBERLINE — weapons: the five guns plus the frag, their viewmodels,
// and the shared ballistics. Spread grows with movement, with bloom from
// sustained fire, and shrinks when you crouch or stand still and aim —
// stopping to aim pays. Headshots multiply damage by four.

import * as THREE from 'three';
import { WEAPONS } from './config.js';

export { WEAPONS };

// -- spread and recoil -------------------------------------------------------

export function spreadAngle(def, moveSpeed, crouched, airborne, bloom, aiming) {
  // Base cone, widened by speed and bloom, tightened by crouch and aim.
  let spread = def.spread;
  spread += (moveSpeed / 5.4) * def.moveSpread;
  spread += bloom * def.bloom * 4;
  if (crouched) spread *= 0.7;
  if (airborne) spread += 2.5;
  if (aiming) spread *= 0.55;
  return spread; // degrees
}

export function applySpread(direction, spreadDeg) {
  // Jitter a unit direction inside a cone of the given half-angle.
  const half = THREE.MathUtils.degToRad(spreadDeg);
  const r = Math.sqrt(Math.random()) * half;
  const a = Math.random() * Math.PI * 2;
  const right = new THREE.Vector3(1, 0, 0).cross(direction).normalize();
  if (right.lengthSq() < 0.01) right.set(1, 0, 0);
  const up = new THREE.Vector3().crossVectors(direction, right).normalize();
  const out = direction.clone();
  out.addScaledVector(right, Math.cos(a) * r);
  out.addScaledVector(up, Math.sin(a) * r);
  return out.normalize();
}

// -- viewmodel -----------------------------------------------------------------

export function makeViewModel(def) {
  // A low-poly gun built from boxes, held at the bottom-right of the view.
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.55, metalness: 0.55 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.5, metalness: 0.6 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 0.8 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, def.barrel + 0.18), bodyMat);
  group.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, def.barrel, 8), darkMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -(def.barrel / 2 + 0.08));
  group.add(barrel);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.09), def.kind === 'rifle' ? woodMat : darkMat);
  grip.position.set(0, -0.13, 0.1);
  grip.rotation.x = 0.3;
  group.add(grip);
  if (def.kind === 'sniper') {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 10), darkMat);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.1, -0.05);
    group.add(scope);
  }
  if (def.kind === 'shotgun') {
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.22), woodMat);
    pump.position.set(0, -0.06, -0.3);
    group.add(pump);
  }
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.08), darkMat);
  mag.position.set(0, -0.13, -0.06);
  mag.rotation.x = -0.12;
  group.add(mag);

  // Muzzle flash: an additive star that lives for one frame or two.
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffc46a, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), flashMat);
  flash.position.set(0, 0.02, -(def.barrel + 0.16));
  group.add(flash);

  group.position.set(0.34, -0.3, -0.55);
  return {
    group, flash, flashMat,
    kick: 0,
    bobPhase: 0,
    update(dt, moveSpeed, aiming) {
      this.kick = Math.max(0, this.kick - dt * 6);
      this.bobPhase += dt * moveSpeed * 1.6;
      const bob = Math.min(1, moveSpeed / 5) * 0.012;
      group.position.y = -0.3 + Math.sin(this.bobPhase * 2) * bob + this.kick * 0.05;
      group.position.z = -0.55 + this.kick * 0.09;
      group.rotation.x = this.kick * 0.22;
      if (aiming) {
        group.position.x += (0.02 - group.position.x) * Math.min(1, dt * 10);
        group.position.y += (-0.22 - group.position.y) * Math.min(1, dt * 10);
      } else {
        group.position.x += (0.34 - group.position.x) * Math.min(1, dt * 10);
      }
      flashMat.opacity = Math.max(0, flashMat.opacity - dt * 18);
      flash.rotation.z += dt * 9;
    },
    fire() {
      this.kick = Math.min(1, this.kick + 0.55);
      flashMat.opacity = 0.95;
      flash.rotation.z = Math.random() * Math.PI;
      const s = 0.8 + Math.random() * 0.5;
      flash.scale.set(s, s, s);
    },
  };
}

// -- hit resolution ----------------------------------------------------------

const _ray = new THREE.Raycaster();

export function resolveShot(origin, direction, maxRange, hitMeshes, worldMeshes) {
  // Returns the first thing the bullet meets: a bot part, or the world.
  _ray.set(origin, direction);
  _ray.far = maxRange;
  const botHits = _ray.intersectObjects(hitMeshes, false);
  const worldHits = _ray.intersectObjects(worldMeshes, false);
  const bh = botHits[0] || null;
  const wh = worldHits[0] || null;
  if (bh && (!wh || bh.distance <= wh.distance)) {
    return { kind: 'bot', bot: bh.object.userData.bot, part: bh.object.userData.part, point: bh.point, distance: bh.distance };
  }
  if (wh) return { kind: 'world', point: wh.point, distance: wh.distance };
  return { kind: 'none', point: origin.clone().addScaledVector(direction, maxRange), distance: maxRange };
}

// -- tracers -------------------------------------------------------------------

export class Tracers {
  constructor(scene) {
    this.scene = scene;
    this.lines = [];
  }

  add(from, to, color = 0xffe1a0) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.lines.push({ line, life: 0.09 });
  }

  update(dt) {
    for (let i = this.lines.length - 1; i >= 0; i -= 1) {
      const t = this.lines[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.85;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        this.lines.splice(i, 1);
      }
    }
  }
}

// -- grenade -------------------------------------------------------------------

export class Grenade {
  constructor(scene, yard, sound, pos, vel, owner) {
    this.scene = scene;
    this.yard = yard;
    this.sound = sound;
    this.owner = owner;
    this.pos = pos.clone();
    this.vel = vel.clone();
    this.fuse = 2.1;
    this.bounced = false;
    this.done = false;
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x2c4426, roughness: 0.5, metalness: 0.5 }),
    );
    this.mesh.position.copy(this.pos);
    scene.add(this.mesh);
  }

  update(dt, onExplode) {
    if (this.done) return;
    this.vel.y -= 13.5 * dt;
    this.pos.addScaledVector(this.vel, dt);
    this.yard.collideCircle(this.pos, 0.1);
    if (this.pos.y < 0.09) {
      this.pos.y = 0.09;
      if (Math.abs(this.vel.y) > 1.5 && !this.bounced) {
        this.sound.grenadeBounce();
        this.bounced = true;
      }
      this.vel.y = Math.abs(this.vel.y) * 0.35;
      this.vel.x *= 0.6;
      this.vel.z *= 0.6;
    }
    const b = this.yard.bounds;
    if (this.pos.x < b.minX || this.pos.x > b.maxX) this.vel.x *= -0.4;
    if (this.pos.z < b.minZ || this.pos.z > b.maxZ) this.vel.z *= -0.4;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, b.minX, b.maxX);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, b.minZ, b.maxZ);
    this.mesh.position.copy(this.pos);
    this.fuse -= dt;
    if (this.fuse <= 0) {
      this.done = true;
      this.scene.remove(this.mesh);
      onExplode(this.pos, this.owner);
    }
  }
}
