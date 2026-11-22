// The HUD: DOM panels over the canvas (cash, health, stars, weapon, objective, the phone
// that briefings arrive on, toasts and the contextual prompt) plus the minimap, a small
// canvas whose static base — sea, districts, road grid — is painted once to an offscreen
// canvas and then blitted each frame under the moving blips. Text fields are only written
// when their value changes, so a frame allocates nothing.

import { H_ROADS, SEA_W, V_ROADS, WORLD_H, WORLD_W } from './config.js';
import { dist } from './random.js';

const MAP_W = 216;
const MAP_H = 156;
const MAP_S = Math.min(MAP_W / WORLD_W, MAP_H / WORLD_H);
const MAP_OX = (MAP_W - WORLD_W * MAP_S) / 2;
const MAP_OY = (MAP_H - WORLD_H * MAP_S) / 2;

export function createHud(state) {
  const el = (id) => document.getElementById(id);
  const nodes = {
    cash: el('cash'),
    healthfill: el('healthfill'),
    stars: el('stars'),
    weapon: el('weapon'),
    district: el('district'),
    objective: el('objective'),
    prompt: el('prompt'),
    bustwrap: el('bustwrap'),
    bustfill: el('bustfill'),
    phone: el('phone'),
    phoneFrom: el('phone-from'),
    phoneText: el('phone-text'),
    toast: el('toast'),
  };
  const mapCanvas = el('minimap');
  const mapCtx = mapCanvas.getContext('2d');

  // --- the static minimap base ---
  const base = document.createElement('canvas');
  base.width = MAP_W;
  base.height = MAP_H;
  {
    const b = base.getContext('2d');
    const X = (x) => MAP_OX + x * MAP_S;
    const Y = (y) => MAP_OY + y * MAP_S;
    b.fillStyle = '#1d7a8c';
    b.fillRect(0, 0, MAP_W, MAP_H);
    b.fillStyle = '#e3d3ac';
    b.fillRect(X(SEA_W), 0, MAP_W - X(SEA_W), MAP_H);
    b.fillStyle = '#f2ddae';
    b.fillRect(X(SEA_W), 0, X(500) - X(SEA_W), MAP_H);
    const tints = [
      ['rgba(63,157,184,0.20)', 0, 2280, 1760, WORLD_H], // Marina
      ['rgba(245,185,33,0.13)', 0, 0, 1760, 2280], // Palm Beach
      ['rgba(90,120,160,0.20)', 1760, 0, 2960, 2280], // Downtown
      ['rgba(224,140,70,0.18)', 2960, 0, WORLD_W, 2280], // Old Town
      ['rgba(90,90,90,0.20)', 2960, 2280, WORLD_W, WORLD_H], // Industrial
    ];
    for (const [color, x0, y0, x1, y1] of tints) {
      b.fillStyle = color;
      b.fillRect(X(x0), Y(y0), X(x1) - X(x0), Y(y1) - Y(y0));
    }
    b.strokeStyle = 'rgba(40,36,44,0.85)';
    b.lineWidth = 1.6;
    b.beginPath();
    for (const cx of V_ROADS) { b.moveTo(X(cx), 0); b.lineTo(X(cx), MAP_H); }
    for (const cy of H_ROADS) { b.moveTo(X(SEA_W), Y(cy)); b.lineTo(MAP_W, Y(cy)); }
    b.stroke();
  }

  const last = { cash: null, health: -1, stars: -1, weapon: '', district: '', objective: '', prompt: null, bust: -1 };
  const phoneQueue = [];
  let phoneCurrent = null;
  let phoneUntil = 0;
  let toastUntil = 0;

  /** Queue a phone message; it shows for `dur` seconds once it reaches the front. */
  function showPhone(from, text, dur = 6.5) {
    phoneQueue.push({ from, text, dur });
  }

  /** A line of centre-screen text that fades on its own. */
  function toast(text) {
    nodes.toast.textContent = text;
    nodes.toast.style.opacity = '1';
    toastUntil = state.time + 2.8;
  }

  function drawMinimap() {
    const c = mapCtx;
    c.drawImage(base, 0, 0);
    const X = (x) => MAP_OX + x * MAP_S;
    const Y = (y) => MAP_OY + y * MAP_S;
    const p = state.player;
    // Mission / fare marker.
    const obj = state.objective;
    if (obj && typeof obj.x === 'number') {
      const pulse = 3.6 + Math.sin(state.time * 5) * 1.1;
      c.fillStyle = '#f5b921';
      c.beginPath(); c.arc(X(obj.x), Y(obj.y), pulse, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#fff3c4';
      c.lineWidth = 1.2;
      c.beginPath(); c.arc(X(obj.x), Y(obj.y), pulse + 2.2, 0, Math.PI * 2); c.stroke();
    }
    // A hailing fare.
    for (const ped of state.peds) {
      if (!ped.fare) continue;
      c.fillStyle = '#7dff8a';
      c.beginPath(); c.arc(X(ped.x), Y(ped.y), 3, 0, Math.PI * 2); c.fill();
    }
    // Police blips, flashing the way their light bars do.
    for (const car of state.cars) {
      if (car.driver !== 'police') continue;
      c.fillStyle = car.vega ? '#ff5040' : (Math.floor(state.time * 2.4) % 2 === 0 ? '#3b82ff' : '#ff3b30');
      c.beginPath(); c.arc(X(car.x), Y(car.y), car.vega ? 3.6 : 2.8, 0, Math.PI * 2); c.fill();
    }
    // The player arrow.
    const angle = p.car ? p.car.angle : p.angle;
    c.save();
    c.translate(X(p.x), Y(p.y));
    c.rotate(angle);
    c.fillStyle = '#ffffff';
    c.strokeStyle = '#20303a';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(6.4, 0);
    c.lineTo(-4.4, -4);
    c.lineTo(-4.4, 4);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.font = '800 9px "Segoe UI", system-ui, sans-serif';
    c.textAlign = 'left';
    c.fillText('N', 5, 11);
  }

  function update() {
    const p = state.player;
    if (last.cash !== p.cash) {
      last.cash = p.cash;
      nodes.cash.textContent = `$${p.cash}`;
    }
    const health = Math.max(0, Math.round(p.health));
    if (last.health !== health) {
      last.health = health;
      nodes.healthfill.style.width = `${health}%`;
    }
    const stars = state.wanted.stars;
    if (last.stars !== stars) {
      last.stars = stars;
      let html = '';
      for (let i = 0; i < 5; i += 1) html += i < stars ? '★' : '<span class="off">★</span>';
      nodes.stars.innerHTML = html;
    }
    const weapon = p.weapon === 'pistol' ? `PISTOL <span class="ammo">${p.ammo}</span>` : 'FISTS';
    if (last.weapon !== weapon) {
      last.weapon = weapon;
      nodes.weapon.innerHTML = weapon;
    }
    const district = state.city.districtAt(p.x, p.y);
    if (last.district !== district) {
      last.district = district;
      nodes.district.textContent = district;
    }
    const obj = state.objective;
    let objText = obj ? obj.text : '';
    if (obj && typeof obj.x === 'number') {
      objText += `<span class="dist">${Math.round(dist(p.x, p.y, obj.x, obj.y))}m</span>`;
    }
    if (last.objective !== objText) {
      last.objective = objText;
      nodes.objective.innerHTML = objText;
      nodes.objective.style.display = objText ? '' : 'none';
    }
    if (last.prompt !== state.prompt) {
      last.prompt = state.prompt;
      if (state.prompt) {
        nodes.prompt.innerHTML = state.prompt;
        nodes.prompt.classList.remove('hidden');
      } else {
        nodes.prompt.classList.add('hidden');
      }
    }
    const bust = Math.round(state.bust * 100);
    if (last.bust !== bust) {
      last.bust = bust;
      nodes.bustwrap.classList.toggle('hidden', bust <= 0);
      nodes.bustfill.style.width = `${bust}%`;
    }
    // Phone queue.
    if (phoneCurrent && state.time > phoneUntil) {
      phoneCurrent = null;
      nodes.phone.classList.add('hidden');
    }
    if (!phoneCurrent && phoneQueue.length) {
      phoneCurrent = phoneQueue.shift();
      nodes.phoneFrom.textContent = phoneCurrent.from;
      nodes.phoneText.textContent = phoneCurrent.text;
      nodes.phone.classList.remove('hidden');
      phoneUntil = state.time + phoneCurrent.dur;
    }
    if (toastUntil && state.time > toastUntil) {
      nodes.toast.style.opacity = '0';
      toastUntil = 0;
    }
    drawMinimap();
  }

  return { update, showPhone, toast };
}
