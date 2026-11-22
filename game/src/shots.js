// Screenshot staging. ?shot=<name>&seed=1 freezes a composed, deterministic scene instead
// of running the game loop: the world is the seeded world, but the player, the police and
// the props are placed by hand so each shot tells its part of the story. When the scene is
// painted, window.__shotReady is set so the capture script knows to fire.
//
//   1-cover   — the dawn run: the gala truck downtown, Vega on its tail, three stars up.
//   2-beach   — Rio on foot at Palm Beach, a fare hailing, the ocean doing its thing.
//   3-mission — the first crate: picked up at Pier 3, Mama Sol's briefing on the phone.
//   4-drive   — evening speed down the Marina coast road, fare on the minimap.

import { WORLD_H, WORLD_W } from './config.js';
import { clamp } from './random.js';
import { createCar } from './vehicles.js';

export function stageShot(name, game) {
  const { state, setScreen, hud, renderer } = game;
  const L = state.city.landmarks;
  const player = state.player;
  const view = renderer.view;

  function place(type, x, y, angle, color, driver) {
    const car = createCar(type, x, y, angle, color ?? '#888888');
    if (!color) car.color = car.def.colors[0];
    car.driver = driver ?? null;
    return state.addCar(car);
  }

  function moving(car, speed) {
    car.vx = Math.cos(car.angle) * speed;
    car.vy = Math.sin(car.angle) * speed;
  }

  function skids(points) {
    for (const [x, y, angle] of points) state.skids.push({ x, y, angle, alpha: 0.42 });
  }

  function snapCamera(cx, cy) {
    state.camera.x = clamp(cx - view.w / 2, 0, Math.max(0, WORLD_W - view.w));
    state.camera.y = clamp(cy - view.h / 2, 0, Math.max(0, WORLD_H - view.h));
    state.viewW = view.w;
    state.viewH = view.h;
  }

  setScreen('play');
  state.time = 12.4; // fixed phase for blinks and pulses: the stills never vary

  if (name === '1-cover') {
    // Downtown, the crossing at (2360, 1080): the gala truck runs east, heat on.
    const truck = place('truck', 2240, 1118, 0.06, '#274b63', 'player');
    moving(truck, 300);
    player.car = truck;
    player.x = truck.x;
    player.y = truck.y;
    const vega = place('police', 2062, 1152, 0.12, '#1d2126', 'police');
    vega.vega = true;
    moving(vega, 330);
    moving(place('police', 2090, 1058, -0.05, '#1d2126', 'police'), 320);
    moving(place('police', 2760, 1050, 2.7, '#1d2126', 'police'), 210);
    moving(place('police', 1900, 1160, 0.1, '#1d2126', 'police'), 300);
    moving(place('taxi', 2620, 1018, Math.PI, '#f5b921', 'traffic'), 150);
    moving(place('sedan', 2560, 1160, 0, '#5f8fd9', 'traffic'), 130);
    moving(place('van', 2330, 830, Math.PI / 2, '#8b98a5', 'traffic'), 120);
    game.police.setHeat(3.2);
    state.wanted.stars = 3;
    player.cash = 412;
    state.objective = { text: 'Bring La Paloma to Old Town Square — 197s', x: L.oldTownSquare.x, y: L.oldTownSquare.y };
    state.marker = { x: L.oldTownSquare.x, y: L.oldTownSquare.y };
    skids([[2130, 1108, 0.1], [2168, 1112, 0.08], [2205, 1116, 0.06], [2095, 1104, 0.12]]);
    state.spawnParticles(2150, 1130, { count: 8, color: '#ffb35c', speed: 120, life: 0.4, size: 3 });
    hud.showPhone('INSPECTOR VEGA', 'Rio. Whatever you\u2019re carrying — pull over.', 30);
    snapCamera(2350, 1090);
  } else if (name === '2-beach') {
    // On foot on the promenade: palms, people, a fare waiting by the kerb.
    player.x = 478;
    player.y = 1240;
    player.angle = Math.PI;
    player.walkPhase = 2.2;
    player.cash = 96;
    const spots = [[490, 1120], [486, 1360], [400, 1105], [424, 1430], [492, 1520]];
    state.peds.forEach((ped, i) => {
      if (i >= spots.length) return;
      ped.x = spots[i][0];
      ped.y = spots[i][1];
      ped.angle = i % 2 === 0 ? Math.PI / 2 : -Math.PI / 2;
      ped.walkPhase = i * 1.7;
    });
    const fare = state.peds[5];
    if (fare) {
      fare.x = 492;
      fare.y = 1330;
      fare.fare = true;
      fare.state = 'hail';
    }
    moving(place('taxi', 530, 1000, Math.PI / 2, '#f5b921', 'traffic'), 110);
    moving(place('sedan', 590, 1450, -Math.PI / 2, '#d96f5f', 'traffic'), 120);
    state.objective = { text: 'Keep your phone on — Mama Sol will call. Fares ($) pay cash.' };
    hud.showPhone('MAMA SOL', 'Rio, sayang — a crate of \u201Ckitchen spices\u201D waits at Pier 3, at the Port.', 30);
    snapCamera(470, 1250);
  } else if (name === '3-mission') {
    // Pier 3: the crate is loaded, the clock is running, Sinar Sol is across the city.
    const car = place('muscle', L.port.x + 40, L.port.y + 26, -0.2, '#c22f2f', 'player');
    player.car = car;
    player.x = car.x;
    player.y = car.y;
    player.cash = 124;
    moving(place('van', L.port.x - 190, L.port.y + 90, Math.PI / 2, '#d8d5cc', 'traffic'), 0);
    moving(place('van', L.port.x + 260, L.port.y - 60, Math.PI, '#5e6e7e', 'traffic'), 90);
    state.objective = { text: 'Deliver the crate to Sinar Sol — 128s', x: L.solCafe.x, y: L.solCafe.y };
    state.marker = { x: L.solCafe.x, y: L.solCafe.y };
    hud.showPhone('MAMA SOL', 'Don\u2019t shake it, don\u2019t open it, don\u2019t be late, sayang.', 30);
    snapCamera(car.x + 60, car.y);
  } else if (name === '4-drive') {
    // The coast road at golden hour: speed, a fare on the clock, one star of attention.
    const car = place('sedan', 530, 2520, Math.PI / 2, '#31435c', 'player');
    moving(car, 330);
    player.car = car;
    player.x = car.x;
    player.y = car.y;
    player.cash = 268;
    moving(place('police', 530, 2240, Math.PI / 2, '#1d2126', 'police'), 300);
    moving(place('compact', 590, 2700, -Math.PI / 2, '#e8e4da', 'traffic'), 170);
    moving(place('taxi', 530, 2850, Math.PI / 2, '#f5b921', 'traffic'), 150);
    game.police.setHeat(1.1);
    state.wanted.stars = 1;
    state.objective = { text: 'Fare: drop your passenger — $47', x: L.resort.x, y: L.resort.y };
    state.marker = { x: L.resort.x, y: L.resort.y };
    skids([[534, 2330, Math.PI / 2], [533, 2380, Math.PI / 2], [532, 2430, Math.PI / 2]]);
    hud.toast('Fare aboard — Azure Crown Resort. $47 on the meter.');
    snapCamera(560, 2500);
  } else {
    snapCamera(player.x, player.y);
  }

  renderer.draw(state);
  hud.update();
  renderer.draw(state);
  window.__shotReady = true;
}
