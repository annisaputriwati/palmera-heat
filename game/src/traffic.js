// Traffic: the cars that are not the player's. Each traffic car owns a lane on the road grid
// (a fixed coordinate on one axis, a direction on the other) and steers toward a point ahead
// of it in that lane, which keeps it centred and swings it around corners when it turns at an
// intersection. Cars brake for whatever is ahead of them in the lane — another car, the
// player's car, a pedestrian in the road — and the population is recycled: a car that falls
// far behind the player is quietly replaced across town, so the streets near the player are
// never empty and never crowded.

import { H_ROADS, LANE_OFF, ROAD_W, V_ROADS } from './config.js';
import { createCar, stepCar, forwardSpeed } from './vehicles.js';
import { clamp, dist } from './random.js';

const TRAFFIC_COUNT = 13;
const CRUISE_MIN = 140;
const CRUISE_MAX = 225;

function laneFixed(axis, roadCenter, dir) {
  // Right-hand traffic: the lane sits to the driver's right of the centre line.
  if (axis === 'v') return roadCenter + (dir > 0 ? -LANE_OFF : LANE_OFF);
  return roadCenter + (dir > 0 ? LANE_OFF : -LANE_OFF);
}

function headingOf(axis, dir) {
  if (axis === 'v') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return dir > 0 ? 0 : Math.PI;
}

export function createTraffic(city, rng, addCar) {
  const cars = [];

  function spawn(far) {
    let spot = city.trafficSpawn(rng);
    for (let tries = 0; tries < 8 && far && dist(spot.x, spot.y, far.x, far.y) < 760; tries += 1) {
      spot = city.trafficSpawn(rng);
    }
    const type = rng.pick(['compact', 'sedan', 'sedan', 'taxi', 'van', 'compact']);
    const car = createCar(type, spot.x, spot.y, spot.angle, rng.pick(['#d96f5f', '#5f8fd9', '#7a828f', '#e8e4da', '#31435c', '#7fc46a']));
    if (type !== 'taxi') car.color = rng.pick(car.def.colors);
    car.driver = 'traffic';
    car.laneAxis = spot.axis;
    car.laneDir = spot.dir;
    car.laneFixed = spot.axis === 'v' ? spot.x : spot.y;
    car.cruise = rng.range(CRUISE_MIN, CRUISE_MAX);
    car.turnCooldown = rng.range(0, 2);
    addCar(car);
    cars.push(car);
    return car;
  }

  // Street parking along the avenue edges, clear of the intersections.
  function parkStreetCars() {
    for (let i = 0; i < 16; i += 1) {
      const cx = rng.pick(V_ROADS);
      const y = rng.range(120, city.height - 120);
      if (H_ROADS.some((cy) => Math.abs(y - cy) < ROAD_W / 2 + 46)) continue;
      const side = rng.chance(0.5) ? -1 : 1;
      const type = rng.pick(['compact', 'sedan', 'van', 'muscle']);
      const car = createCar(type, cx + side * (ROAD_W / 2 - 25), y, side > 0 ? Math.PI / 2 : -Math.PI / 2, '#888888');
      car.color = rng.pick(car.def.colors);
      addCar(car);
    }
  }

  function obstacleAhead(state, car) {
    // Anything in my lane within braking distance: other cars first, then people.
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    let nearest = Infinity;
    for (const other of state.cars) {
      if (other === car) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const ahead = dx * fx + dy * fy;
      const side = Math.abs(dx * -fy + dy * fx);
      if (ahead > 4 && ahead < 105 && side < 30 && ahead < nearest) nearest = ahead;
    }
    for (const ped of state.peds) {
      if (ped.state === 'down' || ped.state === 'dead' || ped.state === 'riding') continue;
      const dx = ped.x - car.x;
      const dy = ped.y - car.y;
      const ahead = dx * fx + dy * fy;
      const side = Math.abs(dx * -fy + dy * fx);
      if (ahead > 2 && ahead < 62 && side < 22 && ahead < nearest) nearest = ahead;
    }
    return nearest;
  }

  function maybeTurn(car) {
    // At an intersection (the crossing road's centre is close on my moving axis), sometimes
    // turn onto it: swap axes, take the new road's lane, and let the steering swing round.
    const crossings = car.laneAxis === 'v' ? H_ROADS : V_ROADS;
    const pos = car.laneAxis === 'v' ? car.y : car.x;
    for (const center of crossings) {
      if (Math.abs(pos - center) < 26) {
        if (car.turnCooldown <= 0 && rng.chance(0.42)) {
          car.laneAxis = car.laneAxis === 'v' ? 'h' : 'v';
          car.laneDir = rng.chance(0.5) ? 1 : -1;
          // The road I am turning onto is the one whose centre I am crossing.
          car.laneFixed = laneFixed(car.laneAxis, center, car.laneDir);
          car.turnCooldown = 2.5;
        }
        return;
      }
    }
  }

  function update(dt, state) {
    const player = state.player;
    for (const car of cars) {
      if (car.driver !== 'traffic') continue; // stolen by the player: no longer traffic's
      car.turnCooldown = Math.max(0, car.turnCooldown - dt);
      // Far behind the player? Recycle across town.
      if (dist(car.x, car.y, player.x, player.y) > 1750) {
        const spot = city.trafficSpawn(rng);
        if (dist(spot.x, spot.y, player.x, player.y) > 780) {
          car.x = spot.x; car.y = spot.y; car.angle = spot.angle;
          car.vx = 0; car.vy = 0;
          car.laneAxis = spot.axis; car.laneDir = spot.dir;
          car.laneFixed = spot.axis === 'v' ? spot.x : spot.y;
        }
      }
      maybeTurn(car);
      // Steer toward a point ahead in the lane.
      const aheadDist = 120;
      const tx = car.laneAxis === 'v' ? car.laneFixed : car.x + car.laneDir * aheadDist;
      const ty = car.laneAxis === 'v' ? car.y + car.laneDir * aheadDist : car.laneFixed;
      const desired = Math.atan2(ty - car.y, tx - car.x);
      let steer = clamp(angleDeltaOf(car.angle, desired) * 2.1, -1, 1);
      const speed = forwardSpeed(car);
      const gap = obstacleAhead(state, car);
      let throttle = 0;
      if (gap < 46) throttle = speed > 20 ? -0.7 : 0;
      else if (speed < car.cruise) throttle = gap < 95 ? 0.25 : 0.75;
      car.braking = throttle < 0 || (gap < 60 && speed > 30);
      if (car.dead) throttle = 0;
      stepCar(car, dt, { throttle, steer, handbrake: false }, state.city.resolveCircle);
    }
  }

  for (let i = 0; i < TRAFFIC_COUNT; i += 1) spawn(null);
  parkStreetCars();

  return { update, cars };
}

function angleDeltaOf(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
