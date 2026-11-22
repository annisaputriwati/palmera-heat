// The Palmera PD and the wanted system. Heat is a float that crimes raise and hiding
// lowers; the stars on the HUD are its ceiling. Police interceptors spawn on the road
// network beyond the player's view, steer for where the player is heading, ram and pin,
// and fill the BUSTED meter when they hold the player slow and close. The first unit of
// any serious chase is Inspector Vega's — she does not give up, and her car says so.

import { WANTED } from './config.js';
import { angleDelta, clamp, dist } from './random.js';
import { createCar, stepCar, speedOf, forwardSpeed } from './vehicles.js';

export function createPolice(city, rng, addCar, removeCar) {
  const wanted = { heat: 0, stars: 0 };
  let seenT = 99;
  let spawnT = 0;
  let vegaOut = false;

  function starsOf(heat) {
    return heat <= 0.02 ? 0 : Math.min(WANTED.maxStars, Math.ceil(heat));
  }

  /** Register a crime. Witnessed crimes (a cop or a pedestrian near, or gunfire) count in
   *  full; an unwitnessed one in the empty streets counts for less. */
  function addCrime(state, kind, x, y) {
    let witnessed = kind === 'shoot' || kind === 'shootPed';
    if (!witnessed) {
      for (const c of state.cars) {
        if (c.driver === 'police' && dist(c.x, c.y, x, y) < 340) { witnessed = true; break; }
      }
      if (!witnessed) {
        for (const p of state.peds) {
          if (p.state !== 'dead' && dist(p.x, p.y, x, y) < 215) { witnessed = true; break; }
        }
      }
    }
    const amount = (WANTED.crime[kind] ?? 0.7) * (witnessed ? 1 : 0.35);
    wanted.heat = Math.min(5.6, wanted.heat + amount);
  }

  function setHeat(value) {
    wanted.heat = clamp(value, 0, 5.6);
  }

  function spawnCop(state, isVega) {
    const p = state.player;
    for (let tries = 0; tries < 6; tries += 1) {
      const a = rng.angle();
      const d = rng.range(740, 980);
      const near = city.nearestRoadPoint(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
      // Never materialise inside the player's view.
      const cam = state.camera;
      if (near.x > cam.x - 90 && near.x < cam.x + state.viewW + 90 && near.y > cam.y - 90 && near.y < cam.y + state.viewH + 90) continue;
      const car = createCar('police', near.x, near.y, Math.atan2(p.y - near.y, p.x - near.x), '#1d2126');
      car.driver = 'police';
      car.vega = isVega;
      car.reverseT = 0;
      car.stuckT = 0;
      addCar(car);
      if (isVega) vegaOut = true;
      return;
    }
  }

  function driveCop(dt, state, cop) {
    const p = state.player;
    const targetX = p.x + (p.car ? p.car.vx : 0) * 0.38;
    const targetY = p.y + (p.car ? p.car.vy : 0) * 0.38;
    const d = dist(cop.x, cop.y, p.x, p.y);
    const desired = Math.atan2(targetY - cop.y, targetX - cop.x);
    let steer = clamp(angleDelta(cop.angle, desired) * 2.3, -1, 1);
    let throttle = clamp(d / 110, 0.3, 1);
    if (d < 40) throttle = 0.35;
    // Stuck against a wall or a wreck: back out and try another line.
    if (speedOf(cop) < 16 && cop.reverseT <= 0) cop.stuckT += dt; else cop.stuckT = 0;
    if (cop.stuckT > 1.05) { cop.reverseT = 0.7; cop.stuckT = 0; }
    if (cop.reverseT > 0) {
      cop.reverseT -= dt;
      throttle = -1;
      steer = -steer;
    }
    cop.braking = throttle < 0 && forwardSpeed(cop) > 12;
    stepCar(cop, dt, { throttle, steer, handbrake: false }, state.city.resolveCircle);
  }

  function update(dt, state, events) {
    const player = state.player;
    wanted.stars = starsOf(wanted.heat);
    const cops = state.cars.filter((c) => c.driver === 'police');

    let seen = false;
    let nearestCop = Infinity;
    for (const c of cops) {
      const d = dist(c.x, c.y, player.x, player.y);
      if (d < nearestCop) nearestCop = d;
      if (d < 430) seen = true;
    }
    if (seen) seenT = 0; else seenT += dt;
    if (seenT > 2.2 && wanted.heat > 0) {
      wanted.heat = Math.max(0, wanted.heat - WANTED.cooldownPerSec * dt);
    }
    if (wanted.heat <= 0.02) vegaOut = false;
    state.sirenOn = wanted.stars > 0 && nearestCop < 760;

    const want = WANTED.copsByStars[wanted.stars];
    spawnT -= dt;
    if (cops.length < want && spawnT <= 0) {
      spawnT = 1.15;
      spawnCop(state, wanted.stars >= 2 && !vegaOut && cops.length === 0);
    }
    if (cops.length > want) {
      let far = null;
      let farD = 0;
      for (const c of cops) {
        const d = dist(c.x, c.y, player.x, player.y);
        if (d > farD) { farD = d; far = c; }
      }
      if (far && farD > 520) removeCar(far);
    }
    // A chase that is over dissolves: units that fall far behind peel off for good.
    if (wanted.stars === 0) {
      for (const c of cops) {
        if (dist(c.x, c.y, player.x, player.y) > 620) removeCar(c);
      }
    }

    for (const cop of state.cars) {
      if (cop.driver === 'police') driveCop(dt, state, cop);
    }

    // The bust: hold the player slow and close, and the meter fills.
    const pSpeed = player.car ? speedOf(player.car) : 0;
    const vulnerable = !player.car || pSpeed < 26;
    if (vulnerable && wanted.stars > 0 && nearestCop < WANTED.bustRadius) {
      state.bust = Math.min(1, state.bust + dt / WANTED.bustSeconds);
      if (state.bust >= 1) events.busted = true;
    } else {
      state.bust = Math.max(0, state.bust - dt * 1.25);
    }
  }

  function clearAll(state) {
    for (const c of [...state.cars]) {
      if (c.driver === 'police') removeCar(c);
    }
    wanted.heat = 0;
    wanted.stars = 0;
    state.bust = 0;
  }

  return { wanted, addCrime, setHeat, update, clearAll };
}
