// Palmera Heat — boot, the game state, the fixed-step loop and the screen state machine.
// Every other module is a system that reads or writes this state: the city is generated once
// from the seed, traffic rolls, pedestrians stroll and flee, the PD hunts, missions arrive by
// phone. The loop advances the world in 1/60 s steps however fast the display runs. Screens
// (title, play, paused, busted, wasted, ending) are DOM overlays; the canvas always paints
// the world beneath them.
//
// ?seed=N fixes the city and traffic. ?shot=<name>&seed=N stages a screenshot scene instead
// of running the loop (see shots.js) and sets window.__shotReady when it is painted.

import { PLAYER, STEP, WORLD_H, WORLD_W } from './config.js';
import { createRandom, clamp, dist } from './random.js';
import { createCity } from './city.js';
import { createInput, ACTION_PAUSE } from './input.js';
import { createRenderer } from './render.js';
import { createCar, stepCar, forwardSpeed, speedOf } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPeds } from './pedestrians.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { loadSave, storeSave, clearSave } from './save.js';
import { stageShot } from './shots.js';

// Development aid: any uncaught error is written where a headless screenshot can see it.
window.addEventListener('error', (event) => {
  const box = document.getElementById('err');
  if (box) box.textContent += `${event.message}\n`;
  document.title = `ERR: ${event.message}`;
});

const params = new URLSearchParams(window.location.search);
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261121;
const shotName = params.get('shot');

const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);
const input = createInput(canvas);
const audio = createAudio();

// ---------------------------------------------------------------- state
function createGame() {
  const rng = createRandom(seed);
  const city = createCity(rng);
  const stall = city.landmarks.solCafe;
  const state = {
    city,
    rng,
    audio,
    time: 0,
    screen: 'title',
    player: {
      x: stall.x, y: stall.y + 30, angle: -Math.PI / 2, aimAngle: 0, walkPhase: 0,
      health: PLAYER.health, cash: PLAYER.startCash, rep: 0,
      car: null, weapon: 'fists', ammo: 0, swingT: 0, fireT: 0, hurtT: 0,
    },
    cars: [],
    peds: [],
    bullets: [],
    particles: [],
    skids: [],
    pickups: [],
    camera: { x: 0, y: 0 },
    viewW: renderer.view.w,
    viewH: renderer.view.h,
    shake: 0,
    marker: null,
    objective: null,
    prompt: null,
    wanted: { heat: 0, stars: 0 },
    bust: 0,
    sirenOn: false,
    taxi: null,
    missionIndex: 0,
    storyComplete: false,
    stats: { earned: 0, carsStolen: 0, faresDone: 0 },
  };
  let carId = 1;
  state.addCar = (car) => { car.id = carId; carId += 1; state.cars.push(car); return car; };
  state.removeCar = (car) => {
    const i = state.cars.indexOf(car);
    if (i >= 0) state.cars.splice(i, 1);
  };
  state.spawnParticles = (x, y, opts) => {
    const count = opts.count ?? 5;
    for (let i = 0; i < count; i += 1) {
      if (state.particles.length > 320) return;
      const a = rng.angle();
      const s = (opts.speed ?? 90) * rng.range(0.3, 1);
      const life = (opts.life ?? 0.3) * rng.range(0.6, 1.3);
      state.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 14,
        life, maxLife: life, size: (opts.size ?? 3) * rng.range(0.7, 1.3),
        color: opts.color ?? '#d8c9a8',
      });
    }
  };
  // Rio's own wheels wait by the stall: a red Vantara, legally his, mostly.
  const rio = createCar('muscle', stall.x + 96, stall.y + 66, 0, '#c22f2f');
  rio.owned = true;
  state.addCar(rio);
  for (const lot of city.parkingLots) {
    const count = rng.int(2, 5);
    for (let i = 0; i < count; i += 1) {
      const type = rng.pick(['compact', 'sedan', 'van', 'compact', 'sedan']);
      const car = createCar(type, rng.range(lot.x + 40, lot.x + lot.w - 40), rng.range(lot.y + 30, lot.y + lot.h - 30), rng.pick([0, Math.PI]), '#888888');
      car.color = rng.pick(car.def.colors);
      state.addCar(car);
    }
  }
  // Pickups: ammunition at Rico Hardware, care at the hospital, cash where it falls.
  const L = city.landmarks;
  const addPickup = (kind, x, y) => state.pickups.push({ kind, x, y, phase: rng.range(0, 6), active: true, respawnT: 0 });
  addPickup('ammo', L.hardware.x, L.hardware.y + 6);
  addPickup('health', L.hospital.x, L.hospital.y + 6);
  addPickup('health', 452, 900);
  addPickup('ammo', L.port.x + 60, L.port.y);
  for (let i = 0; i < 4; i += 1) {
    const road = city.nearestRoadPoint(rng.range(700, 4500), rng.range(300, 3200));
    addPickup('cash', road.x + rng.range(-30, 30), road.y + rng.range(-30, 30));
  }
  return state;
}

const state = createGame();
const player = state.player;
const traffic = createTraffic(state.city, state.rng, state.addCar);
const pedsApi = createPeds(state.city, state.rng);
state.peds = pedsApi.list;
state.pedsApi = pedsApi;
const police = createPolice(state.city, state.rng, state.addCar, state.removeCar);
state.wanted = police.wanted;
const combat = createCombat();
const hud = createHud(state);
state.toast = (text) => hud.toast(text);
state.onCrime = (kind, x, y) => police.addCrime(state, kind, x, y);

// Mission spawns: the Cabrio waits in the resort valet lot; the gala truck beside it.
function spawnMissionCar(type, dx) {
  const resort = state.city.landmarks.resort;
  const car = createCar(type, resort.x + dx, resort.y + 44, Math.PI, type === 'cabrio' ? '#f3e5c8' : '#274b63');
  state.city.resolveCircle(car, car.radius);
  car.missionCar = true;
  return state.addCar(car);
}
const api = {
  phone: (from, text, dur) => hud.showPhone(from, text, dur),
  toast: (text) => hud.toast(text),
  audio,
  reward: (n) => {
    player.cash += n;
    state.stats.earned += n;
    if (n > 0) {
      hud.toast(`+$${n}`);
      audio.jingle(true);
    }
  },
  addCrime: (kind, x, y) => police.addCrime(state, kind, x, y),
  setHeat: (v) => police.setHeat(v),
  saveGame: () => saveGame(),
  spawnCabrio: () => spawnMissionCar('cabrio', 150),
  spawnTruck: () => spawnMissionCar('truck', -170),
  showEnding: () => showEnding(),
};
let missions = createMissions(state, api);

function saveGame() {
  storeSave({
    cash: player.cash,
    missionIndex: state.missionIndex,
    rep: player.rep,
    x: Math.round(player.x),
    y: Math.round(player.y),
    storyComplete: state.storyComplete,
  });
}

// ---------------------------------------------------------------- screens
const overlays = {
  menu: document.getElementById('menu'),
  pause: document.getElementById('pause'),
  busted: document.getElementById('busted'),
  wasted: document.getElementById('wasted'),
  ending: document.getElementById('ending'),
  hud: document.getElementById('hud'),
};
function setScreen(screen) {
  state.screen = screen;
  overlays.menu.classList.toggle('hidden', screen !== 'title');
  overlays.pause.classList.toggle('hidden', screen !== 'paused');
  overlays.busted.classList.toggle('hidden', screen !== 'busted');
  overlays.wasted.classList.toggle('hidden', screen !== 'wasted');
  overlays.ending.classList.toggle('hidden', screen !== 'ending');
  overlays.hud.classList.toggle('hidden', screen === 'title');
}

function startPlay(fresh) {
  if (fresh) {
    clearSave();
    player.cash = PLAYER.startCash;
    player.health = PLAYER.health;
    player.rep = 0;
    player.ammo = 0;
    player.weapon = 'fists';
    state.missionIndex = 0;
    state.storyComplete = false;
    state.stats = { earned: 0, carsStolen: 0, faresDone: 0 };
    missions = createMissions(state, api);
  }
  audio.unlock();
  setScreen('play');
}

function respawnAt(point, healthBack) {
  if (player.car) {
    player.car.driver = null;
    player.car = null;
  }
  player.x = point.x;
  player.y = point.y + 24;
  player.health = healthBack;
  player.hurtT = 1;
  police.clearAll(state);
  saveGame();
  setScreen('play');
}

function doBusted() {
  const fine = Math.min(player.cash, 40 + state.wanted.stars * 35);
  player.cash -= fine;
  document.getElementById('busted-text').textContent =
    `Inspector Vega's people walk you out at dawn. The fine is $${fine}, your name is in a file now, and Mama Sol pretends not to know you until Thursday.`;
  audio.busted();
  setScreen('busted');
}

function doWasted() {
  const fee = Math.min(player.cash, 50 + state.wanted.stars * 15);
  player.cash -= fee;
  document.getElementById('wasted-text').textContent =
    `You wake up in St. Coral Hospital smelling of antiseptic and oranges. The clinic bill is $${fee}. Your grandmother's nurse says you were talking about a bell.`;
  audio.jingle(false);
  setScreen('wasted');
}

function showEnding() {
  player.cash += 500;
  state.stats.earned += 500;
  state.storyComplete = true;
  police.clearAll(state);
  audio.jingle(true);
  saveGame();
  setScreen('ending');
}

document.getElementById('btn-new').addEventListener('click', () => startPlay(true));
document.getElementById('btn-continue').addEventListener('click', () => {
  const save = loadSave();
  if (save) {
    player.cash = save.cash;
    player.rep = save.rep ?? 0;
    state.missionIndex = save.missionIndex ?? 0;
    state.storyComplete = !!save.storyComplete;
    if (typeof save.x === 'number') { player.x = save.x; player.y = save.y; }
    missions = createMissions(state, api);
  }
  startPlay(false);
});
document.getElementById('btn-resume').addEventListener('click', () => setScreen('play'));
document.getElementById('btn-quit').addEventListener('click', () => {
  saveGame();
  setScreen('title');
});
document.getElementById('btn-busted-ok').addEventListener('click', () => respawnAt(state.city.landmarks.policeStation, PLAYER.health));
document.getElementById('btn-wasted-ok').addEventListener('click', () => respawnAt(state.city.landmarks.hospital, PLAYER.health));
document.getElementById('btn-roam').addEventListener('click', () => setScreen('play'));
const muteBtn = document.getElementById('mute');
muteBtn.addEventListener('click', () => {
  audio.unlock();
  audio.setMuted(!audio.muted);
  muteBtn.textContent = audio.muted ? '✕' : '♪';
});
if (!loadSave()) document.getElementById('btn-continue').classList.add('hidden');
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
window.addEventListener('keydown', () => audio.unlock(), { once: true });

// ---------------------------------------------------------------- player
const prevKeys = new Set();
function keyPressed(code) {
  const now = input.down(code);
  const was = prevKeys.has(code);
  if (now) prevKeys.add(code); else prevKeys.delete(code);
  return now && !was;
}

function nearestEnterableCar() {
  let best = null;
  let bestD = 64;
  for (const car of state.cars) {
    if (car.driver === 'police' || speedOf(car) > 45) continue;
    const d = dist(player.x, player.y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function enterCar(car) {
  const wasDriven = car.driver === 'traffic';
  player.car = car;
  car.driver = 'player';
  audio.door();
  if (car.missionCar) {
    missions.notifyEnteredCar(car);
  } else if (!car.owned && !car.stolenOnce) {
    car.stolenOnce = true;
    state.stats.carsStolen += 1;
    state.onCrime('stealCar', car.x, car.y);
    if (wasDriven) {
      pedsApi.scare(car.x, car.y, 120);
      hud.toast('The driver bails out, shouting for the police!');
    }
  }
}

function exitCar() {
  const car = player.car;
  car.driver = null;
  car.braking = false;
  player.car = null;
  const side = car.angle + Math.PI / 2;
  player.x = car.x + Math.cos(side) * (car.def.wid / 2 + 20);
  player.y = car.y + Math.sin(side) * (car.def.wid / 2 + 20);
  state.city.resolveCircle(player, PLAYER.radius);
  audio.door();
}

/** The E key's errands when no car is at hand: Rico sells shells, the clinic patches, lunch heals. */
function interact() {
  const L = state.city.landmarks;
  if (dist(player.x, player.y, L.hardware.x, L.hardware.y) < 56) {
    if (player.cash >= 40) {
      player.cash -= 40;
      player.ammo += 24;
      hud.toast('Rico sells you 24 shells and a wink. \u201CFor the range, right?\u201D');
      audio.cash();
    } else hud.toast('Ammo is $40 a box at Rico Hardware.');
    return;
  }
  if (dist(player.x, player.y, L.hospital.x, L.hospital.y) < 56) {
    if (player.health < PLAYER.health && player.cash >= 30) {
      player.cash -= 30;
      player.health = PLAYER.health;
      hud.toast('Patched up at St. Coral. The nurse does not ask questions.');
      audio.pickup();
    } else if (player.health >= PLAYER.health) hud.toast('You\u2019re in one piece. The clinic can\u2019t help beyond that.');
    else hud.toast('Treatment is $30 at St. Coral Hospital.');
    return;
  }
  if (dist(player.x, player.y, L.solCafe.x, L.solCafe.y) < 56) {
    if (player.cash >= 8 && player.health < PLAYER.health) {
      player.cash -= 8;
      player.health = Math.min(PLAYER.health, player.health + 22);
      hud.toast('Nasi campur at Sinar Sol. You feel human again.');
      audio.pickup();
    } else hud.toast('Mama Sol waves you off. \u201CWork first, sayang. Then we eat.\u201D');
  }
}

function damagePlayer(amount, fromX, fromY) {
  if (player.hurtT > 0 || state.screen !== 'play') return;
  player.health -= amount;
  player.hurtT = 0.6;
  state.shake = Math.min(15, state.shake + 6);
  const a = Math.atan2(player.y - fromY, player.x - fromX);
  if (!player.car) {
    player.x += Math.cos(a) * 22;
    player.y += Math.sin(a) * 22;
    state.city.resolveCircle(player, PLAYER.radius);
  }
  state.spawnParticles(player.x, player.y, { count: 6, color: '#b8493f', speed: 100, life: 0.3, size: 3 });
  if (player.health <= 0) {
    player.health = 0;
    doWasted();
  }
}

function stepPlayer(dt) {
  const p = player;
  p.hurtT = Math.max(0, p.hurtT - dt);
  p.fireT = Math.max(0, p.fireT - dt);
  p.swingT = Math.max(0, p.swingT - dt);
  if (keyPressed('KeyM')) {
    audio.setMuted(!audio.muted);
    muteBtn.textContent = audio.muted ? '✕' : '♪';
  }
  if (p.car) {
    const ctl = {
      throttle: (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) - (input.down('KeyS') || input.down('ArrowDown') ? 1 : 0),
      steer: (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0) - (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0),
      handbrake: input.down('Space'),
    };
    p.car.braking = ctl.throttle < 0 && forwardSpeed(p.car) > 12;
    const impact = stepCar(p.car, dt, ctl, state.city.resolveCircle);
    if (impact > 90) {
      state.shake = Math.min(16, (impact - 80) * 0.09);
      audio.crash(impact * 0.02);
      pedsApi.scare(p.car.x, p.car.y, 190);
    }
    p.x = p.car.x;
    p.y = p.car.y;
    if (keyPressed('KeyE') && speedOf(p.car) < 60) exitCar();
    return;
  }
  const axis = input.moveAxis();
  const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
  const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  let mx = axis.x;
  let my = axis.y;
  const len = Math.sqrt(mx * mx + my * my);
  if (len > 0) {
    mx /= len; my /= len;
    p.x += mx * speed * dt;
    p.y += my * speed * dt;
    p.angle = Math.atan2(my, mx);
    p.walkPhase += dt * (sprint ? 13 : 9.5);
    state.city.resolveCircle(p, PLAYER.radius);
  }
  p.aimAngle = Math.atan2(
    state.camera.y + input.mouse.y - p.y,
    state.camera.x + input.mouse.x - p.x,
  );
  p.weapon = p.ammo > 0 ? 'pistol' : 'fists';
  if (p.weapon === 'pistol') p.angle = p.aimAngle;
  // Shooting and swinging.
  if (input.mouse.down && p.weapon === 'pistol' && p.fireT <= 0 && p.ammo > 0) {
    p.fireT = 0.23;
    p.ammo -= 1;
    combat.shoot(state, p.x, p.y, p.aimAngle);
    audio.shot();
    state.shake = Math.min(8, state.shake + 1.6);
  }
  if ((keyPressed('KeyF') || (input.takeClick() && p.weapon === 'fists')) && p.swingT <= 0) {
    p.swingT = 0.36;
    combat.melee(state);
  }
  if (keyPressed('KeyE')) {
    const car = nearestEnterableCar();
    if (car) enterCar(car);
    else interact();
  }
  // A fare hails: stop the car beside them and they climb in.
  if (!state.taxi) {
    for (const ped of state.peds) {
      if (ped.fare && dist(p.x, p.y, ped.x, ped.y) < 300) {
        state.prompt = 'A fare is hailing — drive over and stop beside them';
        break;
      }
    }
  }
}

// Fare pickup needs the player in a car; checked here where the car is known.
function checkFarePickup() {
  if (!player.car || state.taxi) return;
  if (speedOf(player.car) > 26) return;
  for (const ped of state.peds) {
    if (ped.fare && dist(player.car.x, player.car.y, ped.x, ped.y) < 54) {
      missions.tryPickup(ped);
      return;
    }
  }
}

// ---------------------------------------------------------------- collisions & world fx
function collideCars(dt) {
  const cars = state.cars;
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const rr = (a.radius + b.radius) * 0.8;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const overlap = (rr - d) / 2;
      a.x -= nx * overlap; a.y -= ny * overlap;
      b.x += nx * overlap; b.y += ny * overlap;
      const relV = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (relV < 0) {
        const impulse = -relV * 0.72;
        a.vx -= nx * impulse; a.vy -= ny * impulse;
        b.vx += nx * impulse; b.vy += ny * impulse;
        const impact = -relV;
        if (impact > 65) {
          const dmg = (impact - 55) * 0.13;
          a.health -= dmg; b.health -= dmg;
          if (a.health <= 0) a.dead = true;
          if (b.health <= 0) b.dead = true;
          state.spawnParticles((a.x + b.x) / 2, (a.y + b.y) / 2, { count: 8, color: '#ffb35c', speed: 140, life: 0.3, size: 3 });
          const playerIn = a === player.car || b === player.car;
          const other = a === player.car ? b : a;
          if (playerIn) {
            state.shake = Math.min(16, state.shake + impact * 0.06);
            audio.crash(impact * 0.02);
            pedsApi.scare(player.x, player.y, 210);
            if (other.driver !== 'police' && (!other.lastHitT || state.time - other.lastHitT > 1.3)) {
              other.lastHitT = state.time;
              state.onCrime('hitCar', other.x, other.y);
            }
          }
        }
      }
      state.city.resolveCircle(a, a.radius * 0.82);
      state.city.resolveCircle(b, b.radius * 0.82);
    }
  }
  void dt;
}

function collidePeople() {
  for (const car of state.cars) {
    const s = speedOf(car);
    if (s < 55) continue;
    for (const ped of state.peds) {
      if (ped.state === 'dead' || ped.state === 'riding' || ped.state === 'down') continue;
      if (dist(car.x, car.y, ped.x, ped.y) < car.radius * 0.92 + 9) {
        const result = pedsApi.hurt(ped, Math.min(90, s * 0.3), car.x, car.y);
        state.spawnParticles(ped.x, ped.y, { count: 7, color: '#b8493f', speed: 110, life: 0.32, size: 3 });
        if (car === player.car) {
          state.onCrime('hitPed', ped.x, ped.y);
          state.shake = Math.min(12, state.shake + 4);
          audio.crash(0.4);
          if (result) hud.toast(result === 'dead' ? 'They\u2019re not getting up.' : 'You clipped a pedestrian!');
        } else {
          pedsApi.scare(ped.x, ped.y, 200);
        }
      }
    }
    // The player, on foot, in front of somebody else's car.
    if (car !== player.car && !player.car && dist(car.x, car.y, player.x, player.y) < car.radius * 0.85 + 11) {
      damagePlayer(8 + s * 0.045, car.x, car.y);
    }
  }
}

function updatePickups(dt) {
  for (const pickup of state.pickups) {
    if (!pickup.active) {
      pickup.respawnT -= dt;
      if (pickup.respawnT <= 0) pickup.active = true;
      continue;
    }
    if (dist(player.x, player.y, pickup.x, pickup.y) > 30) continue;
    pickup.active = false;
    pickup.respawnT = 26;
    audio.pickup();
    if (pickup.kind === 'ammo') {
      const first = player.ammo === 0;
      player.ammo += 16;
      hud.toast(first ? 'Pistol shells — hold click to shoot, F to swing.' : '+16 shells.');
    } else if (pickup.kind === 'health') {
      player.health = Math.min(PLAYER.health, player.health + 40);
      hud.toast('First aid — you feel steadier.');
    } else {
      const found = state.rng.int(20, 55);
      player.cash += found;
      hud.toast(`Found $${found} in small bills. Palmera provides.`);
    }
  }
}

function updateFx(dt) {
  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const p = state.particles[i];
    p.life -= dt;
    if (p.life <= 0) { state.particles.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.92;
    p.vy *= 0.92;
  }
  for (let i = state.skids.length - 1; i >= 0; i -= 1) {
    state.skids[i].alpha -= dt * 0.055;
    if (state.skids[i].alpha <= 0) state.skids.splice(i, 1);
  }
  for (const car of state.cars) {
    if (car.skidding && speedOf(car) > 100) {
      const back = car.def.len * 0.32;
      const side = car.def.wid * 0.42;
      for (const s of [-1, 1]) {
        state.skids.push({
          x: car.x - Math.cos(car.angle) * back + Math.cos(car.angle + Math.PI / 2) * side * s,
          y: car.y - Math.sin(car.angle) * back + Math.sin(car.angle + Math.PI / 2) * side * s,
          angle: car.angle, alpha: 0.4,
        });
      }
      if (state.skids.length > 460) state.skids.splice(0, state.skids.length - 460);
    }
    if (car.health < 45 && car.health > 0 && !car.dead) {
      car.smokeT = (car.smokeT ?? 0) - dt;
      if (car.smokeT <= 0) {
        car.smokeT = 0.14;
        state.particles.push({
          x: car.x + Math.cos(car.angle) * car.def.len * 0.4, y: car.y + Math.sin(car.angle) * car.def.len * 0.4,
          vx: state.rng.range(-8, 8), vy: state.rng.range(-26, -14),
          life: 0.8, maxLife: 0.8, size: state.rng.range(5, 9), color: '#5a564e',
        });
      }
    }
  }
  state.shake = Math.max(0, state.shake - dt * 26);
}

// ---------------------------------------------------------------- camera & prompts
function updateCamera(dt) {
  const focus = player.car ?? player;
  const lead = player.car ? 0.5 : 0.16;
  const tx = focus.x + (focus.vx ?? 0) * lead - renderer.view.w / 2;
  const ty = focus.y + (focus.vy ?? 0) * lead - renderer.view.h / 2;
  const k = Math.min(1, dt * 5.5);
  state.camera.x += (tx - state.camera.x) * k;
  state.camera.y += (ty - state.camera.y) * k;
  state.camera.x = clamp(state.camera.x, 0, Math.max(0, WORLD_W - renderer.view.w));
  state.camera.y = clamp(state.camera.y, 0, Math.max(0, WORLD_H - renderer.view.h));
  state.viewW = renderer.view.w;
  state.viewH = renderer.view.h;
}
state.camera.x = clamp(player.x - renderer.view.w / 2, 0, WORLD_W);
state.camera.y = clamp(player.y - renderer.view.h / 2, 0, WORLD_H);

function refreshObjectiveAndPrompt() {
  const obj = missions.objective();
  state.objective = obj;
  state.marker = obj && typeof obj.x === 'number' ? { x: obj.x, y: obj.y } : null;
  if (state.screen !== 'play') return;
  if (player.car) {
    state.prompt = speedOf(player.car) < 60 ? '<b>E</b> — Exit car' : null;
    return;
  }
  const car = nearestEnterableCar();
  if (car) {
    state.prompt = `<b>E</b> — Take the ${car.def.name}`;
    return;
  }
  const L = state.city.landmarks;
  if (dist(player.x, player.y, L.hardware.x, L.hardware.y) < 56) state.prompt = '<b>E</b> — Rico Hardware: shells, $40';
  else if (dist(player.x, player.y, L.hospital.x, L.hospital.y) < 56) state.prompt = '<b>E</b> — St. Coral clinic: treatment, $30';
  else if (dist(player.x, player.y, L.solCafe.x, L.solCafe.y) < 56) state.prompt = '<b>E</b> — Sinar Sol: nasi campur, $8';
  else if (!state.prompt || !state.prompt.includes('fare')) state.prompt = null;
}

// ---------------------------------------------------------------- the loop
let saveT = 20;
function stepWorld(dt) {
  const events = { busted: false };
  stepPlayer(dt);
  checkFarePickup();
  traffic.update(dt, state);
  pedsApi.update(dt, state);
  police.update(dt, state, events);
  combat.update(dt, state);
  missions.update(dt);
  collideCars(dt);
  collidePeople();
  updatePickups(dt);
  updateFx(dt);
  if (events.busted && state.screen === 'play') doBusted();
  saveT -= dt;
  if (saveT <= 0) {
    saveT = 25;
    if (state.screen === 'play') saveGame();
  }
}

let accumulator = 0;
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  accumulator += Math.min((now - last) / 1000, 0.25);
  last = now;
  const actions = input.takeActions();
  if ((actions & ACTION_PAUSE)) {
    if (state.screen === 'play') {
      document.getElementById('pause-stats').textContent =
        `Cash $${player.cash} · Earned $${state.stats.earned} · Cars taken ${state.stats.carsStolen} · Fares ${state.stats.faresDone} · Story: ${missions.index} of 4 jobs done`;
      setScreen('paused');
    } else if (state.screen === 'paused') setScreen('play');
  }
  if (state.screen === 'play') {
    while (accumulator >= STEP) {
      state.time += STEP;
      stepWorld(STEP);
      accumulator -= STEP;
      if (state.screen !== 'play') { accumulator = 0; break; }
    }
  } else if (state.screen === 'title') {
    // The city idles behind the title: traffic rolls, people stroll.
    while (accumulator >= STEP) {
      state.time += STEP;
      traffic.update(STEP, state);
      pedsApi.update(STEP, state);
      updateFx(STEP);
      accumulator -= STEP;
    }
  } else {
    accumulator = 0;
  }
  updateCamera(1 / 60);
  refreshObjectiveAndPrompt();
  audio.setEngine(state.screen === 'play' && !!player.car, player.car ? Math.abs(forwardSpeed(player.car)) / player.car.def.topSpeed : 0);
  audio.setSiren(state.screen === 'play' && state.sirenOn);
  renderer.draw(state);
  if (state.screen !== 'title') hud.update();
}

// ---------------------------------------------------------------- boot
if (shotName) {
  stageShot(shotName, {
    state,
    setScreen,
    enterCar,
    missions,
    police,
    hud,
    renderer,
    input,
  });
} else {
  setScreen('title');
  requestAnimationFrame(frame);
}

export { state };
