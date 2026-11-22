// Drawing only: the game state in, pixels out. The camera follows the player with a velocity
// lead and a little shake on impacts; the city is painted in layers — sea and sand, block
// ground, sidewalks, asphalt with lane paint and crosswalks, then buildings as oblique
// extrusions (a shaded south face, a darker east face, a lit roof) so the late sun rakes
// across them, then palms, pickups, cars, people, bullets, skid marks and the mission beacon.
// Everything is culled to the viewport; nothing here changes the game.

import { BEACH_END, COLORS, H_ROADS, ROAD_W, SEA_W, SIDEWALK_W, V_ROADS, WORLD_H, WORLD_W } from './config.js';

/** Multiply a #rrggbb colour's brightness. */
function shade(hex, factor) {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * factor));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * factor));
  const b = Math.min(255, Math.round((n & 255) * factor));
  return `rgb(${r},${g},${b})`;
}

/** A stable small hash of two numbers, for window patterns that must not flicker. */
function hash2(a, b) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { w: 1280, h: 720 };

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    view.w = canvas.width;
    view.h = canvas.height;
  }
  window.addEventListener('resize', resize);
  resize();

  function drawGround(state, cam) {
    const { city } = state;
    const x0 = cam.x - 80;
    const y0 = cam.y - 80;
    const x1 = cam.x + view.w + 80;
    const y1 = cam.y + view.h + 80;

    // Land base, then the sea with slow shimmer lines, then the beach.
    ctx.fillStyle = COLORS.blockGround;
    ctx.fillRect(SEA_W, 0, WORLD_W - SEA_W, WORLD_H);
    const waterGrad = ctx.createLinearGradient(0, 0, SEA_W, 0);
    waterGrad.addColorStop(0, COLORS.waterDeep);
    waterGrad.addColorStop(1, COLORS.water);
    ctx.fillStyle = waterGrad;
    ctx.fillRect(0, 0, SEA_W, WORLD_H);
    ctx.strokeStyle = 'rgba(255,255,255,0.13)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let y = 30; y < WORLD_H; y += 52) {
      const off = Math.sin(state.time * 0.7 + y * 0.05) * 9;
      ctx.moveTo(12 + off, y);
      ctx.lineTo(120 + off, y);
      ctx.moveTo(170 - off, y + 22);
      ctx.lineTo(278 - off, y + 22);
    }
    ctx.stroke();
    ctx.fillStyle = COLORS.sand;
    ctx.fillRect(SEA_W, 0, BEACH_END - SEA_W, WORLD_H);
    ctx.fillStyle = COLORS.sandWet;
    ctx.fillRect(SEA_W, 0, 26, WORLD_H);

    // Foam at the waterline: two soft, shifting rows of foam flecks, then sun-sparkle
    // scattered over the shallows, then grain on the dry sand.
    for (let y = Math.max(0, Math.floor(y0 / 24) * 24); y < y1; y += 24) {
      const wob = Math.sin(state.time * 0.9 + y * 0.045) * 5;
      const h = hash2(y, 7);
      ctx.fillStyle = 'rgba(255,252,240,0.4)';
      ctx.beginPath(); ctx.ellipse(SEA_W + 3 + wob * 0.4, y + h * 8, 9 + h * 9, 2.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,252,240,0.18)';
      ctx.beginPath(); ctx.ellipse(SEA_W - 15 - wob * 0.3, y + 12 + h * 6, 12 + h * 8, 2.2, 0, 0, Math.PI * 2); ctx.fill();
    }
    for (let gx = 8; gx < SEA_W - 6; gx += 46) {
      for (let gy = Math.max(4, Math.floor(y0 / 46) * 46); gy < y1; gy += 46) {
        const h = hash2(gx * 3, gy * 5);
        const tw = 0.5 + 0.5 * Math.sin(state.time * 1.6 + h * 41);
        if (h > 0.42) {
          ctx.fillStyle = `rgba(255,246,214,${0.05 + 0.13 * tw})`;
          ctx.fillRect(gx + h * 26, gy + h * 30, 3.4, 1.8);
        }
      }
    }
    for (let gx = SEA_W + 6; gx < BEACH_END - 4; gx += 38) {
      for (let gy = Math.max(4, Math.floor(y0 / 38) * 38); gy < y1; gy += 38) {
        const h = hash2(gx * 7, gy * 3);
        ctx.fillStyle = h > 0.5 ? 'rgba(146,116,64,0.10)' : 'rgba(255,250,230,0.12)';
        ctx.fillRect(gx + h * 22, gy + h * 24, 2.6, 1.7);
      }
    }

    // Beach umbrellas and towels scattered down the sand — Palmera's afternoons are busy.
    const UMBRELLAS = ['#e4572e', '#2a9d8f', '#f5b921', '#e86a92', '#3f7fbf'];
    for (let row = 0; row * 165 < WORLD_H; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        const ux = 352 + col * 52;
        const uy = 96 + row * 165 + col * 37;
        if (ux < x0 - 30 || ux > x1 + 30 || uy < y0 - 30 || uy > y1 + 30) continue;
        const h = hash2(ux * 3, uy * 7);
        if (h < 0.42) continue;
        const color = UMBRELLAS[Math.floor(h * 37) % UMBRELLAS.length];
        ctx.fillStyle = 'rgba(120,84,40,0.2)';
        ctx.beginPath(); ctx.ellipse(ux + 6, uy + 6, 15, 6, 0, 0, Math.PI * 2); ctx.fill();
        for (let s = 0; s < 6; s += 1) {
          ctx.fillStyle = s % 2 === 0 ? color : shade(color, 0.8);
          ctx.beginPath();
          ctx.moveTo(ux, uy);
          ctx.arc(ux, uy, 14.5, (s / 6) * Math.PI * 2, ((s + 1) / 6) * Math.PI * 2);
          ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = '#fdf6e3';
        ctx.beginPath(); ctx.arc(ux, uy, 2.4, 0, Math.PI * 2); ctx.fill();
        if (h > 0.68) {
          ctx.save();
          ctx.translate(ux + 16, uy + 13);
          ctx.rotate(h * 1.6 - 0.8);
          ctx.fillStyle = shade(color, 1.12);
          ctx.fillRect(-9, -5.5, 18, 11);
          ctx.fillStyle = 'rgba(255,255,255,0.65)';
          ctx.fillRect(-9, -1.2, 18, 2.4);
          ctx.restore();
        }
      }
    }

    // Parks and parking lots sit on the block ground.
    for (const park of city.parks) {
      ctx.fillStyle = COLORS.grass;
      ctx.fillRect(park.x, park.y, park.w, park.h);
      // Mow stripes and a gravel cross-path give the grass a kept look.
      ctx.fillStyle = 'rgba(255,255,240,0.055)';
      for (let sx = park.x + 17; sx < park.x + park.w; sx += 68) ctx.fillRect(sx, park.y, 17, park.h);
      ctx.fillStyle = 'rgba(217,196,154,0.75)';
      ctx.fillRect(park.x, park.y + park.h / 2 - 7, park.w, 14);
      ctx.fillRect(park.x + park.w / 2 - 7, park.y, 14, park.h);
      // Bush clusters at the corners.
      for (const [bx, by] of [[16, 16], [park.w - 16, 16], [16, park.h - 16], [park.w - 16, park.h - 16]]) {
        const h = hash2(park.x + bx, park.y + by);
        ctx.fillStyle = '#6f9a48';
        ctx.beginPath(); ctx.arc(park.x + bx, park.y + by, 8 + h * 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#7fae56';
        ctx.beginPath(); ctx.arc(park.x + bx - 4, park.y + by - 3, 5.5, 0, Math.PI * 2); ctx.fill();
      }
      if (park.plaza) {
        // Old Town Square: a stone plaza, a fountain, and the empty bell post.
        ctx.fillStyle = '#d9c49a';
        ctx.fillRect(park.x + 6, park.y + 6, park.w - 12, park.h - 12);
        const cx = park.x + park.w / 2;
        const cy = park.y + park.h / 2;
        // Radial paving rings and spokes around the fountain.
        ctx.strokeStyle = 'rgba(150,126,88,0.4)';
        ctx.lineWidth = 1.6;
        for (const r of [58, 78, 98]) {
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(150,126,88,0.22)';
        ctx.beginPath();
        for (let i = 0; i < 8; i += 1) {
          const a = (i / 8) * Math.PI * 2 + 0.39;
          ctx.moveTo(cx + Math.cos(a) * 48, cy + Math.sin(a) * 48);
          ctx.lineTo(cx + Math.cos(a) * 102, cy + Math.sin(a) * 102);
        }
        ctx.stroke();
        // Flower beds in the corners, benches facing the water.
        for (const [fx, fy] of [[-86, -64], [62, -64], [-86, 52], [62, 52]]) {
          ctx.fillStyle = '#7d9b4e';
          ctx.fillRect(cx + fx, cy + fy, 26, 13);
          for (let d = 0; d < 5; d += 1) {
            ctx.fillStyle = ['#e86a92', '#f5b921', '#fdf6e3'][d % 3];
            ctx.beginPath(); ctx.arc(cx + fx + 4 + d * 5, cy + fy + 3.5 + (d % 2) * 5, 1.9, 0, Math.PI * 2); ctx.fill();
          }
        }
        for (const [bx, by, rot] of [[-64, -8, 0], [58, -8, 0], [-8, -70, 1], [-8, 62, 1]]) {
          ctx.fillStyle = '#8a6844';
          if (rot) ctx.fillRect(cx + bx, cy + by, 7, 20); else ctx.fillRect(cx + bx, cy + by, 20, 7);
          ctx.fillStyle = 'rgba(50,32,14,0.5)';
          if (rot) ctx.fillRect(cx + bx + 2.6, cy + by, 1.8, 20); else ctx.fillRect(cx + bx, cy + by + 2.6, 20, 1.8);
        }
        // The fountain: a stone rim, tiled water, and a spray that never quite stops.
        ctx.fillStyle = '#b8a888';
        ctx.beginPath(); ctx.arc(cx, cy, 44, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#cdbb96';
        ctx.beginPath(); ctx.arc(cx, cy, 39, 0, Math.PI * 2); ctx.fill();
        const water = ctx.createRadialGradient(cx - 6, cy - 6, 3, cx, cy, 34);
        water.addColorStop(0, '#63c7dc');
        water.addColorStop(1, '#2f86a8');
        ctx.fillStyle = water;
        ctx.beginPath(); ctx.arc(cx, cy, 34, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(cx, cy, 24, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, 15, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        for (let i = 0; i < 9; i += 1) {
          const a = (i / 9) * Math.PI * 2 + state.time * 0.7;
          const r = 7 + (i % 3) * 3.4 + Math.sin(state.time * 2.2 + i) * 1.4;
          ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8, 1.6, 0, Math.PI * 2); ctx.fill();
        }
        ctx.beginPath(); ctx.arc(cx, cy, 3.2, 0, Math.PI * 2); ctx.fill();
        // The bell post on its stone platform, waiting forty years for La Paloma.
        ctx.fillStyle = '#b3a284';
        ctx.fillRect(cx - 42, cy - 32, 84, 13);
        ctx.fillStyle = 'rgba(60,40,20,0.25)';
        ctx.fillRect(cx - 42, cy - 21, 84, 2.4);
        ctx.strokeStyle = '#6b543a';
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(cx - 26, cy - 74); ctx.lineTo(cx - 26, cy - 32);
        ctx.moveTo(cx + 26, cy - 74); ctx.lineTo(cx + 26, cy - 32);
        ctx.moveTo(cx - 31, cy - 74); ctx.lineTo(cx + 31, cy - 74);
        ctx.stroke();
        ctx.lineWidth = 4.4;
        ctx.strokeStyle = '#8a4f2c';
        ctx.beginPath();
        ctx.moveTo(cx - 36, cy - 76); ctx.lineTo(cx, cy - 90); ctx.lineTo(cx + 36, cy - 76);
        ctx.stroke();
        ctx.strokeStyle = '#4c4438';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 74); ctx.lineTo(cx, cy - 63);
        ctx.stroke();
      }
    }
    for (const lot of city.parkingLots) {
      ctx.fillStyle = '#6d675f';
      ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
      ctx.strokeStyle = 'rgba(240,235,220,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = lot.x + 26; x < lot.x + lot.w - 10; x += 52) {
        ctx.moveTo(x, lot.y + 8);
        ctx.lineTo(x, lot.y + lot.h - 8);
      }
      ctx.stroke();
      // Oil stains and sun-faded patches, earned one leak at a time.
      for (let i = 0; i < 5; i += 1) {
        const h = hash2(lot.x + i * 61, lot.y + i * 37);
        ctx.fillStyle = `rgba(22,20,18,${0.05 + h * 0.07})`;
        ctx.beginPath();
        ctx.ellipse(lot.x + 20 + h * (lot.w - 40), lot.y + 16 + h * (lot.h - 32), 9 + h * 15, 6 + h * 8, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Ground grain over the blocks: dust, worn patches and sun-bleach, so no street
    // block reads as one flat sheet of colour. Roads and buildings paint over it.
    for (let gx = Math.max(BEACH_END, Math.floor(x0 / 52) * 52); gx < x1; gx += 52) {
      for (let gy = Math.max(0, Math.floor(y0 / 52) * 52); gy < y1; gy += 52) {
        const h = hash2(gx * 3, gy * 7);
        ctx.fillStyle = h > 0.5 ? 'rgba(122,94,52,0.07)' : 'rgba(255,248,226,0.08)';
        ctx.fillRect(gx + h * 34, gy + h * 36, 3, 2);
        if (h > 0.78) {
          ctx.fillStyle = 'rgba(122,94,52,0.05)';
          ctx.beginPath(); ctx.ellipse(gx + 26, gy + 26, 20 + h * 14, 12 + h * 8, 0, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    // Sidewalk bands first (wider), then the asphalt on top of them.
    ctx.fillStyle = COLORS.sidewalk;
    for (const cx of V_ROADS) ctx.fillRect(cx - ROAD_W / 2 - SIDEWALK_W, 0, ROAD_W + SIDEWALK_W * 2, WORLD_H);
    for (const cy of H_ROADS) ctx.fillRect(BEACH_END - 40, cy - ROAD_W / 2 - SIDEWALK_W, WORLD_W - BEACH_END + 40, ROAD_W + SIDEWALK_W * 2);
    ctx.fillStyle = COLORS.asphalt;
    for (const cx of V_ROADS) ctx.fillRect(cx - ROAD_W / 2, 0, ROAD_W, WORLD_H);
    for (const cy of H_ROADS) ctx.fillRect(BEACH_END - 40, cy - ROAD_W / 2, WORLD_W - BEACH_END + 40, ROAD_W);

    // Asphalt wear: patched tar, oil and sun-bleach along every street, then the kerb —
    // a shadow line on the pavement and a sunlit concrete lip inside the asphalt edge.
    for (const cx of V_ROADS) {
      for (let y = Math.max(0, Math.floor(y0 / 170) * 170); y < y1; y += 170) {
        const h = hash2(cx * 3, y * 7);
        if (h > 0.35) {
          ctx.fillStyle = `rgba(16,14,20,${0.04 + h * 0.05})`;
          ctx.beginPath(); ctx.ellipse(cx + (h - 0.5) * 64, y + h * 90, 16 + h * 22, 9 + h * 10, 0, 0, Math.PI * 2); ctx.fill();
        }
        if (h > 0.82) {
          ctx.fillStyle = 'rgba(233,228,216,0.05)';
          ctx.fillRect(cx - 24 + h * 20, y + 30, 34, 22);
        }
      }
    }
    for (const cy of H_ROADS) {
      for (let x = Math.max(BEACH_END, Math.floor(x0 / 170) * 170); x < x1; x += 170) {
        const h = hash2(x * 7, cy * 3);
        if (h > 0.35) {
          ctx.fillStyle = `rgba(16,14,20,${0.04 + h * 0.05})`;
          ctx.beginPath(); ctx.ellipse(x + h * 90, cy + (h - 0.5) * 64, 16 + h * 22, 9 + h * 10, 0, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(52,40,24,0.25)';
    for (const cx of V_ROADS) ctx.strokeRect(cx - ROAD_W / 2 - 2, -4, ROAD_W + 4, WORLD_H + 8);
    for (const cy of H_ROADS) ctx.strokeRect(BEACH_END - 44, cy - ROAD_W / 2 - 2, WORLD_W - BEACH_END + 48, ROAD_W + 4);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,240,205,0.18)';
    for (const cx of V_ROADS) ctx.strokeRect(cx - ROAD_W / 2 + 2, -4, ROAD_W - 4, WORLD_H + 8);
    for (const cy of H_ROADS) ctx.strokeRect(BEACH_END - 44, cy - ROAD_W / 2 + 2, WORLD_W - BEACH_END + 48, ROAD_W - 4);

    // Lane paint: edge lines and a dashed centre line, dashed through intersections too —
    // Palmera's road crews are not perfectionists.
    ctx.strokeStyle = 'rgba(233,228,216,0.68)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (const cx of V_ROADS) {
      ctx.moveTo(cx - ROAD_W / 2 + 5, 0); ctx.lineTo(cx - ROAD_W / 2 + 5, WORLD_H);
      ctx.moveTo(cx + ROAD_W / 2 - 5, 0); ctx.lineTo(cx + ROAD_W / 2 - 5, WORLD_H);
    }
    for (const cy of H_ROADS) {
      ctx.moveTo(BEACH_END - 40, cy - ROAD_W / 2 + 5); ctx.lineTo(WORLD_W, cy - ROAD_W / 2 + 5);
      ctx.moveTo(BEACH_END - 40, cy + ROAD_W / 2 - 5); ctx.lineTo(WORLD_W, cy + ROAD_W / 2 - 5);
    }
    ctx.stroke();
    ctx.strokeStyle = COLORS.laneLine;
    ctx.lineWidth = 3;
    ctx.setLineDash([26, 22]);
    ctx.beginPath();
    for (const cx of V_ROADS) { ctx.moveTo(cx, 0); ctx.lineTo(cx, WORLD_H); }
    for (const cy of H_ROADS) { ctx.moveTo(BEACH_END - 40, cy); ctx.lineTo(WORLD_W, cy); }
    ctx.stroke();
    ctx.setLineDash([]);

    // Crosswalks at every intersection.
    ctx.fillStyle = 'rgba(233,228,216,0.62)';
    for (const cx of V_ROADS) {
      for (const cy of H_ROADS) {
        for (let i = -2; i <= 2; i += 1) {
          ctx.fillRect(cx + i * 22 - 7, cy - ROAD_W / 2 - 15, 14, 11);
          ctx.fillRect(cx + i * 22 - 7, cy + ROAD_W / 2 + 4, 14, 11);
          ctx.fillRect(cx - ROAD_W / 2 - 15, cy + i * 22 - 7, 11, 14);
          ctx.fillRect(cx + ROAD_W / 2 + 4, cy + i * 22 - 7, 11, 14);
        }
      }
    }

    // Lamps: a post and a warm pool of light ready for dusk.
    for (const lamp of city.lamps) {
      if (lamp.x < x0 || lamp.x > x1 || lamp.y < y0 || lamp.y > y1) continue;
      ctx.fillStyle = 'rgba(255,190,90,0.16)';
      ctx.beginPath(); ctx.arc(lamp.x, lamp.y, 17, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3c3830';
      ctx.beginPath(); ctx.arc(lamp.x, lamp.y, 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd9a0';
      ctx.beginPath(); ctx.arc(lamp.x, lamp.y, 1.8, 0, Math.PI * 2); ctx.fill();
    }
    void x0; void y0;
  }

  /** Rooftop tint per landmark, so each named place reads as itself from the air. */
  const LANDMARK_TINTS = {
    solCafe: '#efdcae', policeStation: '#ccd6e2', hospital: '#dcefe9', hardware: '#ecd9ae',
    cottage: '#f0d3a0', resort: '#d8ecec', port: '#ddd5c2', garage: '#e3d3b8',
  };

  function drawBuildings(state, cam) {
    const x1 = cam.x + view.w + 120;
    const y1 = cam.y + view.h + 120;
    const x0 = cam.x - 120;
    const y0 = cam.y - 120;
    ctx.textAlign = 'center';
    for (const b of state.city.buildings) {
      if (b.x + b.w < x0 || b.x > x1 || b.y + b.h < y0 || b.y > y1) continue;
      const lift = Math.min(30, 5 + b.floors * 2.1);
      const ox = -lift * 0.42;
      const oy = -lift;
      const rx = b.x + ox;
      const ry = b.y + oy;
      const seedA = hash2(b.x * 1.71 + 13, b.y * 2.33 + 7);
      const seedB = hash2(b.x * 0.37 + 91, b.y * 1.13 + 47);
      // Long late shadows, thrown south-east, then the south and east faces, then the roof.
      ctx.fillStyle = 'rgba(74,40,8,0.15)';
      ctx.fillRect(b.x + 22, b.y + 28, b.w + 8, b.h + 6);
      ctx.fillStyle = 'rgba(74,40,8,0.26)';
      ctx.fillRect(b.x + 12, b.y + 16, b.w, b.h);
      ctx.fillStyle = shade(b.color, 0.78);
      ctx.beginPath();
      ctx.moveTo(b.x, b.y + b.h);
      ctx.lineTo(b.x + b.w, b.y + b.h);
      ctx.lineTo(b.x + b.w + ox, b.y + b.h + oy);
      ctx.lineTo(b.x + ox, b.y + b.h + oy);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(b.color, 0.6);
      ctx.beginPath();
      ctx.moveTo(b.x + b.w, b.y);
      ctx.lineTo(b.x + b.w, b.y + b.h);
      ctx.lineTo(b.x + b.w + ox, b.y + b.h + oy);
      ctx.lineTo(b.x + b.w + ox, b.y + oy);
      ctx.closePath(); ctx.fill();
      // The roof: a parapet lip around a sunlit inner slab, edged bright against the sky.
      ctx.fillStyle = shade(b.color, 1.16);
      ctx.fillRect(rx, ry, b.w, b.h);
      ctx.fillStyle = shade(b.color, 1.03);
      ctx.fillRect(rx + 6, ry + 6, b.w - 12, b.h - 12);
      if (b.landmark && LANDMARK_TINTS[b.landmark]) {
        ctx.fillStyle = LANDMARK_TINTS[b.landmark];
        ctx.globalAlpha = 0.34;
        ctx.fillRect(rx + 6, ry + 6, b.w - 12, b.h - 12);
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = 'rgba(60,40,20,0.4)';
      ctx.lineWidth = 2;
      ctx.strokeRect(rx + 6, ry + 6, b.w - 12, b.h - 12);
      ctx.strokeStyle = 'rgba(255,246,225,0.28)';
      ctx.lineWidth = 1;
      ctx.strokeRect(rx + 1, ry + 1, b.w - 2, b.h - 2);

      // Facade windows climb the south face: glass and lamplight downtown, shutters and
      // warm dark elsewhere. Rows ride the face's slant; columns march the frontage.
      const rows = b.floors >= 9 ? (lift >= 26 ? 3 : 2) : b.floors >= 4 ? 2 : b.floors >= 2 ? 1 : 0;
      if (rows > 0 && b.w > 62) {
        const cols = Math.max(2, Math.floor((b.w - 18) / 21));
        for (let r = 0; r < rows; r += 1) {
          const t = (r + 0.55) / (rows + 0.5);
          for (let c = 0; c < cols; c += 1) {
            const h = hash2(b.x + c * 41 + r * 7, b.y + r * 67 + c * 3);
            if (b.district !== 'Downtown' && h < 0.18) continue; // a shuttered, empty room
            const wx = b.x + 10 + c * 21 + ox * t;
            const wy = b.y + b.h - 2 + oy * t - 6;
            if (b.district === 'Downtown') {
              ctx.fillStyle = h > 0.74 ? 'rgba(255,206,116,0.92)' : h > 0.32 ? 'rgba(168,208,232,0.85)' : 'rgba(38,58,84,0.8)';
            } else if (h > 0.68) {
              ctx.fillStyle = 'rgba(255,196,102,0.9)';
            } else {
              ctx.fillStyle = 'rgba(32,42,56,0.6)';
            }
            ctx.fillRect(wx, wy, 10, 6);
            if (b.district === 'Old Town') {
              ctx.fillStyle = 'rgba(90,52,30,0.55)';
              ctx.fillRect(wx - 2.4, wy, 1.8, 6);
              ctx.fillRect(wx + 10.6, wy, 1.8, 6);
            }
          }
        }
      }

      // Roof character per district: Old Town tile rows, warehouse skylights, a plain seam.
      if (b.district === 'Old Town') {
        ctx.strokeStyle = 'rgba(146,64,38,0.20)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let ty = ry + 13; ty < ry + b.h - 9; ty += 9) {
          ctx.moveTo(rx + 9, ty);
          ctx.lineTo(rx + b.w - 9, ty);
        }
        ctx.stroke();
      } else if (b.district === 'Industrial') {
        const bands = 1 + Math.floor(seedA * 2.4);
        for (let i = 0; i < bands; i += 1) {
          const sy = ry + 14 + i * ((b.h - 30) / Math.max(1, bands));
          ctx.fillStyle = 'rgba(186,216,226,0.5)';
          ctx.fillRect(rx + 15, sy, b.w - 30, 9);
          ctx.strokeStyle = 'rgba(70,80,90,0.35)';
          ctx.lineWidth = 1;
          ctx.strokeRect(rx + 15, sy, b.w - 30, 9);
        }
        ctx.strokeStyle = 'rgba(40,36,32,0.10)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let sx = rx + 30; sx < rx + b.w - 12; sx += 34) {
          ctx.moveTo(sx, ry + 8);
          ctx.lineTo(sx, ry + b.h - 8);
        }
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(60,45,25,0.09)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(rx + 10, ry + b.h * (0.3 + seedA * 0.4));
        ctx.lineTo(rx + b.w - 10, ry + b.h * (0.3 + seedA * 0.4));
        ctx.stroke();
      }

      // Rooftop furniture, placed by hash so it never flickers: air-conditioning boxes,
      // a stair bulkhead, water tanks, vents — gardens, solar panels, one proud helipad.
      const iw = b.w - 26;
      const ih = b.h - 26;
      if (iw > 42 && ih > 36) {
        const px = (f, w) => rx + 13 + f * Math.max(1, iw - w);
        const py = (f, h) => ry + 13 + f * Math.max(1, ih - h);
        const acCount = b.floors >= 5 ? 2 + Math.floor(seedA * 2) : Math.floor(seedA * 2);
        for (let i = 0; i < acCount; i += 1) {
          const ax = px(hash2(b.x + i * 131, b.y + i * 57), 18);
          const ay = py(hash2(b.x + i * 71, b.y + i * 113), 14);
          ctx.fillStyle = '#878d91';
          ctx.fillRect(ax, ay, 18, 14);
          ctx.fillStyle = '#a7adb1';
          ctx.fillRect(ax + 1.5, ay + 1.5, 15, 8);
          ctx.strokeStyle = 'rgba(40,44,48,0.6)';
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(ax + 9, ay + 7, 4.4, 0, Math.PI * 2); ctx.stroke();
        }
        if (b.floors >= 7) {
          const bx = px(seedB, 25);
          const by = py(seedA, 17);
          ctx.fillStyle = shade(b.color, 0.9);
          ctx.fillRect(bx, by, 25, 17);
          ctx.strokeStyle = 'rgba(50,36,20,0.45)';
          ctx.lineWidth = 1.2;
          ctx.strokeRect(bx + 1, by + 1, 23, 15);
          ctx.fillStyle = 'rgba(40,30,18,0.6)';
          ctx.fillRect(bx + 10, by + 6, 5, 11);
        }
        if (b.floors >= 6 && seedB > 0.52) {
          const tx = px(1 - seedA * 0.4, 17);
          const ty = py(seedB * 0.4, 19);
          ctx.fillStyle = '#6e4f30';
          ctx.fillRect(tx + 2, ty + 12, 3, 7);
          ctx.fillRect(tx + 12, ty + 12, 3, 7);
          ctx.fillStyle = '#8a6844';
          ctx.fillRect(tx, ty + 3, 17, 11);
          ctx.fillStyle = '#a37c50';
          ctx.beginPath(); ctx.ellipse(tx + 8.5, ty + 3.5, 8.5, 3.4, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#5e4632';
          ctx.beginPath();
          ctx.moveTo(tx + 1, ty + 3);
          ctx.lineTo(tx + 8.5, ty - 3.4);
          ctx.lineTo(tx + 16, ty + 3);
          ctx.closePath(); ctx.fill();
        }
        if (b.floors >= 13) {
          const hx = rx + b.w / 2;
          const hy = ry + b.h / 2;
          ctx.strokeStyle = 'rgba(245,214,120,0.85)';
          ctx.lineWidth = 2.4;
          ctx.beginPath(); ctx.arc(hx, hy, 16, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = 'rgba(245,214,120,0.9)';
          ctx.font = '800 15px "Segoe UI", system-ui, sans-serif';
          ctx.fillText('H', hx, hy + 5.5);
        } else if ((b.district === 'Marina' || b.district === 'Palm Beach') && b.floors <= 6 && seedB > 0.5) {
          const gx = px(seedA, 32);
          const gy = py(seedB, 21);
          ctx.fillStyle = '#7fae56';
          ctx.fillRect(gx, gy, 32, 21);
          ctx.fillStyle = '#5e8a3e';
          ctx.fillRect(gx + 4, gy + 4, 10, 6);
          ctx.fillRect(gx + 19, gy + 11, 9, 6);
          ctx.fillStyle = '#e4572e';
          ctx.beginPath(); ctx.arc(gx + 24, gy + 6, 3.4, 0, Math.PI * 2); ctx.fill();
        } else if (b.district === 'Industrial' && seedA > 0.45) {
          const sx = px(seedB, 36);
          const sy = py(seedA, 22);
          ctx.fillStyle = '#22354e';
          ctx.fillRect(sx, sy, 36, 22);
          ctx.strokeStyle = 'rgba(140,190,230,0.55)';
          ctx.lineWidth = 1;
          for (let gl = 1; gl < 4; gl += 1) {
            ctx.beginPath(); ctx.moveTo(sx + gl * 9, sy); ctx.lineTo(sx + gl * 9, sy + 22); ctx.stroke();
          }
          ctx.beginPath(); ctx.moveTo(sx, sy + 11); ctx.lineTo(sx + 36, sy + 11); ctx.stroke();
        }
        if (seedA > 0.3) {
          for (let i = 0; i < 2; i += 1) {
            const vx = px(hash2(b.x + i * 313, b.y + i * 171), 6);
            const vy = py(hash2(b.x + i * 197, b.y + i * 271), 6);
            ctx.fillStyle = '#7d766d';
            ctx.beginPath(); ctx.arc(vx + 3, vy + 3, 3.4, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(255,250,235,0.7)';
            ctx.beginPath(); ctx.arc(vx + 2, vy + 2, 1.3, 0, Math.PI * 2); ctx.fill();
          }
        }
      }

      // Shopfronts at street level: a striped awning, and for some a lit sign board.
      const awningFor = b.district === 'Old Town' || b.landmark || (b.district === 'Marina' && seedB > 0.58);
      if (awningFor && b.w > 72) {
        const aw = Math.min(b.w * 0.52, 118);
        const ax = b.x + (b.w - aw) / 2;
        const ay = b.y + b.h - 1;
        const stripe = b.landmark === 'solCafe' ? '#3f7d4e' : b.district === 'Marina' ? '#2a7d8f' : '#c2502e';
        for (let sx = 0; sx < aw; sx += 8) {
          ctx.fillStyle = Math.floor(sx / 8) % 2 === 0 ? stripe : '#f3e6cf';
          ctx.beginPath();
          ctx.moveTo(ax + sx, ay);
          ctx.lineTo(ax + sx + 8, ay);
          ctx.lineTo(ax + sx + 10, ay + 9);
          ctx.lineTo(ax + sx + 2, ay + 9);
          ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = 'rgba(60,30,10,0.35)';
        ctx.fillRect(ax, ay + 9, aw + 2, 2);
        if (b.landmark || seedA > 0.45) {
          ctx.fillStyle = '#3a2c1c';
          ctx.fillRect(ax + aw * 0.14, ay - 15, aw * 0.72, 8.5);
          ctx.fillStyle = 'rgba(255,220,140,0.92)';
          ctx.fillRect(ax + aw * 0.14 + 3, ay - 11.6, aw * 0.72 - 6, 1.8);
        }
      }
      if (b.landmark) {
        ctx.font = '700 15px "Segoe UI", system-ui, sans-serif';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(30,18,6,0.85)';
        const label = state.city.landmarks[b.landmark].name.toUpperCase();
        ctx.strokeText(label, b.x + b.w / 2 + ox, b.y + oy - 10);
        ctx.fillStyle = '#ffe9a8';
        ctx.fillText(label, b.x + b.w / 2 + ox, b.y + oy - 10);
      }
    }
  }

  /** One extra board beyond the city's own, planted on the downtown canyon's south side. */
  const EXTRA_BILLBOARDS = [{ x: 2680, y: 1130 }];

  function drawBillboards(state) {
    for (const b of [...state.city.billboards, ...EXTRA_BILLBOARDS]) {
      ctx.fillStyle = 'rgba(74,40,8,0.3)';
      ctx.fillRect(b.x - 72 + 8, b.y - 20 + 10, 144, 42);
      ctx.fillStyle = '#5a4632';
      ctx.fillRect(b.x - 62, b.y + 12, 6, 16);
      ctx.fillRect(b.x + 56, b.y + 12, 6, 16);
      ctx.fillStyle = '#123a4d';
      ctx.fillRect(b.x - 76, b.y - 24, 152, 46);
      ctx.fillStyle = 'rgba(140,200,230,0.13)';
      ctx.fillRect(b.x - 76, b.y - 24, 76, 46);
      ctx.fillStyle = 'rgba(255,240,200,0.12)';
      ctx.fillRect(b.x - 76, b.y - 24, 152, 9);
      ctx.strokeStyle = '#d9a441';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(b.x - 76, b.y - 24, 152, 46);
      ctx.fillStyle = '#f5d67b';
      ctx.font = '800 16.5px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('AZURE CROWN', b.x, b.y - 3);
      ctx.fillStyle = '#cfe6ee';
      ctx.font = 'italic 10.5px "Segoe UI", system-ui, sans-serif';
      ctx.fillText('Palmera, Reimagined', b.x, b.y + 13);
      ctx.fillStyle = '#f5d67b';
      for (const lx of [-48, 0, 48]) {
        ctx.beginPath(); ctx.arc(b.x + lx, b.y + 19.5, 1.7, 0, Math.PI * 2); ctx.fill();
      }
    }
    // The old lighthouse: a round stone tower on the north beach, dark since Tuesday.
    const lh = state.city.lighthouse;
    ctx.fillStyle = 'rgba(74,40,8,0.3)';
    ctx.beginPath(); ctx.ellipse(lh.x + 9, lh.y + 8, 30, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8e2d2';
    ctx.beginPath(); ctx.arc(lh.x, lh.y, 24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c23b2e';
    ctx.beginPath(); ctx.arc(lh.x, lh.y, 24, 0, Math.PI * 0.62); ctx.lineTo(lh.x, lh.y); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(lh.x, lh.y, 24, Math.PI, Math.PI * 1.62); ctx.lineTo(lh.x, lh.y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8a8078';
    ctx.beginPath(); ctx.arc(lh.x, lh.y, 12.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3d3a42';
    ctx.beginPath(); ctx.arc(lh.x, lh.y, 7.5, 0, Math.PI * 2); ctx.fill();
  }

  /**
   * The Port of Palmera at work: a painted yard line, container stacks, crates by the
   * gate, and a gantry crane standing over the apron where La Paloma waits.
   */
  function drawPortProps(state, cam) {
    const port = state.city.buildings.find((b) => b.landmark === 'port');
    if (!port) return;
    if (port.x + port.w < cam.x - 340 || port.x > cam.x + view.w + 340
      || port.y + port.h < cam.y - 340 || port.y > cam.y + view.h + 340) return;
    const px = port.x;
    const py = port.y;
    const pw = port.w;
    const ph = port.h;
    // The yard line: dashed safety yellow around the apron.
    ctx.strokeStyle = 'rgba(245,185,33,0.55)';
    ctx.lineWidth = 3;
    ctx.setLineDash([16, 10]);
    ctx.strokeRect(px - 26, py - 30, pw + 52, ph + 118);
    ctx.setLineDash([]);
    // Container stacks west, east and north of the hall, some two high.
    const boxColors = ['#b5502f', '#2f6f8f', '#3f7d4e', '#7d8894', '#c2a13c', '#96503f'];
    const stack = (sx, sy, i, tall) => {
      ctx.fillStyle = 'rgba(20,14,8,0.18)';
      ctx.fillRect(sx + 4, sy + 25, 58, 5);
      const col = boxColors[Math.abs(Math.round(hash2(sx, sy) * 10 + i)) % boxColors.length];
      ctx.fillStyle = col;
      ctx.fillRect(sx, sy, 58, 24);
      ctx.strokeStyle = 'rgba(20,16,12,0.35)';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(sx + 1, sy + 1, 56, 22);
      ctx.beginPath();
      for (let g = 8; g < 56; g += 8) {
        ctx.moveTo(sx + g, sy + 2);
        ctx.lineTo(sx + g, sy + 22);
      }
      ctx.stroke();
      if (tall) {
        const col2 = boxColors[Math.abs(Math.round(hash2(sy, sx) * 10 + i + 3)) % boxColors.length];
        ctx.fillStyle = col2;
        ctx.fillRect(sx + 3, sy - 22, 58, 24);
        ctx.strokeStyle = 'rgba(20,16,12,0.35)';
        ctx.strokeRect(sx + 4, sy - 21, 56, 22);
        ctx.beginPath();
        for (let g = 8; g < 56; g += 8) {
          ctx.moveTo(sx + 3 + g, sy - 20);
          ctx.lineTo(sx + 3 + g, sy + 2);
        }
        ctx.stroke();
      }
    };
    stack(px - 96, py + 34, 0, true);
    stack(px - 96, py + 96, 1, false);
    stack(px - 96, py + 152, 2, true);
    stack(px + pw + 38, py + 30, 3, false);
    stack(px + pw + 38, py + 92, 4, true);
    stack(px + pw + 38, py + 158, 5, false);
    stack(px + 18, py - 84, 6, false);
    stack(px + 96, py - 84, 7, true);
    stack(px + 174, py - 84, 8, false);
    // Crates by the pickup gate.
    const gate = state.city.landmarks.port;
    for (const [cx2, cy2, s] of [[gate.x - 74, gate.y + 44, 17], [gate.x - 52, gate.y + 52, 13], [gate.x - 66, gate.y + 30, 11]]) {
      ctx.fillStyle = '#a9825a';
      ctx.fillRect(cx2, cy2, s, s);
      ctx.strokeStyle = 'rgba(70,48,24,0.7)';
      ctx.lineWidth = 1.6;
      ctx.strokeRect(cx2 + 1, cy2 + 1, s - 2, s - 2);
      ctx.beginPath();
      ctx.moveTo(cx2 + 1, cy2 + 1); ctx.lineTo(cx2 + s - 1, cy2 + s - 1);
      ctx.moveTo(cx2 + s - 1, cy2 + 1); ctx.lineTo(cx2 + 1, cy2 + s - 1);
      ctx.stroke();
    }
    // The gantry crane across the south apron: legs, a beam with hazard-striped ends,
    // a trolley, and one container hanging patient on its cables.
    const gy = py + ph + 46;
    ctx.strokeStyle = '#3d4750';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(px - 30, gy + 60); ctx.lineTo(px - 30, gy);
    ctx.moveTo(px + pw + 30, gy + 60); ctx.lineTo(px + pw + 30, gy);
    ctx.moveTo(px - 40, gy); ctx.lineTo(px + pw + 40, gy);
    ctx.stroke();
    ctx.fillStyle = '#e8b13c';
    ctx.fillRect(px - 40, gy - 5, 26, 10);
    ctx.fillRect(px + pw + 14, gy - 5, 26, 10);
    ctx.fillStyle = '#2c333a';
    ctx.fillRect(px + pw * 0.52, gy - 8, 26, 13);
    ctx.strokeStyle = 'rgba(30,34,40,0.8)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(px + pw * 0.52 + 4, gy + 5); ctx.lineTo(px + pw * 0.52 + 4, gy + 26);
    ctx.moveTo(px + pw * 0.52 + 22, gy + 5); ctx.lineTo(px + pw * 0.52 + 22, gy + 26);
    ctx.stroke();
    ctx.fillStyle = '#2f6f8f';
    ctx.fillRect(px + pw * 0.52 - 12, gy + 26, 58, 24);
    ctx.strokeStyle = 'rgba(20,16,12,0.4)';
    ctx.strokeRect(px + pw * 0.52 - 11, gy + 27, 56, 22);
  }

  function drawPalms(state, cam) {
    const x1 = cam.x + view.w + 60;
    const y1 = cam.y + view.h + 60;
    const x0 = cam.x - 60;
    const y0 = cam.y - 60;
    for (const palm of state.city.palms) {
      if (palm.x < x0 || palm.x > x1 || palm.y < y0 || palm.y > y1) continue;
      const s = palm.s;
      ctx.fillStyle = 'rgba(74,40,8,0.22)';
      ctx.beginPath(); ctx.ellipse(palm.x + 8, palm.y + 6, 13 * s, 5 * s, 0, 0, Math.PI * 2); ctx.fill();
      // The fronds' own shadow, thrown long across the promenade by the low sun.
      ctx.strokeStyle = 'rgba(46,84,32,0.20)';
      ctx.lineWidth = 2.4 * s;
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2 + 0.5;
        ctx.moveTo(palm.x + 15 * s, palm.y + 13 * s);
        ctx.quadraticCurveTo(
          palm.x + 15 * s + Math.cos(a) * 9 * s, palm.y + 13 * s + Math.sin(a) * 5 * s,
          palm.x + 15 * s + Math.cos(a) * 16 * s, palm.y + 13 * s + Math.sin(a) * 9 * s,
        );
      }
      ctx.stroke();
      ctx.strokeStyle = '#8a6844';
      ctx.lineWidth = 3.4 * s;
      ctx.beginPath();
      ctx.moveTo(palm.x, palm.y);
      ctx.quadraticCurveTo(palm.x + 3 * s, palm.y - 10 * s, palm.x + 6 * s, palm.y - 17 * s);
      ctx.stroke();
      const tx = palm.x + 6 * s;
      const ty = palm.y - 17 * s;
      ctx.strokeStyle = hash2(palm.x, palm.y) > 0.5 ? '#4e8f3e' : '#5da24a';
      ctx.lineWidth = 2.6 * s;
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2 + 0.5;
        ctx.moveTo(tx, ty);
        ctx.quadraticCurveTo(tx + Math.cos(a) * 9 * s, ty + Math.sin(a) * 5 * s - 2, tx + Math.cos(a) * 15 * s, ty + Math.sin(a) * 9 * s + 4 * s);
      }
      ctx.stroke();
      // A pair of coconuts tucked under the crown.
      ctx.fillStyle = '#6e5136';
      ctx.beginPath(); ctx.arc(tx - 2.4 * s, ty + 2.6 * s, 2.3 * s, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(tx + 2.2 * s, ty + 3.1 * s, 2 * s, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawPickups(state) {
    for (const p of state.pickups) {
      const bob = Math.sin(state.time * 3.2 + p.phase) * 3;
      ctx.fillStyle = 'rgba(255,220,120,0.25)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 10, 15, 5.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.save();
      ctx.translate(p.x, p.y + bob);
      if (p.kind === 'health') {
        ctx.fillStyle = '#f2f2ee';
        ctx.fillRect(-10, -10, 20, 20);
        ctx.fillStyle = '#d9382b';
        ctx.fillRect(-3, -7, 6, 14);
        ctx.fillRect(-7, -3, 14, 6);
      } else if (p.kind === 'ammo') {
        ctx.fillStyle = '#3d4438';
        ctx.fillRect(-11, -8, 22, 16);
        ctx.fillStyle = '#e8c96a';
        ctx.fillRect(-7, -5, 4, 9);
        ctx.fillRect(-1, -5, 4, 9);
        ctx.fillRect(5, -5, 4, 9);
      } else {
        ctx.fillStyle = '#3f9e4d';
        ctx.fillRect(-11, -7, 22, 14);
        ctx.fillStyle = '#ffe9a8';
        ctx.font = '800 12px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('$', 0, 4.5);
      }
      ctx.restore();
    }
  }

  function drawCar(state, car) {
    const { def } = car;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.fillStyle = 'rgba(40,22,4,0.13)';
    ctx.beginPath(); ctx.ellipse(8, 10, def.len * 0.58, def.wid * 0.62, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(40,22,4,0.3)';
    ctx.beginPath(); ctx.ellipse(5, 7, def.len * 0.52, def.wid * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(car.angle);
    const L = def.len;
    const W = def.wid;
    // Wheels (the front pair turns with the steering).
    ctx.fillStyle = '#17181c';
    const wy = W / 2 - 3;
    ctx.fillRect(L * 0.26, -wy - 3, 15, 6);
    ctx.fillRect(L * 0.26, wy - 3, 15, 6);
    ctx.fillRect(-L * 0.38, -wy - 3, 15, 6);
    ctx.fillRect(-L * 0.38, wy - 3, 15, 6);
    ctx.save();
    ctx.translate(L * 0.3, 0);
    ctx.rotate(car.steerVis * 0.8);
    ctx.fillRect(-7, -wy - 3, 15, 6);
    ctx.fillRect(-7, wy - 3, 15, 6);
    ctx.restore();
    // Body.
    ctx.fillStyle = car.color;
    ctx.beginPath();
    ctx.roundRect(-L / 2, -W / 2, L, W, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,16,10,0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Sunlight along the roofline edge, shade along the sill.
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    ctx.fillRect(-L / 2 + 5, -W / 2 + 1.6, L - 10, 2.6);
    ctx.fillStyle = 'rgba(20,12,4,0.16)';
    ctx.fillRect(-L / 2 + 5, W / 2 - 4.2, L - 10, 2.6);
    if (car.type === 'police') {
      ctx.fillStyle = '#eef1f4';
      ctx.fillRect(-L * 0.16, -W / 2 + 2, L * 0.3, W - 4);
      ctx.fillStyle = Math.floor(state.time * 2.4) % 2 === 0 ? '#ff3b30' : '#3b82ff';
      ctx.fillRect(-7, -W / 2 + 4, 14, 6);
      ctx.fillStyle = Math.floor(state.time * 2.4) % 2 === 0 ? '#3b82ff' : '#ff3b30';
      ctx.fillRect(-7, W / 2 - 10, 14, 6);
    }
    if (car.type === 'taxi') {
      ctx.fillStyle = '#22242c';
      ctx.fillRect(-8, -8, 16, 16);
      ctx.fillStyle = '#f5b921';
      ctx.font = '800 10px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', 0, 3.5);
      // Checker stripes down both flanks, because Palmera taxis insist.
      ctx.fillStyle = '#22242c';
      for (let i = 0; i < 6; i += 1) {
        const cxp = -L / 2 + 6 + i * 6.4;
        if (i % 2 === 0) {
          ctx.fillRect(cxp, -W / 2 + 1.4, 3.2, 3);
          ctx.fillRect(cxp, W / 2 - 4.4, 3.2, 3);
        } else {
          ctx.fillRect(cxp, -W / 2 + 4.4, 3.2, 3);
          ctx.fillRect(cxp, W / 2 - 7.4, 3.2, 3);
        }
      }
    }
    if (car.type === 'muscle') {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillRect(-L / 2 + 4, -3.5, L - 8, 7);
    }
    if (car.type === 'truck') {
      // The Azure Crown gala truck: a long cargo box behind a short cab.
      ctx.fillStyle = shade(car.color, 1.25);
      ctx.fillRect(-L / 2 + 2, -W / 2 + 3, L * 0.58, W - 6);
      ctx.strokeStyle = 'rgba(217,164,65,0.8)';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(-L / 2 + 2, -W / 2 + 3, L * 0.58, W - 6);
      ctx.fillStyle = '#f5d67b';
      ctx.beginPath();
      for (const gx of [-7, 0, 7]) {
        ctx.moveTo(-L * 0.33 + gx - 2.6, -W / 2 + 15);
        ctx.lineTo(-L * 0.33 + gx, -W / 2 + 9);
        ctx.lineTo(-L * 0.33 + gx + 2.6, -W / 2 + 15);
        ctx.closePath();
      }
      ctx.fill();
      ctx.font = '800 9.5px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('AZURE', -L * 0.33, 0);
      ctx.fillText('CROWN', -L * 0.33, 11);
      ctx.fillRect(-L * 0.33 - 13, 14.5, 26, 1.6);
    }
    // Cabin and glass.
    ctx.fillStyle = shade(car.color, 0.72);
    ctx.beginPath();
    ctx.roundRect(-L * 0.18, -W / 2 + 5, L * 0.36, W - 10, 5);
    ctx.fill();
    if (car.type === 'cabrio') {
      // Open top: two cream seats and the folded hood behind them.
      ctx.fillStyle = '#8d2f26';
      ctx.fillRect(-L * 0.14, -W / 2 + 8, L * 0.13, 9);
      ctx.fillRect(-L * 0.14, W / 2 - 17, L * 0.13, 9);
      ctx.fillStyle = '#5e4632';
      ctx.fillRect(-L * 0.3, -W / 2 + 6, L * 0.08, W - 12);
    }
    ctx.fillStyle = 'rgba(170,215,235,0.85)';
    ctx.fillRect(L * 0.1, -W / 2 + 7, 6, W - 14);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(L * 0.1 + 1.4, -W / 2 + 9, 2, W - 18);
    ctx.fillStyle = 'rgba(96,138,168,0.85)';
    ctx.fillRect(-L * 0.2, -W / 2 + 7, 5, W - 14);
    // Wing mirrors.
    ctx.fillStyle = '#22242c';
    ctx.fillRect(L * 0.13, -W / 2 - 1.6, 5, 3);
    ctx.fillRect(L * 0.13, W / 2 - 1.4, 5, 3);
    // Lights.
    ctx.fillStyle = '#fff3c4';
    ctx.fillRect(L / 2 - 3, -W / 2 + 4, 3.4, 6);
    ctx.fillRect(L / 2 - 3, W / 2 - 10, 3.4, 6);
    ctx.fillStyle = car.braking ? '#ff5040' : '#a02820';
    ctx.fillRect(-L / 2 - 0.5, -W / 2 + 4, 3.4, 6);
    ctx.fillRect(-L / 2 - 0.5, W / 2 - 10, 3.4, 6);
    if (car.type === 'police') {
      // The roof light bar, drawn over the glass so it reads at screenshot distance:
      // a soft alternating glow, the bar itself, and a push bar on the nose.
      const phase = Math.floor(state.time * 2.4) % 2 === 0;
      ctx.fillStyle = phase ? 'rgba(255,70,50,0.16)' : 'rgba(70,130,255,0.16)';
      ctx.beginPath(); ctx.ellipse(0, 0, 16, W * 0.54, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#22242c';
      ctx.fillRect(-4.5, -W / 2 + 8, 9, W - 16);
      ctx.fillStyle = phase ? '#ff3b30' : '#7a1610';
      ctx.fillRect(-4.5, -W / 2 + 8, 9, (W - 16) / 2);
      ctx.fillStyle = phase ? '#173a7a' : '#3b82ff';
      ctx.fillRect(-4.5, 0, 9, (W - 16) / 2);
      ctx.fillStyle = '#2c2f36';
      ctx.fillRect(L / 2 - 1, -W / 2 + 6, 3.4, W - 12);
    }
    // Damage scorch.
    if (car.health < 55) {
      ctx.fillStyle = `rgba(25,22,20,${0.35 * (1 - car.health / 55)})`;
      ctx.beginPath();
      ctx.roundRect(-L / 2, -W / 2, L * 0.4, W, 8);
      ctx.fill();
    }
    ctx.restore();
    if (car.vega) {
      ctx.font = '800 11px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3.4;
      ctx.strokeStyle = 'rgba(20,10,4,0.85)';
      ctx.strokeText('INSPECTOR VEGA', car.x, car.y - def.wid / 2 - 12);
      ctx.fillStyle = '#ffd94d';
      ctx.fillText('INSPECTOR VEGA', car.x, car.y - def.wid / 2 - 12);
    }
  }

  function drawPerson(state, x, y, angle, shirt, skin, bobPhase, isPlayer) {
    ctx.fillStyle = 'rgba(40,22,4,0.28)';
    ctx.beginPath(); ctx.ellipse(x + 3, y + 4, 9, 4.5, 0, 0, Math.PI * 2); ctx.fill();
    const bob = Math.sin(bobPhase) * 1.4;
    ctx.save();
    ctx.translate(x, y + bob * 0.3);
    ctx.rotate(angle);
    ctx.fillStyle = shirt;
    ctx.beginPath(); ctx.arc(0, 0, 8.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(1, -8.6, 7.6, 17.2);
    ctx.restore();
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(x, y + bob * 0.3, 4.6, 0, Math.PI * 2); ctx.fill();
    // A cap of hair, its colour picked from the shirt so it never changes mid-stride.
    const hairPick = (shirt.charCodeAt(1) * 7 + shirt.charCodeAt(3) * 13 + shirt.charCodeAt(5)) % 5;
    ctx.fillStyle = ['#2b2118', '#4a3220', '#17130f', '#6e5136', '#8a8d91'][hairPick];
    ctx.beginPath(); ctx.arc(x, y + bob * 0.3 - 1.7, 3.7, 0, Math.PI * 2); ctx.fill();
    if (isPlayer) {
      ctx.strokeStyle = 'rgba(255,233,168,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 13.5, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function drawMarker(state) {
    const marker = state.marker;
    if (!marker) return;
    const pulse = 0.72 + Math.sin(state.time * 4) * 0.28;
    const grad = ctx.createLinearGradient(0, marker.y - 210, 0, marker.y);
    grad.addColorStop(0, 'rgba(245,185,33,0)');
    grad.addColorStop(1, `rgba(245,185,33,${0.5 * pulse})`);
    ctx.fillStyle = grad;
    ctx.fillRect(marker.x - 13, marker.y - 210, 26, 210);
    ctx.strokeStyle = `rgba(245,185,33,${0.85 * pulse})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(marker.x, marker.y, 24 + pulse * 5, 10 + pulse * 2, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.save();
    ctx.translate(marker.x, marker.y - 196 + Math.sin(state.time * 2.4) * 6);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#f5b921';
    ctx.fillRect(-8, -8, 16, 16);
    ctx.strokeStyle = '#7a4d00';
    ctx.lineWidth = 2;
    ctx.strokeRect(-8, -8, 16, 16);
    ctx.restore();
  }

  /** Paint one frame of the world (the HUD is DOM, drawn by hud.js). */
  function draw(state) {
    const cam = state.camera;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#155e73';
    ctx.fillRect(0, 0, view.w, view.h);
    const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    ctx.translate(-cam.x + shakeX, -cam.y + shakeY);

    drawGround(state, cam);
    drawBuildings(state, cam);
    drawBillboards(state);
    drawPortProps(state, cam);
    drawPalms(state, cam);
    drawPickups(state);

    // Skid marks under everything that moves.
    for (const skid of state.skids) {
      ctx.strokeStyle = `rgba(24,22,26,${skid.alpha})`;
      ctx.lineWidth = 4.4;
      ctx.beginPath();
      ctx.moveTo(skid.x, skid.y);
      ctx.lineTo(skid.x - Math.cos(skid.angle) * 13, skid.y - Math.sin(skid.angle) * 13);
      ctx.stroke();
    }

    for (const car of state.cars) {
      if (car.x < cam.x - 140 || car.x > cam.x + view.w + 140 || car.y < cam.y - 140 || car.y > cam.y + view.h + 140) continue;
      drawCar(state, car);
    }
    for (const ped of state.peds) {
      if (ped.x < cam.x - 60 || ped.x > cam.x + view.w + 60 || ped.y < cam.y - 60 || ped.y > cam.y + view.h + 60) continue;
      if (ped.state === 'down') {
        ctx.save();
        ctx.translate(ped.x, ped.y);
        ctx.rotate(ped.angle);
        ctx.fillStyle = shade(ped.shirt, 0.6);
        ctx.beginPath(); ctx.ellipse(0, 0, 11, 5.4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else {
        drawPerson(state, ped.x, ped.y, ped.angle, ped.shirt, ped.skin, ped.walkPhase, false);
        if (ped.fare) {
          const bob = Math.sin(state.time * 4 + ped.phase) * 3;
          ctx.fillStyle = '#ffd94d';
          ctx.font = '800 17px "Segoe UI", system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('$', ped.x, ped.y - 17 + bob);
        }
      }
    }
    const player = state.player;
    if (!player.car) {
      drawPerson(state, player.x, player.y, player.angle, '#0f766e', '#c68863', player.walkPhase, true);
      if (player.weapon === 'pistol') {
        ctx.strokeStyle = '#22242c';
        ctx.lineWidth = 3.4;
        ctx.beginPath();
        ctx.moveTo(player.x + Math.cos(player.aimAngle) * 8, player.y + Math.sin(player.aimAngle) * 8);
        ctx.lineTo(player.x + Math.cos(player.aimAngle) * 17, player.y + Math.sin(player.aimAngle) * 17);
        ctx.stroke();
      }
    }
    // Bullets as short bright streaks.
    ctx.strokeStyle = '#ffe9a8';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (const b of state.bullets) {
      ctx.moveTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    // Particles.
    for (const p of state.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    drawMarker(state);

    // Golden hour, laid over the whole frame: a warm wash from the low western sun
    // and a breath of dusk in the far corner. Screen space, two gradients, done.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const wash = ctx.createLinearGradient(0, 0, view.w * 0.4, view.h);
    wash.addColorStop(0, 'rgba(255,170,80,0.13)');
    wash.addColorStop(0.55, 'rgba(255,150,70,0.04)');
    wash.addColorStop(1, 'rgba(70,40,110,0.07)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, view.w, view.h);
    const glow = ctx.createRadialGradient(view.w * 0.16, view.h * 0.1, 40, view.w * 0.16, view.h * 0.1, view.w * 0.55);
    glow.addColorStop(0, 'rgba(255,190,110,0.10)');
    glow.addColorStop(1, 'rgba(255,190,110,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, view.w, view.h);
  }

  return { draw, view };
}
