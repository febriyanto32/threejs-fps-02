// EMBERLINE — the match. One object owns the score, the money, the round
// clock, the charge and the phase machine, so the player, the bots and the
// HUD all read the same truth. Rounds: buy, live, post. First to five,
// nine rounds at most. Ember plants; Ash defends.

import * as THREE from 'three';
import { CONFIG, WEAPONS } from './config.js';
import { Tracers, Grenade } from './weapons.js';

export class Match {
  constructor({ yard, sound }) {
    this.yard = yard;
    this.sound = sound;
    this.scene = null;
    this.tracers = null;
    this.player = null;
    this.bots = null;
    this.hud = null;

    this.started = false;
    this.phase = 'menu'; // menu | buy | live | post | over
    this.roundNumber = 0;
    this.score = { ember: 0, ash: 0 };
    this.money = { ember: CONFIG.economy.startMoney, ash: 0 };
    this.lossStreak = { ember: 0, ash: 0 };
    this.roundTimer = 0;
    this.postTimer = 0;
    this.buyTimer = 0;
    this.winner = null;
    this.roundReason = '';

    // The charge: carried by one Ember operator, dropped on the ground,
    // or planted at a site with a burning fuse.
    this.charge = { state: 'none', carrier: null, site: 'A', x: 0, z: 0, fuse: 0 };
    this.plantProgress = 0;
    this.defuseProgress = 0;
    this.eHeld = false;
    this.grenades = [];
    this.sparks = [];
    this.explosionLight = null;
  }

  attach(player, bots) {
    this.player = player;
    this.bots = bots;
    this.scene = player.scene;
    this.tracers = new Tracers(this.scene);
  }

  isLive() {
    return this.phase === 'live';
  }

  // -- match lifecycle ---------------------------------------------------------

  startMatch() {
    this.started = true;
    this.score = { ember: 0, ash: 0 };
    this.money = { ember: CONFIG.economy.startMoney, ash: 0 };
    this.lossStreak = { ember: 0, ash: 0 };
    this.roundNumber = 0;
    this.winner = null;
    this.startRound();
  }

  startRound() {
    this.roundNumber += 1;
    this.phase = 'buy';
    this.buyTimer = CONFIG.round.buySeconds;
    this.plantProgress = 0;
    this.defuseProgress = 0;

    // Reset the player: full health, fresh stance, back at the spawn line.
    // Weapons and money carry over between rounds, like the real thing.
    const spawn = this.yard.spawns.ember[0];
    this.player.teleport(spawn.x, spawn.z, 0); // face north, into the yard
    this.player.hp = CONFIG.player.health;
    this.player.alive = true;

    const carrier = this.bots.placeForRound(this.roundNumber);
    this.charge = { state: 'carried', carrier, site: carrier.site, x: carrier.pos.x, z: carrier.pos.z, fuse: 0 };
    if (this.hud) {
      this.hud.banner(`ROUND ${this.roundNumber} — ${this.charge.site === 'A' ? 'SITE A' : 'SITE B'}`, 'Ember attacks. Buy up, then push.');
      this.hud.openBuy(true);
    }
  }

  endRound(winner, reason) {
    if (this.phase !== 'live' && this.phase !== 'buy') return;
    this.phase = 'post';
    this.postTimer = CONFIG.round.postSeconds;
    this.roundReason = reason;
    this.score[winner] += 1;

    // Economy: winners take the big purse, losers take the consolation
    // plus a growing streak bonus so a losing run can still buy back in.
    this.money.ember += winner === 'ember' ? CONFIG.economy.win : CONFIG.economy.loss + Math.min(CONFIG.economy.maxLossStreakBonus, this.lossStreak.ember * CONFIG.economy.lossStreakBonus);
    if (winner === 'ember') this.lossStreak.ember = 0;
    else this.lossStreak.ember += 1;

    const label = winner === 'ember' ? 'EMBER TAKES THE ROUND' : 'ASH HOLDS THE YARD';
    const reasonText = {
      elimination: 'Enemy team eliminated.',
      detonation: 'The charge detonated.',
      defused: 'The charge was defused.',
      timeout: 'Time expired with the sites safe.',
    }[reason] || reason;
    if (this.hud) this.hud.banner(label, reasonText);
    if (winner === 'ember') this.sound.roundWin();
    else this.sound.roundLose();

    if (this.score[winner] >= CONFIG.round.winRounds || this.roundNumber >= CONFIG.round.maxRounds) {
      this.winner = this.score.ember > this.score.ash ? 'ember' : 'ash';
    }
  }

  // -- per-step ------------------------------------------------------------------

  update(dt, keys) {
    this.tracers.update(dt);
    for (let i = this.sparks.length - 1; i >= 0; i -= 1) {
      const s = this.sparks[i];
      s.life -= dt;
      s.mesh.scale.setScalar(Math.max(0.01, s.life * 4));
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        this.sparks.splice(i, 1);
      }
    }
    for (let i = this.grenades.length - 1; i >= 0; i -= 1) {
      const g = this.grenades[i];
      g.update(dt, (pos, owner) => this.explodeGrenade(pos, owner));
      if (g.done) this.grenades.splice(i, 1);
    }
    if (this.explosionLight) {
      this.explosionLight.intensity = Math.max(0, this.explosionLight.intensity - dt * 30);
      if (this.explosionLight.intensity <= 0) {
        this.scene.remove(this.explosionLight);
        this.explosionLight = null;
      }
    }

    if (this.phase === 'buy') {
      this.buyTimer -= dt;
      this.player.update(dt, keys);
      if (this.buyTimer <= 0) {
        this.phase = 'live';
        this.roundTimer = CONFIG.round.liveSeconds;
        if (this.hud) this.hud.openBuy(false);
      }
      return;
    }

    if (this.phase === 'post') {
      this.postTimer -= dt;
      this.player.update(dt, keys);
      if (this.postTimer <= 0) {
        if (this.winner) {
          this.phase = 'over';
          if (this.hud) this.hud.showMatchEnd(this.winner, this.score);
          if (this.winner === 'ember') this.sound.matchWin();
          else this.sound.roundLose();
        } else {
          this.startRound();
        }
      }
      return;
    }

    if (this.phase !== 'live') return;

    // Live round.
    this.roundTimer -= dt;
    this.player.update(dt, keys);
    const ctx = this._botContext();
    this.bots.update(dt, ctx);

    // The player picks the dropped charge up by walking over it.
    if (this.charge.state === 'dropped' && this.player.alive) {
      const d = Math.hypot(this.charge.x - this.player.pos.x, this.charge.z - this.player.pos.z);
      if (d < 1.3) this.pickupCharge(this.player);
    }

    // E: plant when carrying, defuse when the charge is planted.
    this.eHeld = keys.has('KeyE');
    this._channelStep(dt);

    // Fuse burns once the charge is planted.
    if (this.charge.state === 'planted') {
      this.charge.fuse -= dt;
      if (Math.ceil(this.charge.fuse) !== Math.ceil(this.charge.fuse + dt)) this.sound.plantBeep(true);
      if (this.charge.fuse <= 0) {
        this._detonate();
        this.endRound('ember', 'detonation');
        return;
      }
    }

    // Time out: defenders win, unless the fuse is burning.
    if (this.roundTimer <= 0 && this.charge.state !== 'planted') {
      this.endRound('ash', 'timeout');
      return;
    }

    // Elimination wins (not while the fuse is burning — the plant plays out).
    if (this.charge.state !== 'planted') {
      const emberAlive = this.bots.alive('ember').length + (this.player.alive ? 1 : 0);
      const ashAlive = this.bots.alive('ash').length;
      if (ashAlive === 0) {
        this.endRound('ember', 'elimination');
        return;
      }
      if (emberAlive === 0) {
        this.endRound('ash', 'elimination');
        return;
      }
    }
  }

  _botContext() {
    return {
      match: this,
      player: this.player,
      tracers: this.tracers,
      hitMeshes: () => this.bots.hitMeshes(),
      enemies: (bot) => {
        if (bot.team === 'ember') return this.bots.alive('ash');
        const foes = this.bots.alive('ember');
        if (this.player.alive) foes.push(this.player);
        return foes;
      },
    };
  }

  // -- plant / defuse -----------------------------------------------------------

  interact() {
    // E pressed: the per-step channel logic does the work; this press just
    // makes sure a channel starts on the very frame the key goes down.
    this.eHeld = true;
  }

  _channelStep(dt) {
    const p = this.player;
    let channeling = false;
    if (p.alive) {
      if (this.charge.state === 'carried' && this.charge.carrier === p) {
        const s = this.yard.sites[this.charge.site];
        if (Math.hypot(p.pos.x - s.x, p.pos.z - s.z) <= s.r && this.eHeld) {
          this.plantProgress += dt;
          channeling = true;
          if (this.plantProgress >= CONFIG.round.plantSeconds) {
            this.plantProgress = 0;
            this.plantComplete(p);
          }
        }
      } else if (this.charge.state === 'planted') {
        if (Math.hypot(p.pos.x - this.charge.x, p.pos.z - this.charge.z) <= 1.6 && this.eHeld) {
          this.defuseProgress += dt;
          channeling = true;
          if (Math.floor(this.defuseProgress * 4) !== Math.floor((this.defuseProgress - dt) * 4)) this.sound.defuseBeep();
          if (this.defuseProgress >= CONFIG.round.defuseSeconds) {
            this.defuseProgress = 0;
            this.defuseComplete(p);
          }
        }
      }
    }
    if (!channeling) {
      this.plantProgress = 0;
      this.defuseProgress = 0;
    }
    if (this.hud) this.hud.channel = this.plantProgress > 0
      ? { label: 'PLANTING', frac: this.plantProgress / CONFIG.round.plantSeconds }
      : this.defuseProgress > 0
        ? { label: 'DEFUSING', frac: this.defuseProgress / CONFIG.round.defuseSeconds }
        : null;
  }

  plantComplete(entity) {
    if (this.charge.state !== 'carried') return;
    this.charge.state = 'planted';
    this.charge.x = entity.pos.x;
    this.charge.z = entity.pos.z;
    this.charge.fuse = CONFIG.round.fuseSeconds;
    this.charge.carrier = null;
    if (entity.isCarrier !== undefined) entity.isCarrier = false;
    if (entity === this.player) {
      this.money.ember += CONFIG.economy.plant;
      if (this.hud) this.hud.banner('CHARGE PLANTED', `Detonation in ${CONFIG.round.fuseSeconds}s — defend it.`);
    } else if (this.hud) {
      this.hud.banner('CHARGE PLANTED', `${entity.name} planted at site ${this.charge.site}.`);
    }
    this.sound.plantBeep(true);
  }

  defuseComplete(entity) {
    if (this.charge.state !== 'planted') return;
    this.charge.state = 'none';
    if (this.hud) this.hud.banner('CHARGE DEFUSED', `${entity === this.player ? 'You defused' : entity.name + ' defused'} the charge.`);
    this.endRound('ash', 'defused');
  }

  pickupCharge(entity) {
    if (this.charge.state !== 'dropped') return;
    this.charge.state = 'carried';
    this.charge.carrier = entity;
    if (entity.isCarrier !== undefined) entity.isCarrier = true;
    if (entity === this.player && this.hud) this.hud.banner('CHARGE SECURED', 'You carry the charge — take it to a site.');
  }

  dropCharge() {
    const c = this.charge.carrier;
    if (this.charge.state !== 'carried' || !c) return;
    if (c.isCarrier !== undefined) c.isCarrier = false;
    this.charge.state = 'dropped';
    this.charge.x = c.pos.x;
    this.charge.z = c.pos.z;
    this.charge.carrier = null;
  }

  // -- damage and kills -----------------------------------------------------------

  applyDamage(target, amount, part, attacker) {
    if (!this.isLive() || !target.alive) return;
    if (attacker === this.player) {
      if (this.hud) this.hud.hitmarker(part === 'head');
      this.sound.hit();
    }
    if (target === this.player) target.takeDamage(amount, attacker);
    else target.takeDamage(amount, part, attacker);
  }

  onKill(attacker, victim, part) {
    const aName = attacker === this.player ? 'You' : attacker.name;
    const vName = victim === this.player ? 'You' : victim.name;
    if (this.hud) this.hud.killfeed(aName, vName, part === 'head');
    if (attacker === this.player) {
      this.money.ember += CONFIG.economy.kill;
      this.sound.kill();
    }
    // The carrier's death drops the charge where they fell.
    if (this.charge.state === 'carried' && this.charge.carrier === victim) {
      if (victim.isCarrier !== undefined) victim.isCarrier = false;
      this.charge.state = 'dropped';
      this.charge.x = victim.pos.x;
      this.charge.z = victim.pos.z;
      this.charge.carrier = null;
      if (this.hud) this.hud.banner('CHARGE DROPPED', 'The carrier is down — recover it.');
    }
  }

  // -- economy ---------------------------------------------------------------------

  buyWeapon(entity, id) {
    if (this.phase !== 'buy') return false;
    const def = WEAPONS[id];
    if (!def) return false;
    if (id === 'frag') {
      if (entity.frags >= 2 || this.money.ember < def.price) return false;
      this.money.ember -= def.price;
      entity.frags += 1;
      this.sound.buy();
      return true;
    }
    if (this.money.ember < def.price) return false;
    this.money.ember -= def.price;
    if (def.kind === 'pistol') {
      entity.slots[1] = { def, mag: def.mag, reserve: def.reserve };
      entity.slot = 1;
    } else {
      entity.slots[0] = { def, mag: def.mag, reserve: def.reserve };
      entity.slot = 0;
    }
    entity._equipViewmodel();
    this.sound.buy();
    return true;
  }

  // -- shots, grenades, effects ------------------------------------------------------

  hitMeshes() {
    return this.bots.hitMeshes();
  }

  heardShot(pos) {
    this.bots.hearShot(pos);
  }

  spawnGrenade(pos, vel, owner) {
    this.grenades.push(new Grenade(this.scene, this.yard, this.sound, pos, vel, owner));
  }

  explodeGrenade(pos, owner) {
    this.sound.explosion();
    const light = new THREE.PointLight(0xffa040, 90, 22, 1.6);
    light.position.set(pos.x, pos.y + 0.6, pos.z);
    this.scene.add(light);
    this.explosionLight = light;
    const victims = [this.player, ...this.bots.all()];
    for (const v of victims) {
      if (!v.alive || v === owner) continue;
      const d = Math.hypot(v.pos.x - pos.x, v.pos.z - pos.z);
      if (d > 6.5) continue;
      const dmg = Math.round(95 * (1 - d / 6.5)) + 10;
      if (v === this.player) v.takeDamage(dmg, owner);
      else v.takeDamage(dmg, 'body', owner);
    }
    // Shake the player's view if the blast is close.
    if (this.player.alive) {
      const d = Math.hypot(this.player.pos.x - pos.x, this.player.pos.z - pos.z);
      if (d < 10) this.player.pitch += (Math.random() - 0.5) * 0.06;
    }
  }

  spark(point) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd27a }),
    );
    mesh.position.copy(point);
    this.scene.add(mesh);
    this.sparks.push({ mesh, life: 0.15 });
  }

  // -- test hooks -----------------------------------------------------------------------

  setRoundTime(s) {
    this.roundTimer = s;
  }

  debugForcePlant() {
    if (this.phase !== 'live') return false;
    this.charge.state = 'planted';
    this.charge.site = 'A';
    this.charge.x = this.yard.sites.A.x;
    this.charge.z = this.yard.sites.A.z;
    this.charge.fuse = CONFIG.round.fuseSeconds;
    this.charge.carrier = null;
    return true;
  }

  _detonate() {
    const pos = new THREE.Vector3(this.charge.x, 0.6, this.charge.z);
    this.sound.explosion();
    const light = new THREE.PointLight(0xff9040, 160, 34, 1.5);
    light.position.copy(pos);
    this.scene.add(light);
    this.explosionLight = light;
    this.charge.state = 'none';
  }
}
