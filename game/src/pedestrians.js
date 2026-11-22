// Pedestrians: Palmera's people walk the sidewalk loops around each block, mind their own
// business, and run when the day turns dangerous — a shot, a swinging fist, a car mounting
// the kerb at speed. Some of them are waiting for a taxi: those stand at the kerb with a
// gold $ over their heads until the player (or nobody) picks them up.

import { clamp, dist } from './random.js';

const SHIRTS = ['#d96f5f', '#5f8fd9', '#7fc46a', '#e3c05c', '#b07fd4', '#e8e4da', '#4fb3a9', '#e88ca0', '#8a9a5b', '#f0ead8'];
const SKINS = ['#f2c9a4', '#c68863', '#8d5524', '#ffdbac', '#a0663a', '#e0ac69'];
const PED_COUNT = 42;

export function createPeds(city, rng) {
  const list = [];

  function pointOnLoop(loop, t) {
    // Walk a rectangle perimeter by distance t: returns position and heading.
    const w = loop.w;
    const h = loop.h;
    const per = 2 * (w + h);
    let d = ((t % per) + per) % per;
    if (d < w) return { x: loop.x + d, y: loop.y, angle: 0 };
    d -= w;
    if (d < h) return { x: loop.x + w, y: loop.y + d, angle: Math.PI / 2 };
    d -= h;
    if (d < w) return { x: loop.x + w - d, y: loop.y + h, angle: Math.PI };
    d -= w;
    return { x: loop.x, y: loop.y + h - d, angle: -Math.PI / 2 };
  }

  for (let i = 0; i < PED_COUNT; i += 1) {
    const loop = rng.pick(city.pedLoops);
    const per = 2 * (loop.w + loop.h);
    list.push({
      x: 0, y: 0, angle: 0,
      loop, t: rng.range(0, per),
      speed: rng.range(52, 84),
      state: 'walk',
      health: 100,
      shirt: rng.pick(SHIRTS),
      skin: rng.pick(SKINS),
      walkPhase: rng.range(0, 6),
      phase: rng.range(0, 6),
      fare: false,
      fleeT: 0, fleeX: 0, fleeY: 0,
      downT: 0,
      vx: 0, vy: 0,
    });
    const p = list[list.length - 1];
    const at = pointOnLoop(loop, p.t);
    p.x = at.x; p.y = at.y; p.angle = at.angle;
  }

  let fareTimer = 5;

  /** Scare everyone near a point: gunfire, a crash, a near miss. */
  function scare(x, y, radius) {
    for (const ped of list) {
      if (ped.state !== 'walk' && ped.state !== 'hail') continue;
      if (dist(ped.x, ped.y, x, y) < radius) {
        ped.state = 'flee';
        ped.fleeT = rng.range(1.6, 3.0);
        ped.fleeX = x;
        ped.fleeY = y;
        ped.fare = false;
      }
    }
  }

  /** Hurt a pedestrian; returns 'down' or 'dead' when they fall, else null. */
  function hurt(ped, amount, fromX, fromY) {
    if (ped.state === 'dead') return null;
    ped.health -= amount;
    const a = Math.atan2(ped.y - fromY, ped.x - fromX);
    ped.vx += Math.cos(a) * 190;
    ped.vy += Math.sin(a) * 190;
    if (ped.health <= 0) {
      ped.state = 'dead';
      ped.fare = false;
      return 'dead';
    }
    if (ped.health < 45) {
      ped.state = 'down';
      ped.downT = 7;
      ped.fare = false;
      return 'down';
    }
    ped.state = 'flee';
    ped.fleeT = 2.4;
    ped.fleeX = fromX;
    ped.fleeY = fromY;
    return null;
  }

  function update(dt, state) {
    // Offer a fare every so often: a walker near the player raises a hand.
    fareTimer -= dt;
    if (fareTimer <= 0) {
      fareTimer = 8;
      if (!list.some((p) => p.fare) && !state.taxi) {
        const near = list.filter((p) => p.state === 'walk' && dist(p.x, p.y, state.player.x, state.player.y) < 950);
        if (near.length) {
          const ped = near[Math.floor(rng.next() * near.length)];
          ped.fare = true;
          ped.state = 'hail';
        }
      }
    }

    for (const ped of list) {
      if (ped.state === 'dead' || ped.state === 'riding') continue;
      // Knockback glide.
      if (ped.vx !== 0 || ped.vy !== 0) {
        ped.x += ped.vx * dt;
        ped.y += ped.vy * dt;
        ped.vx *= 0.82;
        ped.vy *= 0.82;
        if (Math.abs(ped.vx) < 4) ped.vx = 0;
        if (Math.abs(ped.vy) < 4) ped.vy = 0;
        state.city.resolveCircle(ped, 9);
      }
      if (ped.state === 'down') {
        ped.downT -= dt;
        if (ped.downT <= 0) {
          ped.state = 'walk';
          ped.health = 55;
        }
        continue;
      }
      if (ped.state === 'hail') {
        ped.walkPhase += dt * 2;
        continue;
      }
      if (ped.state === 'flee') {
        ped.fleeT -= dt;
        const a = Math.atan2(ped.y - ped.fleeY, ped.x - ped.fleeX);
        ped.angle = a;
        ped.x += Math.cos(a) * 196 * dt;
        ped.y += Math.sin(a) * 196 * dt;
        ped.walkPhase += dt * 15;
        state.city.resolveCircle(ped, 9);
        if (ped.fleeT <= 0) ped.state = 'walk';
        continue;
      }
      // A car coming fast is worth stepping back from, even mid-stroll.
      let danger = null;
      for (const car of state.cars) {
        const s = Math.sqrt(car.vx * car.vx + car.vy * car.vy);
        if (s > 150 && dist(ped.x, ped.y, car.x, car.y) < 58) { danger = car; break; }
      }
      if (danger) {
        ped.state = 'flee';
        ped.fleeT = 1.1;
        ped.fleeX = danger.x;
        ped.fleeY = danger.y;
        continue;
      }
      // Ordinary walking around the block.
      ped.t += ped.speed * dt;
      const at = pointOnLoop(ped.loop, ped.t);
      ped.x = at.x;
      ped.y = at.y;
      ped.angle = at.angle;
      ped.walkPhase += dt * 8.5;
    }
  }

  return { list, update, scare, hurt, pointOnLoop };
}
