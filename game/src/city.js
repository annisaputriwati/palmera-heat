// Palmera City itself: a seeded layout of districts, avenues, buildings, palms and landmarks
// on a road grid, plus every spatial question the other systems ask — is this water, road,
// sidewalk; does a circle hit a building; where can a pedestrian walk. Generation is pure:
// the same seed grows the same city on every machine.

import {
  BEACH_END, H_ROADS, LANE_OFF, ROAD_W, SEA_W, SIDEWALK_W, V_ROADS, WORLD_H, WORLD_W,
} from './config.js';

export const DISTRICTS = ['Downtown', 'Palm Beach', 'Marina', 'Old Town', 'Industrial'];

/** Wall colours per district; a building's roof is drawn shaded from its wall colour. */
const PALETTES = {
  Downtown: ['#8fa6b8', '#7d94a8', '#a8bcc9', '#93a9bd', '#6f8aa3', '#b5c6d2'],
  'Palm Beach': ['#f4e3c2', '#f7d9b0', '#f2c9a4', '#f9ecd4', '#eec39b', '#f6dfba'],
  Marina: ['#eef2f0', '#dcebe8', '#cfe3e6', '#f2efe6', '#d8e6ee'],
  'Old Town': ['#e0a878', '#d9986a', '#c9855c', '#e8b184', '#d18a5f', '#e5ac7c'],
  Industrial: ['#9a8f83', '#8a8078', '#a39a8d', '#7d766d', '#94897c'],
};

/** Which district a world point belongs to (the sea and sand report Palm Beach). */
export function districtAt(x, y) {
  if (x < 1760 && y >= 2280) return 'Marina';
  if (x < 1760) return 'Palm Beach';
  if (x < 2960 && y < 2280) return 'Downtown';
  if (y >= 2280) return 'Industrial';
  return 'Old Town';
}

/** The x bands between roads (and the world edges): each band holds one column of blocks. */
function columnBands() {
  const edges = [BEACH_END, ...V_ROADS, WORLD_W];
  const bands = [];
  for (let i = 0; i + 1 < edges.length; i += 1) bands.push([edges[i], edges[i + 1]]);
  return bands;
}

/** The y bands between roads (and the world edges): each band holds one row of blocks. */
function rowBands() {
  const edges = [0, ...H_ROADS, WORLD_H];
  const bands = [];
  for (let i = 0; i + 1 < edges.length; i += 1) bands.push([edges[i], edges[i + 1]]);
  return bands;
}

/** Shrink a band by the road halves and the sidewalk on the sides that face a road. */
function blockInner(x0, x1, y0, y1) {
  const onRoadX = (v) => V_ROADS.includes(v);
  const onRoadY = (v) => H_ROADS.includes(v);
  const ix0 = x0 + (onRoadX(x0) ? ROAD_W / 2 + SIDEWALK_W : 4);
  const ix1 = x1 - (onRoadX(x1) ? ROAD_W / 2 + SIDEWALK_W : 4);
  const iy0 = y0 + (onRoadY(y0) ? ROAD_W / 2 + SIDEWALK_W : 4);
  const iy1 = y1 - (onRoadY(y1) ? ROAD_W / 2 + SIDEWALK_W : 4);
  return { x: ix0, y: iy0, w: ix1 - ix0, h: iy1 - iy0 };
}

export function createCity(rng) {
  const buildings = [];
  const palms = [];
  const lamps = [];
  const parkingLots = [];
  const parks = [];
  const pedLoops = [];
  const landmarks = {};

  const cols = columnBands();
  const rows = rowBands();

  // Landmark blocks, addressed by [column band index, row band index].
  const LANDMARK_BLOCKS = {
    solCafe: [5, 2],
    policeStation: [3, 2],
    hospital: [5, 1],
    hardware: [6, 1],
    cottage: [1, 1],
    resort: [2, 4],
    port: [1, 5],
    garage: [5, 3],
  };
  const LANDMARK_NAMES = {
    solCafe: 'Sinar Sol — Mama Sol\u2019s Stall',
    policeStation: 'Palmera PD',
    hospital: 'St. Coral Hospital',
    hardware: 'Rico Hardware',
    cottage: 'Don Aurelio\u2019s Cottage',
    resort: 'Azure Crown Resort',
    port: 'Port of Palmera — Pier 3',
    garage: 'Eddie\u2019s Garage',
  };

  for (let ci = 0; ci < cols.length; ci += 1) {
    for (let ri = 0; ri < rows.length; ri += 1) {
      const [x0, x1] = cols[ci];
      const [y0, y1] = rows[ri];
      const isBeachBand = ci === 0;
      const inner = blockInner(x0, x1, y0, y1);
      if (inner.w < 60 || inner.h < 60) continue;

      // The pedestrian loop: a rectangle path on the sidewalk around this block, inset by
      // half a road plus half a sidewalk on the sides that face a road.
      const insetX0 = V_ROADS.includes(x0) ? ROAD_W / 2 + SIDEWALK_W / 2 : SIDEWALK_W / 2;
      const insetX1 = V_ROADS.includes(x1) ? ROAD_W / 2 + SIDEWALK_W / 2 : SIDEWALK_W / 2;
      const insetY0 = H_ROADS.includes(y0) ? ROAD_W / 2 + SIDEWALK_W / 2 : SIDEWALK_W / 2;
      const insetY1 = H_ROADS.includes(y1) ? ROAD_W / 2 + SIDEWALK_W / 2 : SIDEWALK_W / 2;
      pedLoops.push({
        x: x0 + insetX0,
        y: y0 + insetY0,
        w: (x1 - x0) - insetX0 - insetX1,
        h: (y1 - y0) - insetY0 - insetY1,
      });

      if (isBeachBand) {
        // The promenade: open sand and grass, palms, no buildings.
        for (let i = 0; i < 7; i += 1) {
          palms.push({ x: rng.range(x0 + 26, x1 - 90), y: rng.range(y0 + 30, y1 - 30), s: rng.range(0.85, 1.25) });
        }
        continue;
      }

      const district = districtAt((x0 + x1) / 2, (y0 + y1) / 2);
      const landmarkKey = Object.keys(LANDMARK_BLOCKS).find(
        (key) => LANDMARK_BLOCKS[key][0] === ci && LANDMARK_BLOCKS[key][1] === ri,
      );

      if (ci === 6 && ri === 2) {
        // Old Town Square: an open plaza — fountain, palms, and the post where a bell
        // has not hung for forty years.
        parks.push({ ...inner, district, plaza: true });
        landmarks.oldTownSquare = {
          name: 'Old Town Square',
          x: inner.x + inner.w / 2,
          y: inner.y + inner.h / 2,
        };
        for (let i = 0; i < 5; i += 1) {
          palms.push({ x: rng.range(inner.x + 20, inner.x + inner.w - 20), y: rng.range(inner.y + 20, inner.y + inner.h - 20), s: rng.range(0.85, 1.2) });
        }
        continue;
      }

      if (landmarkKey) {
        const bw = Math.min(inner.w * 0.72, 300);
        const bh = Math.min(inner.h * 0.62, 240);
        const building = {
          x: inner.x + (inner.w - bw) / 2, y: inner.y + (inner.h - bh) / 2, w: bw, h: bh,
          floors: landmarkKey === 'policeStation' ? 5 : 3,
          color: '#e8e2d2', district, landmark: landmarkKey,
        };
        buildings.push(building);
        // The interaction point: on the sidewalk just south of the building's door.
        landmarks[landmarkKey] = {
          name: LANDMARK_NAMES[landmarkKey],
          x: building.x + bw / 2,
          y: Math.min(building.y + bh + SIDEWALK_W + 10, y1 - ROAD_W / 2 - 16),
          building,
        };
        continue;
      }

      const roll = rng.next();
      if (roll < 0.1) {
        parks.push({ ...inner, district });
        const count = rng.int(4, 8);
        for (let i = 0; i < count; i += 1) {
          palms.push({ x: rng.range(inner.x + 16, inner.x + inner.w - 16), y: rng.range(inner.y + 16, inner.y + inner.h - 16), s: rng.range(0.8, 1.3) });
        }
        continue;
      }
      if (roll < 0.2 && district !== 'Downtown') {
        parkingLots.push({ ...inner, district });
        continue;
      }

      // Ordinary buildings: split the block into lots sized for the district.
      const palette = PALETTES[district];
      let lotCols = 2;
      let lotRows = 2;
      let floorsMin = 2;
      let floorsMax = 4;
      if (district === 'Downtown') { lotCols = 2; lotRows = 2; floorsMin = 7; floorsMax = 15; }
      if (district === 'Industrial') { lotCols = 1; lotRows = 2; floorsMin = 1; floorsMax = 2; }
      if (district === 'Marina') { floorsMin = 3; floorsMax = 6; }
      if (district === 'Old Town') { lotCols = 3; lotRows = 2; floorsMin = 2; floorsMax = 3; }
      if (district === 'Palm Beach') { floorsMin = 2; floorsMax = 5; }
      const gap = 16;
      const lotW = (inner.w - gap * (lotCols - 1)) / lotCols;
      const lotH = (inner.h - gap * (lotRows - 1)) / lotRows;
      for (let lx = 0; lx < lotCols; lx += 1) {
        for (let ly = 0; ly < lotRows; ly += 1) {
          if (rng.chance(0.12)) continue; // an empty lot: a courtyard or a gap between buildings
          const inset = rng.range(2, 10);
          buildings.push({
            x: inner.x + lx * (lotW + gap) + inset,
            y: inner.y + ly * (lotH + gap) + inset,
            w: lotW - inset * 2,
            h: lotH - inset * 2,
            floors: rng.int(floorsMin, floorsMax),
            color: rng.pick(palette),
            district,
            landmark: null,
          });
        }
      }
      // A palm or two on the block's corners.
      if (rng.chance(0.6)) {
        palms.push({ x: inner.x + 8, y: inner.y + 8, s: rng.range(0.8, 1.15) });
      }
    }
  }

  // Beach palms along the sand, and lamps at every intersection corner.
  for (let y = 60; y < WORLD_H - 40; y += rng.range(120, 220)) {
    palms.push({ x: rng.range(330, 470), y, s: rng.range(0.9, 1.35) });
  }

  // The old lighthouse stands on the north rocks of the beach; its keeper's path down to
  // the sand is the hideout point the story ends at. Azure Crown's billboards watch the
  // Marina — the resort district they mean to buy first.
  const lighthouse = { x: 402, y: 218 };
  landmarks.lighthouse = { name: 'The Old Lighthouse', x: 452, y: 268 };
  const billboards = [
    { x: 452, y: 2380 },
    { x: 1470, y: 2338 },
    { x: 1005, y: 2822 },
  ];
  for (const vx of V_ROADS) {
    for (const hy of H_ROADS) {
      lamps.push({ x: vx - ROAD_W / 2 - 8, y: hy - ROAD_W / 2 - 8 });
      lamps.push({ x: vx + ROAD_W / 2 + 8, y: hy + ROAD_W / 2 + 8 });
    }
  }

  // A coarse spatial grid over the buildings, so collision queries stay cheap.
  const CELL = 300;
  const grid = new Map();
  function cellKey(cx, cy) {
    return cx * 1000 + cy;
  }
  buildings.forEach((building, index) => {
    const cx0 = Math.floor(building.x / CELL);
    const cx1 = Math.floor((building.x + building.w) / CELL);
    const cy0 = Math.floor(building.y / CELL);
    const cy1 = Math.floor((building.y + building.h) / CELL);
    for (let cx = cx0; cx <= cx1; cx += 1) {
      for (let cy = cy0; cy <= cy1; cy += 1) {
        const key = cellKey(cx, cy);
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(index);
      }
    }
  });

  function buildingsNear(x, y, r) {
    const found = new Set();
    const cx0 = Math.floor((x - r) / CELL);
    const cx1 = Math.floor((x + r) / CELL);
    const cy0 = Math.floor((y - r) / CELL);
    const cy1 = Math.floor((y + r) / CELL);
    for (let cx = cx0; cx <= cx1; cx += 1) {
      for (let cy = cy0; cy <= cy1; cy += 1) {
        const list = grid.get(cellKey(cx, cy));
        if (list) for (const index of list) found.add(index);
      }
    }
    return [...found].map((index) => buildings[index]);
  }

  function isWater(x, y) {
    return x < SEA_W && y >= 0 && y <= WORLD_H;
  }

  function isRoad(x, y) {
    if (x < 0 || y < 0 || x > WORLD_W || y > WORLD_H || isWater(x, y)) return false;
    for (const cx of V_ROADS) if (Math.abs(x - cx) <= ROAD_W / 2) return true;
    for (const cy of H_ROADS) if (Math.abs(y - cy) <= ROAD_W / 2) return true;
    return false;
  }

  function isSidewalk(x, y) {
    if (isRoad(x, y) || isWater(x, y)) return false;
    const grow = ROAD_W / 2 + SIDEWALK_W;
    for (const cx of V_ROADS) if (Math.abs(x - cx) <= grow && y >= 0 && y <= WORLD_H) return true;
    for (const cy of H_ROADS) if (Math.abs(y - cy) <= grow && x >= 0 && x <= WORLD_W) return true;
    return false;
  }

  /** True when a circle at (x, y) with radius r touches a building, the sea or the world edge. */
  function circleBlocked(x, y, r) {
    if (x - r < SEA_W + 2 || x + r > WORLD_W - 2 || y - r < 2 || y + r > WORLD_H - 2) return true;
    for (const b of buildingsNear(x, y, r + 4)) {
      const nx = Math.max(b.x, Math.min(x, b.x + b.w));
      const ny = Math.max(b.y, Math.min(y, b.y + b.h));
      const dx = x - nx;
      const dy = y - ny;
      if (dx * dx + dy * dy < r * r) return true;
    }
    return false;
  }

  /** Push a circle out of every building it overlaps; returns true when it had to move. */
  function resolveCircle(pos, r) {
    let hit = false;
    if (pos.x < SEA_W + r + 2) { pos.x = SEA_W + r + 2; hit = true; }
    if (pos.x > WORLD_W - r - 2) { pos.x = WORLD_W - r - 2; hit = true; }
    if (pos.y < r + 2) { pos.y = r + 2; hit = true; }
    if (pos.y > WORLD_H - r - 2) { pos.y = WORLD_H - r - 2; hit = true; }
    for (const b of buildingsNear(pos.x, pos.y, r + 4)) {
      const nx = Math.max(b.x, Math.min(pos.x, b.x + b.w));
      const ny = Math.max(b.y, Math.min(pos.y, b.y + b.h));
      let dx = pos.x - nx;
      let dy = pos.y - ny;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * r;
        pos.y = ny + (dy / d) * r;
      } else {
        // Centre inside the building: leave by the nearest face.
        const left = pos.x - b.x;
        const right = b.x + b.w - pos.x;
        const top = pos.y - b.y;
        const bottom = b.y + b.h - pos.y;
        const min = Math.min(left, right, top, bottom);
        if (min === left) pos.x = b.x - r;
        else if (min === right) pos.x = b.x + b.w + r;
        else if (min === top) pos.y = b.y - r;
        else pos.y = b.y + b.h + r;
        dx = 0; dy = 0;
      }
    }
    return hit;
  }

  /** The nearest point on any road centre line to (x, y). */
  function nearestRoadPoint(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const cx of V_ROADS) {
      const d = Math.abs(x - cx);
      if (d < bestD) { bestD = d; best = { x: cx, y, axis: 'v' }; }
    }
    for (const cy of H_ROADS) {
      const d = Math.abs(y - cy);
      if (d < bestD) { bestD = d; best = { x, y: cy, axis: 'h' }; }
    }
    return best;
  }

  /** A random spawn on the road network for a traffic car: a lane position and a heading. */
  function trafficSpawn(random) {
    if (random.chance(0.5)) {
      const cx = random.pick(V_ROADS);
      const dir = random.chance(0.5) ? 1 : -1;
      const x = cx + (dir > 0 ? -LANE_OFF : LANE_OFF);
      return { x, y: random.range(80, WORLD_H - 80), axis: 'v', dir, angle: dir > 0 ? Math.PI / 2 : -Math.PI / 2 };
    }
    const cy = random.pick(H_ROADS);
    const dir = random.chance(0.5) ? 1 : -1;
    const y = cy + (dir > 0 ? LANE_OFF : -LANE_OFF);
    return { x: random.range(620, WORLD_W - 80), y, axis: 'h', dir, angle: dir > 0 ? 0 : Math.PI };
  }

  return {
    width: WORLD_W,
    height: WORLD_H,
    buildings,
    palms,
    lamps,
    parkingLots,
    parks,
    pedLoops,
    landmarks,
    lighthouse,
    billboards,
    districtAt,
    isWater,
    isRoad,
    isSidewalk,
    circleBlocked,
    resolveCircle,
    buildingsNear,
    nearestRoadPoint,
    trafficSpawn,
  };
}
