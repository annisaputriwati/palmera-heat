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

    // Parks and parking lots sit on the block ground.
    for (const park of city.parks) {
      ctx.fillStyle = COLORS.grass;
      ctx.fillRect(park.x, park.y, park.w, park.h);
      if (park.plaza) {
        // Old Town Square: a stone plaza, a fountain, and the empty bell post.
        ctx.fillStyle = '#d9c49a';
        ctx.fillRect(park.x + 6, park.y + 6, park.w - 12, park.h - 12);
        const cx = park.x + park.w / 2;
        const cy = park.y + park.h / 2;
        ctx.fillStyle = '#b8a888';
        ctx.beginPath(); ctx.arc(cx, cy, 44, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3f9db8';
        ctx.beginPath(); ctx.arc(cx, cy, 34, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath(); ctx.arc(cx, cy, 12 + Math.sin(state.time * 2.2) * 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#6b543a';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(cx - 26, cy - 74); ctx.lineTo(cx - 26, cy - 34);
        ctx.moveTo(cx + 26, cy - 74); ctx.lineTo(cx + 26, cy - 34);
        ctx.moveTo(cx - 30, cy - 74); ctx.lineTo(cx + 30, cy - 74);
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
    }

    // Sidewalk bands first (wider), then the asphalt on top of them.
    ctx.fillStyle = COLORS.sidewalk;
    for (const cx of V_ROADS) ctx.fillRect(cx - ROAD_W / 2 - SIDEWALK_W, 0, ROAD_W + SIDEWALK_W * 2, WORLD_H);
    for (const cy of H_ROADS) ctx.fillRect(BEACH_END - 40, cy - ROAD_W / 2 - SIDEWALK_W, WORLD_W - BEACH_END + 40, ROAD_W + SIDEWALK_W * 2);
    ctx.fillStyle = COLORS.asphalt;
    for (const cx of V_ROADS) ctx.fillRect(cx - ROAD_W / 2, 0, ROAD_W, WORLD_H);
    for (const cy of H_ROADS) ctx.fillRect(BEACH_END - 40, cy - ROAD_W / 2, WORLD_W - BEACH_END + 40, ROAD_W);

    // Lane paint: edge lines and a dashed centre line, dashed through intersections too —
    // Palmera's road crews are not perfectionists.
    ctx.strokeStyle = 'rgba(233,228,216,0.55)';
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
    ctx.fillStyle = 'rgba(233,228,216,0.5)';
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
      // Long late shadow, then the south and east faces, then the roof.
      ctx.fillStyle = 'rgba(74,40,8,0.28)';
      ctx.fillRect(b.x + 14, b.y + 18, b.w, b.h);
      ctx.fillStyle = shade(b.color, 0.78);
      ctx.beginPath();
      ctx.moveTo(b.x, b.y + b.h);
      ctx.lineTo(b.x + b.w, b.y + b.h);
      ctx.lineTo(b.x + b.w + ox, b.y + b.h + oy);
      ctx.lineTo(b.x + ox, b.y + b.h + oy);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(b.color, 0.62);
      ctx.beginPath();
      ctx.moveTo(b.x + b.w, b.y);
      ctx.lineTo(b.x + b.w, b.y + b.h);
      ctx.lineTo(b.x + b.w + ox, b.y + b.h + oy);
      ctx.lineTo(b.x + b.w + ox, b.y + oy);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(b.color, 1.14);
      ctx.fillRect(b.x + ox, b.y + oy, b.w, b.h);
      ctx.strokeStyle = 'rgba(60,40,20,0.35)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(b.x + ox + 5, b.y + oy + 5, b.w - 10, b.h - 10);
      // Windows on the south face for the taller blocks: a few lit, most dark.
      if (b.floors >= 4 && b.w > 90) {
        const rowsN = Math.min(6, b.floors - 1);
        for (let r = 0; r < rowsN; r += 1) {
          for (let c = 0; c < Math.floor(b.w / 26); c += 1) {
            const lit = hash2(b.x + c * 31, b.y + r * 57) > 0.62;
            ctx.fillStyle = lit ? 'rgba(255,205,110,0.85)' : 'rgba(30,40,55,0.5)';
            const wx = b.x + 10 + c * 26 + ox * (r / rowsN);
            const wy = b.y + b.h - 8 - r * ((b.h * 0.6) / rowsN) + oy * (r / rowsN);
            ctx.fillRect(wx, wy, 9, 6);
          }
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

  function drawBillboards(state) {
    for (const b of state.city.billboards) {
      ctx.fillStyle = 'rgba(74,40,8,0.3)';
      ctx.fillRect(b.x - 72 + 8, b.y - 20 + 10, 144, 42);
      ctx.fillStyle = '#5a4632';
      ctx.fillRect(b.x - 62, b.y + 12, 6, 16);
      ctx.fillRect(b.x + 56, b.y + 12, 6, 16);
      ctx.fillStyle = '#123a4d';
      ctx.fillRect(b.x - 76, b.y - 24, 152, 46);
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
      ctx.strokeStyle = '#8a6844';
      ctx.lineWidth = 3.4 * s;
      ctx.beginPath();
      ctx.moveTo(palm.x, palm.y);
      ctx.quadraticCurveTo(palm.x + 3 * s, palm.y - 10 * s, palm.x + 6 * s, palm.y - 17 * s);
      ctx.stroke();
      const tx = palm.x + 6 * s;
      const ty = palm.y - 17 * s;
      ctx.strokeStyle = '#4e8f3e';
      ctx.lineWidth = 2.6 * s;
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2 + 0.5;
        ctx.moveTo(tx, ty);
        ctx.quadraticCurveTo(tx + Math.cos(a) * 9 * s, ty + Math.sin(a) * 5 * s - 2, tx + Math.cos(a) * 15 * s, ty + Math.sin(a) * 9 * s + 4 * s);
      }
      ctx.stroke();
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
      ctx.font = '800 8.5px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('AZURE', -L * 0.33, -1);
      ctx.fillText('CROWN', -L * 0.33, 10);
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
    ctx.fillRect(-L * 0.2, -W / 2 + 7, 5, W - 14);
    // Lights.
    ctx.fillStyle = '#fff3c4';
    ctx.fillRect(L / 2 - 3, -W / 2 + 4, 3.4, 6);
    ctx.fillRect(L / 2 - 3, W / 2 - 10, 3.4, 6);
    ctx.fillStyle = car.braking ? '#ff5040' : '#a02820';
    ctx.fillRect(-L / 2 - 0.5, -W / 2 + 4, 3.4, 6);
    ctx.fillRect(-L / 2 - 0.5, W / 2 - 10, 3.4, 6);
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
  }

  return { draw, view };
}
