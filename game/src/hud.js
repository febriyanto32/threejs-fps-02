// EMBERLINE — the HUD. Plain DOM over the canvas: health, ammo, money,
// the round clock, the score, the charge state, a dynamic crosshair, the
// killfeed, the buy menu and the round banners. It reads the match every
// frame and never owns game state itself.

import { WEAPONS, BUY_ORDER } from './config.js';

function $(id) {
  return document.getElementById(id);
}

function fmtTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class Hud {
  constructor({ match, player, bots, sound }) {
    this.match = match;
    this.player = player;
    this.bots = bots;
    this.sound = sound;
    this.spreadDeg = 1;
    this.channel = null;
    this.onDeploy = null;
    this.onRestart = null;
    this._bannerTimer = 0;
    this._buildBuyMenu();
    this._wireButtons();
  }

  _wireButtons() {
    $('btn-deploy').addEventListener('click', () => {
      if (this.onDeploy) this.onDeploy();
    });
    $('btn-restart').addEventListener('click', () => {
      if (this.onRestart) this.onRestart();
    });
    $('btn-close-buy').addEventListener('click', () => this.openBuy(false));
  }

  _buildBuyMenu() {
    const list = $('buy-items');
    list.innerHTML = '';
    BUY_ORDER.forEach((id, i) => {
      const def = WEAPONS[id];
      const btn = document.createElement('button');
      btn.className = 'buy-item';
      btn.dataset.weapon = id;
      btn.innerHTML = `<span class="buy-key">${i + 1}</span>
        <span class="buy-name">${def.name}</span>
        <span class="buy-kind">${def.kind}</span>
        <span class="buy-price">$${def.price}</span>`;
      btn.addEventListener('click', () => {
        if (this.player.buy(id)) this.refreshBuy();
      });
      list.appendChild(btn);
    });
  }

  refreshBuy() {
    const money = this.match.money.ember;
    document.querySelectorAll('.buy-item').forEach((btn) => {
      const def = WEAPONS[btn.dataset.weapon];
      const owned = btn.dataset.weapon === 'frag'
        ? this.player.frags >= 2
        : this.player.slots.some((s) => s && s.def.id === btn.dataset.weapon);
      btn.classList.toggle('cant', money < def.price && !owned);
      btn.classList.toggle('owned', owned);
    });
    $('buy-money').textContent = `$${money}`;
  }

  toggleBuy() {
    if (this.match.phase !== 'buy') return;
    const menu = $('buy-menu');
    const open = menu.classList.contains('hidden');
    this.openBuy(open);
  }

  openBuy(open) {
    $('buy-menu').classList.toggle('hidden', !open);
    if (open) {
      // The buy menu owns the middle of the screen: clear any banner
      // rather than letting its text show through the panel.
      $('banner').classList.add('hidden');
      this._bannerTimer = 0;
      this.refreshBuy();
    }
  }

  banner(title, sub = '') {
    $('banner-title').textContent = title;
    $('banner-sub').textContent = sub;
    $('banner').classList.remove('hidden');
    this._bannerTimer = 3.2;
  }

  killfeed(attacker, victim, headshot) {
    const feed = $('killfeed');
    const line = document.createElement('div');
    line.className = 'feed-line';
    line.innerHTML = `<span class="feed-a">${attacker}</span> ${headshot ? '◉' : '✕'} <span class="feed-v">${victim}</span>`;
    feed.prepend(line);
    while (feed.children.length > 5) feed.removeChild(feed.lastChild);
    setTimeout(() => line.remove(), 6000);
  }

  hitmarker(headshot) {
    const el = $('hitmarker');
    el.classList.toggle('head', headshot);
    el.classList.remove('show');
    void el.offsetWidth; // restart the animation
    el.classList.add('show');
  }

  flashDamage() {
    const el = $('damage-vignette');
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  showMatchEnd(winner, score) {
    $('end-title').textContent = winner === 'ember' ? 'EMBER WINS THE MATCH' : 'ASH WINS THE MATCH';
    $('end-score').textContent = `Ember ${score.ember} — ${score.ash} Ash`;
    $('overlay-end').classList.remove('hidden');
  }

  hideOverlays() {
    $('overlay-start').classList.add('hidden');
    $('overlay-end').classList.add('hidden');
  }

  // -- per-frame -----------------------------------------------------------------

  refresh() {
    const m = this.match;
    const p = this.player;

    // Start overlay: shown until the first deploy.
    if (m.started) $('overlay-start').classList.add('hidden');

    // Health.
    $('health-num').textContent = Math.ceil(p.hp);
    $('health-bar').style.width = `${Math.max(0, p.hp)}%`;
    $('health-bar').classList.toggle('low', p.hp <= 30);

    // Ammo and weapon.
    const w = p.weapon;
    if (w) {
      $('ammo-mag').textContent = w.mag;
      $('ammo-reserve').textContent = w.reserve;
      $('weapon-name').textContent = w.def.name;
      $('reload-hint').textContent = p.reloadTimer > 0 ? 'RELOADING…' : (w.mag === 0 ? 'PRESS R' : '');
    } else {
      $('ammo-mag').textContent = '—';
      $('ammo-reserve').textContent = '—';
      $('weapon-name').textContent = 'NO WEAPON';
      $('reload-hint').textContent = '';
    }
    $('frag-count').textContent = `◈ ${p.frags}`;

    // Money, score, clock.
    $('money').textContent = `$${m.money.ember}`;
    $('score-ember').textContent = m.score.ember;
    $('score-ash').textContent = m.score.ash;
    $('round-num').textContent = m.roundNumber > 0 ? `ROUND ${m.roundNumber}/9` : 'HARBOR YARD';
    if (m.phase === 'buy') $('timer').textContent = `BUY ${fmtTime(m.buyTimer)}`;
    else if (m.phase === 'live') $('timer').textContent = fmtTime(m.roundTimer);
    else if (m.phase === 'post') $('timer').textContent = '—';
    else $('timer').textContent = '—';
    $('timer').classList.toggle('danger', m.phase === 'live' && m.roundTimer <= 15);

    // Charge state.
    const c = m.charge;
    let chargeText = 'CHARGE: —';
    if (c.state === 'carried') {
      chargeText = c.carrier === p ? 'CHARGE: YOU CARRY IT' : `CHARGE: ${c.carrier.name} (SITE ${c.site})`;
    } else if (c.state === 'dropped') {
      chargeText = 'CHARGE: DROPPED — RECOVER IT';
    } else if (c.state === 'planted') {
      chargeText = `PLANTED SITE ${c.site} — ${fmtTime(c.fuse)}`;
    }
    $('bomb-status').textContent = chargeText;
    $('bomb-status').classList.toggle('planted', c.state === 'planted');
    $('bomb-status').classList.toggle('dropped', c.state === 'dropped');

    // Crosshair gap follows the live spread.
    const gap = 6 + this.spreadDeg * 3.2;
    $('crosshair').style.setProperty('--gap', `${gap.toFixed(1)}px`);
    $('crosshair').classList.toggle('hidden', !m.isLive() || !p.alive);

    // Plant/defuse progress bar.
    if (this.channel) {
      $('channel-bar').classList.remove('hidden');
      $('channel-label').textContent = this.channel.label;
      $('channel-fill').style.width = `${Math.round(this.channel.frac * 100)}%`;
    } else {
      $('channel-bar').classList.add('hidden');
    }

    // Death notice.
    $('death-note').classList.toggle('hidden', p.alive || !m.started || m.phase === 'over');

    // Banner lifetime.
    if (this._bannerTimer > 0) {
      this._bannerTimer -= 1 / 60;
      if (this._bannerTimer <= 0) $('banner').classList.add('hidden');
    }
  }
}
