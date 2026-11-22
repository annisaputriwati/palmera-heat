// Combat: the player's fists and pistol. Bullets are short-lived projectiles tested against
// buildings, cars and people in two substeps so a fast round cannot tunnel through a thin
// wall; a swing is an arc in front of the player. Every hit that matters reports itself
// through state.onCrime and state.spawnParticles, which main.js wires to the wanted system
// and the effects.

import { PLAYER } from './config.js';
import { angleDelta, dist } from './random.js';
import { damageCar } from './vehicles.js';

const BULLET_SPEED = 900;
const BULLET_LIFE = 0.5;
const BULLET_DAMAGE = 55;
const CAR_DAMAGE = 9;

export function createCombat() {
  /** Fire one round from (x, y) along angle. The caller handles ammo and rate. */
  function shoot(state, x, y, angle) {
    state.bullets.push({
      x: x + Math.cos(angle) * 16,
      y: y + Math.sin(angle) * 16,
      vx: Math.cos(angle) * BULLET_SPEED,
      vy: Math.sin(angle) * BULLET_SPEED,
      life: BULLET_LIFE,
    });
    state.spawnParticles(x + Math.cos(angle) * 20, y + Math.sin(angle) * 20, {
      count: 3, color: '#ffd94d', speed: 60, life: 0.12, size: 3,
    });
    state.onCrime('shoot', x, y);
    state.pedsApi.scare(x, y, 300);
  }

  /** A swing of the fists: whoever stands in the arc in front of the player feels it. */
  function melee(state) {
    const p = state.player;
    state.audio.punch();
    let hitAny = false;
    for (const ped of state.peds) {
      if (ped.state === 'dead' || ped.state === 'riding') continue;
      if (dist(p.x, p.y, ped.x, ped.y) > PLAYER.meleeRange) continue;
      const to = Math.atan2(ped.y - p.y, ped.x - p.x);
      if (Math.abs(angleDelta(p.angle, to)) > 1.15) continue;
      const result = state.pedsApi.hurt(ped, PLAYER.meleeDamage, p.x, p.y);
      state.onCrime('hitPed', ped.x, ped.y);
      state.spawnParticles(ped.x, ped.y, { count: 5, color: '#d8c9a8', speed: 90, life: 0.3, size: 3 });
      if (result) state.toast(result === 'dead' ? 'They\u2019re not getting up.' : 'Down — that\u2019ll cost you.');
      hitAny = true;
    }
    for (const car of state.cars) {
      if (car === p.car) continue;
      if (dist(p.x, p.y, car.x, car.y) < car.radius + 16) {
        damageCar(car, 4);
        state.spawnParticles(car.x, car.y, { count: 3, color: '#ffe9a8', speed: 70, life: 0.2, size: 2.6 });
        hitAny = true;
      }
    }
    return hitAny;
  }

  function bulletHitsBuilding(state, x, y) {
    for (const b of state.city.buildingsNear(x, y, 6)) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
    }
    return false;
  }

  function update(dt, state) {
    const bullets = state.bullets;
    for (let i = bullets.length - 1; i >= 0; i -= 1) {
      const b = bullets[i];
      let dead = false;
      for (let s = 0; s < 2 && !dead; s += 1) {
        b.x += (b.vx * dt) / 2;
        b.y += (b.vy * dt) / 2;
        b.life -= dt / 2;
        if (b.life <= 0 || b.x < 0 || b.y < 0 || b.x > state.city.width || b.y > state.city.height) {
          dead = true;
          break;
        }
        if (bulletHitsBuilding(state, b.x, b.y)) {
          state.spawnParticles(b.x, b.y, { count: 3, color: '#ffe9a8', speed: 80, life: 0.18, size: 2.2 });
          dead = true;
          break;
        }
        for (const car of state.cars) {
          if (car === state.player.car) continue;
          if (dist(b.x, b.y, car.x, car.y) < car.radius * 0.92) {
            damageCar(car, CAR_DAMAGE);
            state.spawnParticles(b.x, b.y, { count: 5, color: '#ffb35c', speed: 110, life: 0.22, size: 2.6 });
            if (!car.lastShotT || state.time - car.lastShotT > 0.9) {
              car.lastShotT = state.time;
              state.onCrime('shootCar', car.x, car.y);
            }
            if (car.driver === 'traffic') state.pedsApi.scare(car.x, car.y, 260);
            dead = true;
            break;
          }
        }
        if (dead) break;
        for (const ped of state.peds) {
          if (ped.state === 'dead' || ped.state === 'riding') continue;
          if (dist(b.x, b.y, ped.x, ped.y) < 12) {
            const result = state.pedsApi.hurt(ped, BULLET_DAMAGE, b.x - b.vx * 0.01, b.y - b.vy * 0.01);
            state.onCrime('shootPed', ped.x, ped.y);
            state.spawnParticles(ped.x, ped.y, { count: 6, color: '#b8493f', speed: 100, life: 0.3, size: 3 });
            if (result === 'dead') state.toast('They\u2019re not getting up. Vega will hear about this.');
            dead = true;
            break;
          }
        }
      }
      if (dead) bullets.splice(i, 1);
    }
  }

  return { shoot, melee, update };
}
