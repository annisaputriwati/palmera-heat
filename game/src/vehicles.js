// Cars: their definitions, how one is made, and the arcade driving physics every car shares
// — traffic, police and the player's stolen ride alike. A car carries a true velocity; each
// step splits it into forward and lateral parts, the engine drives the forward part, steering
// turns the body in proportion to speed, and grip bleeds the lateral part away (less of it
// with the handbrake pulled, which is what makes the car drift).

import { clamp } from './random.js';

export const CAR_TYPES = {
  compact: { name: 'Pico', len: 74, wid: 36, topSpeed: 335, accel: 265, grip: 0.80, colors: ['#d96f5f', '#5f8fd9', '#7fc46a', '#e3c05c', '#b07fd4', '#e8e4da'] },
  sedan: { name: 'Meridian Sedan', len: 86, wid: 39, topSpeed: 385, accel: 285, grip: 0.82, colors: ['#4a4f5e', '#7a828f', '#31435c', '#5c3131', '#2e4a3e', '#c0c4cc'] },
  taxi: { name: 'Sol Cab', len: 86, wid: 39, topSpeed: 375, accel: 290, grip: 0.82, colors: ['#f5b921'] },
  muscle: { name: 'Vantara Muscle', len: 90, wid: 41, topSpeed: 475, accel: 370, grip: 0.86, colors: ['#c22f2f', '#22242c', '#e8641e', '#274e13', '#f0ead8'] },
  van: { name: 'Cargo Van', len: 98, wid: 43, topSpeed: 320, accel: 225, grip: 0.84, colors: ['#d8d5cc', '#8b98a5', '#5e6e7e'] },
  cabrio: { name: '\u201969 Solana Cabrio', len: 88, wid: 40, topSpeed: 430, accel: 330, grip: 0.83, colors: ['#f3e5c8'] },
  truck: { name: 'Gala Truck', len: 106, wid: 44, topSpeed: 330, accel: 235, grip: 0.85, colors: ['#274b63'] },
  police: { name: 'PPD Interceptor', len: 88, wid: 40, topSpeed: 465, accel: 355, grip: 0.83, colors: ['#1d2126'] },
};
export const CAR_TYPE_IDS = Object.keys(CAR_TYPES);

/** Make a car of a type at a place. `driver` is null (parked), 'traffic', 'police' or 'player'. */
export function createCar(typeId, x, y, angle, color) {
  const type = CAR_TYPES[typeId];
  return {
    type: typeId,
    def: type,
    x, y, angle,
    vx: 0, vy: 0,
    steerVis: 0,
    health: 100,
    driver: null,
    color,
    radius: type.len * 0.44,
    dead: false,
    skidding: false,
    honkT: 0,
    stuckT: 0,
    id: 0,
  };
}

/** Speed along the car's nose, signed (negative in reverse). */
export function forwardSpeed(car) {
  return car.vx * Math.cos(car.angle) + car.vy * Math.sin(car.angle);
}

/** Total speed, unsigned. */
export function speedOf(car) {
  return Math.sqrt(car.vx * car.vx + car.vy * car.vy);
}

/**
 * Advance one car one step. ctl is { throttle: -1..1, steer: -1..1, handbrake: bool }.
 * Returns the impact speed when the car struck the city hard enough to matter, else 0.
 * `resolve` is the city's circle resolver, so cars slide along walls instead of entering them.
 */
export function stepCar(car, dt, ctl, resolve) {
  const def = car.def;
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let fSpeed = car.vx * fx + car.vy * fy;
  let lx = car.vx - fx * fSpeed;
  let ly = car.vy - fy * fSpeed;

  if (car.dead) {
    fSpeed -= fSpeed * 2.2 * dt;
  } else if (ctl.throttle > 0) {
    fSpeed += def.accel * ctl.throttle * dt;
    if (fSpeed > def.topSpeed) fSpeed = Math.max(def.topSpeed, fSpeed - 220 * dt);
  } else if (ctl.throttle < 0) {
    if (fSpeed > 12) fSpeed += 460 * ctl.throttle * dt; // braking
    else fSpeed = Math.max(fSpeed + def.accel * 0.55 * ctl.throttle * dt, -def.topSpeed * 0.38);
  }
  // Rolling drag: stronger with no throttle, so cars settle instead of gliding forever.
  fSpeed -= fSpeed * (ctl.throttle !== 0 ? 0.22 : 0.7) * dt;
  if (ctl.handbrake) fSpeed -= fSpeed * 0.9 * dt;
  if (Math.abs(fSpeed) < 3 && ctl.throttle === 0) fSpeed = 0;

  // Steering: full lock when slow, less at speed; the body turns with the forward speed.
  const speedRatio = clamp(Math.abs(fSpeed) / def.topSpeed, 0, 1);
  const maxSteer = 0.66 - 0.34 * speedRatio;
  const steerAngle = ctl.steer * maxSteer;
  car.steerVis = steerAngle;
  if (fSpeed !== 0) {
    const turn = (fSpeed / def.len) * Math.tan(steerAngle) * (ctl.handbrake ? 1.45 : 1);
    car.angle += turn * dt * Math.sign(fSpeed);
  }

  // Grip: the lateral slide decays per step; the handbrake lets it live, which reads as drift.
  const gripKeep = ctl.handbrake ? 0.965 : def.grip;
  lx *= gripKeep;
  ly *= gripKeep;
  car.skidding = (Math.abs(lx) + Math.abs(ly) > 55 && Math.abs(fSpeed) > 90) || (ctl.handbrake && Math.abs(fSpeed) > 130);

  const nfx = Math.cos(car.angle);
  const nfy = Math.sin(car.angle);
  car.vx = nfx * fSpeed + lx;
  car.vy = nfy * fSpeed + ly;
  car.x += car.vx * dt;
  car.y += car.vy * dt;

  // City collision: the resolver pushes the car out; the lost speed is the impact.
  const before = speedOf(car);
  const hit = resolve(car, car.radius * 0.82);
  let impact = 0;
  if (hit) {
    const into = before - speedOf(car);
    car.vx *= 0.55;
    car.vy *= 0.55;
    if (into > 60) {
      impact = into;
      car.health -= (into - 55) * 0.16;
      if (car.health <= 0) {
        car.health = 0;
        car.dead = true;
      }
    }
  }
  return impact;
}

/** Damage a car from outside (bullets, rams); kills its engine at zero health. */
export function damageCar(car, amount) {
  car.health -= amount;
  if (car.health <= 0) {
    car.health = 0;
    car.dead = true;
  }
}
