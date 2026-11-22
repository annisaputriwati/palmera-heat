// Missions and side work — the La Paloma story, told as a state machine over the city.
// Four story jobs for Mama Sol and Los Guardianes, then free roam; between jobs, taxi fares
// pay cash and passengers gossip about a city quietly hiding its heritage. Each mission is
// steps with a target, an objective line and triggers (reach a place, enter a marked car,
// lose the police); this module owns the sequence, main.js owns the world it happens in,
// and the `api` callbacks are how the two talk.

import { dist } from './random.js';

/** What passengers say on the ride — Palmera talks, if you listen. */
export const GOSSIP = [
  'They say the lighthouse went dark last Tuesday. Nobody official will say why.',
  'My abuela swears she heard a ferry bell at dawn. The ferries stopped years ago.',
  'Azure Crown measured my street for a golf course yesterday. A golf course!',
  'If you see Mama Sol — tell her the bakers are with her. All of them.',
  'Inspector Vega? She lets the night buses run late on purpose. She\u2019s not all bad.',
  'Something\u2019s happening at the old lighthouse. Lights where there shouldn\u2019t be.',
  'The museum\u2019s best pieces are \u201Caway for restoration\u201D. Sure they are, sayang.',
  'Don Aurelio walked the whole coast road this morning. Eighty-four and furious.',
];

const STORY = [
  {
    title: 'Special Delivery',
    from: 'MAMA SOL',
    brief: 'Rio, sayang — a crate of \u201Ckitchen spices\u201D waits at Pier 3, at the Port. Don\u2019t shake it, don\u2019t open it, don\u2019t be late. The lunch rush waits for no one.',
    reward: 180,
  },
  {
    title: 'Borrowed Sunshine',
    from: 'MAMA SOL',
    brief: 'Listen. A \u201969 Solana Cabrio sits in the Azure Crown valet lot. It was Don Aurelio\u2019s — they took it for \u201Cunpaid resort taxes\u201D. Borrow it back. Eddie\u2019s garage in Old Town. Quietly.',
    reward: 260,
  },
  {
    title: 'The Keeper\u2019s Run',
    from: 'MAMA SOL',
    brief: 'Pick up Don Aurelio at his cottage, Rio. Gently — he\u2019s 84. And if Vega\u2019s people are watching the old man... drive like the ferry\u2019s leaving.',
    reward: 300,
  },
  {
    title: 'Ring the Dawn Bell',
    from: 'MAMA SOL',
    brief: 'Dawn, sayang. The gala truck carries La Paloma out of the Marina this morning. Take the truck. Bring the bell home to Old Town Square. Ring it loud.',
    reward: 500,
  },
];

export function createMissions(state, api) {
  const L = state.city.landmarks;
  let phase = 'idle'; // idle → active → (dialogue) → idle … → done
  let index = Math.min(state.missionIndex ?? 0, STORY.length);
  let step = 0;
  let timer = null;
  let penalty = 0;
  let waitT = 3;
  let targetCar = null;
  let passenger = false;
  let dialogue = [];
  let dialogueT = 0;
  if (index >= STORY.length) phase = 'done';

  function brief(i) {
    api.phone(STORY[i].from, STORY[i].brief, 9.5);
    api.toast(`Mission: ${STORY[i].title}`);
    phase = 'active';
    step = 0;
    timer = null;
    penalty = 0;
    if (i === 1) targetCar = api.spawnCabrio();
    if (i === 3) targetCar = api.spawnTruck();
  }

  function complete(i) {
    const reward = Math.max(60, STORY[i].reward - penalty);
    api.reward(reward);
    if (i === 0) api.phone('MAMA SOL', 'You just carried the lighthouse\u2019s eye, Rio. Questions later — the rush is on.', 8);
    if (i === 1) api.phone('EDDIE', 'This was Don Aurelio\u2019s car. They took it for \u201Cunpaid resort taxes\u201D. He gets it back tonight. You did good, kid.', 9);
    if (i === 2) api.phone('MAMA SOL', 'He\u2019s safe, and he told you true. Rest, sayang. Dawn is coming.', 8);
    index = i + 1;
    state.missionIndex = index;
    targetCar = null;
    passenger = false;
    timer = null;
    phase = 'idle';
    waitT = 8;
    api.saveGame();
  }

  function reach(target, radius) {
    const p = state.player;
    return target && dist(p.x, p.y, target.x, target.y) < radius;
  }

  /** main.js calls this whenever the player gets into a car. */
  function notifyEnteredCar(car) {
    if (phase !== 'active' || car !== targetCar) return;
    if (index === 1 && step === 0) {
      api.addCrime('stealCar', car.x, car.y);
      api.toast('That\u2019s her. Listen to that engine — now, Eddie\u2019s garage.');
      step = 1;
    }
    if (index === 3 && step === 0) {
      api.setHeat(4.2);
      timer = 240;
      api.toast('La Paloma is aboard. The whole city is watching — DRIVE.');
      step = 1;
    }
  }

  function update(dt) {
    if (dialogue.length) {
      dialogueT -= dt;
      if (dialogueT <= 0) {
        const line = dialogue.shift();
        api.phone(line.from, line.text, 7.5);
        dialogueT = 7.2;
        if (!dialogue.length) complete(2);
      }
      return;
    }
    // Taxi side work runs in every phase (fares are only offered between story jobs,
    // but a ride in progress must always be watched).
    updateTaxi(dt);
    if (phase === 'idle') {
      waitT -= dt;
      if (waitT <= 0 && index < STORY.length) brief(index);
      return;
    }
    if (phase !== 'active') return;

    if (timer !== null) {
      timer -= dt;
      if (timer <= 0) {
        if (index === 0) {
          timer = 90;
          penalty += 40;
          api.toast('Late! Mama Sol is not pleased — hurry!');
        } else if (index === 3) {
          timer = 240;
          api.toast('The gala resets — the bell is still yours to take. Again!');
        } else {
          timer = null;
        }
      }
    }

    if (index === 0) {
      if (step === 0 && reach(L.port, 54)) {
        api.toast('Crate loaded. It hums, faintly. Spices don\u2019t hum.');
        api.audio.pickup();
        timer = 150;
        step = 1;
      } else if (step === 1 && reach(L.solCafe, 54)) {
        complete(0);
      }
    } else if (index === 1) {
      if (step === 1 && state.player.car === targetCar && reach(L.garage, 58)) complete(1);
    } else if (index === 2) {
      if (step === 0 && reach(L.cottage, 56)) {
        passenger = true;
        api.setHeat(3.05);
        api.phone('INSPECTOR VEGA', 'Rio. Whatever you\u2019re carrying — pull over.', 6.5);
        api.toast('Don Aurelio is in. Now lose them.');
        step = 1;
      } else if (step === 1 && state.wanted.stars === 0) {
        step = 2;
        api.toast('Clear. The old lighthouse, quiet as you can.');
      } else if (step === 2 && reach(L.lighthouse, 64)) {
        dialogue = [
          { from: 'DON AURELIO', text: 'The crates, Rio. The lens you carried. The bell they keep at the gala. Palmera\u2019s heritage — piece by piece, Los Guardianes hides it all.' },
          { from: 'DON AURELIO', text: 'At dawn Azure Crown signs for the waterfront. But the heritage clause: if the pieces are missing, the sale is void.' },
          { from: 'DON AURELIO', text: 'One piece remains. La Paloma — the founding ferry bell. Tomorrow, at their gala... we take her back.' },
        ];
        dialogueT = 0.5;
        phase = 'dialogue';
      }
    } else if (index === 3) {
      if (step === 1) {
        if (state.wanted.heat < 3.4) api.setHeat(Math.min(4.6, state.wanted.heat + dt * 0.055));
        if (state.player.car === targetCar && reach(L.oldTownSquare, 74)) {
          index = 4;
          state.missionIndex = 4;
          phase = 'done';
          targetCar = null;
          timer = null;
          api.showEnding(); // main grants the $500 and saves the story-complete flag
        }
      }
    }
  }

  /** The current objective line and the world point it points at, if any. */
  function objective() {
    if (dialogue.length) return { text: 'Don Aurelio is telling the truth of it…' };
    if (phase === 'active') {
      const t = timer !== null ? ` — ${Math.ceil(timer)}s` : '';
      if (index === 0) {
        return step === 0
          ? { text: 'Pick up the sealed crate at Pier 3', x: L.port.x, y: L.port.y }
          : { text: `Deliver the crate to Sinar Sol${t}`, x: L.solCafe.x, y: L.solCafe.y };
      }
      if (index === 1) {
        if (step === 0) return { text: 'Steal the \u201969 Solana Cabrio from the Azure Crown valet lot', x: targetCar.x, y: targetCar.y };
        return state.player.car === targetCar
          ? { text: 'Deliver the Cabrio to Eddie\u2019s garage', x: L.garage.x, y: L.garage.y }
          : { text: 'Get back in the Cabrio', x: targetCar.x, y: targetCar.y };
      }
      if (index === 2) {
        if (step === 0) return { text: 'Pick up Don Aurelio at his cottage', x: L.cottage.x, y: L.cottage.y };
        if (step === 1) return { text: 'Lose the police!' };
        return { text: 'Take Don Aurelio to the old lighthouse', x: L.lighthouse.x, y: L.lighthouse.y };
      }
      if (index === 3) {
        if (step === 0) return { text: 'Steal the Azure Crown gala truck in the Marina', x: targetCar.x, y: targetCar.y };
        return state.player.car === targetCar
          ? { text: `Bring La Paloma to Old Town Square${t}`, x: L.oldTownSquare.x, y: L.oldTownSquare.y }
          : { text: 'Get back in the gala truck', x: targetCar.x, y: targetCar.y };
      }
    }
    if (state.taxi) {
      return { text: `Fare: drop your passenger — $${state.taxi.pay}`, x: state.taxi.dest.x, y: state.taxi.dest.y };
    }
    if (phase === 'done') return { text: 'Palmera is yours — fares pay, the city glows. Free roam.' };
    return { text: 'Keep your phone on — Mama Sol will call. Fares ($) pay cash.' };
  }

  // --- taxi side work ---
  function nearestLoopPoint(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const loop of state.city.pedLoops) {
      const cx = Math.max(loop.x, Math.min(x, loop.x + loop.w));
      const cy = Math.max(loop.y, Math.min(y, loop.y + loop.h));
      const d = dist(x, y, cx, cy);
      if (d < bestD) { bestD = d; best = { loop, x: cx, y: cy }; }
    }
    return best;
  }

  function relocatePed(ped, x, y) {
    const near = nearestLoopPoint(x, y);
    if (!near) return;
    ped.loop = near.loop;
    // Find the perimeter parameter of the closest point by walking the loop coarsely.
    let bestT = 0;
    let bestD = Infinity;
    const per = 2 * (near.loop.w + near.loop.h);
    for (let t = 0; t < per; t += 14) {
      const at = state.pedsApi.pointOnLoop(near.loop, t);
      const d = dist(x, y, at.x, at.y);
      if (d < bestD) { bestD = d; bestT = t; }
    }
    ped.t = bestT;
    ped.x = near.x;
    ped.y = near.y;
  }

  /** main.js calls this when the player, driving, stops beside a hailing pedestrian. */
  function tryPickup(ped) {
    if (state.taxi || phase === 'active') return false;
    const dests = [L.solCafe, L.hospital, L.resort, L.port, L.garage, L.oldTownSquare, L.cottage, L.policeStation];
    let dest = dests[Math.floor(state.rng.next() * dests.length)];
    if (dist(ped.x, ped.y, dest.x, dest.y) < 800) dest = L.hospital === dest ? L.resort : L.hospital;
    const pay = Math.round(dist(ped.x, ped.y, dest.x, dest.y) / 36) + 14;
    state.taxi = { ped, dest, pay };
    ped.state = 'riding';
    ped.fare = false;
    api.phone('PASSENGER', GOSSIP[Math.floor(state.rng.next() * GOSSIP.length)], 7);
    api.toast(`Fare aboard — ${dest.name}. $${pay} on the meter.`);
    return true;
  }

  function releasePed(x, y) {
    const ped = state.taxi.ped;
    ped.state = 'walk';
    ped.health = Math.max(ped.health, 60);
    relocatePed(ped, x, y);
    state.taxi = null;
  }

  function updateTaxi(dt) {
    void dt;
    const taxi = state.taxi;
    if (!taxi) return;
    const p = state.player;
    if (!p.car) {
      releasePed(p.x, p.y);
      api.toast('Fare bailed — no car, no ride.');
      return;
    }
    if (dist(p.car.x, p.car.y, taxi.dest.x, taxi.dest.y) < 60) {
      const speed = Math.sqrt(p.car.vx * p.car.vx + p.car.vy * p.car.vy);
      if (speed < 42) {
        api.reward(taxi.pay);
        api.audio.cash();
        state.stats.faresDone += 1;
        api.toast(`Fare paid: $${taxi.pay}. \u201CYou drive like a local.\u201D`);
        releasePed(taxi.dest.x + 16, taxi.dest.y + 10);
      }
    }
  }

  return {
    update,
    objective,
    notifyEnteredCar,
    tryPickup,
    get phase() { return phase; },
    get index() { return index; },
    get targetCar() { return targetCar; },
  };
}
