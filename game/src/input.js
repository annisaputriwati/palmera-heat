// Keyboard and mouse state for the game loop: held keys by code, one-shot actions the loop
// consumes once, and the mouse position in canvas pixels with its buttons. Nothing here knows
// what the keys mean; main.js reads the state each step and decides.

export const ACTION_PAUSE = 1;
export const ACTION_CONFIRM = 2;

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyF', 'KeyM', 'KeyP', 'KeyT',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight',
  'Escape', 'Enter',
]);

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  const mouse = { x: 0, y: 0, down: false, clicked: false };

  window.addEventListener('keydown', (event) => {
    if (GAME_KEYS.has(event.code)) event.preventDefault();
    if (!event.repeat) {
      if (event.code === 'Escape' || event.code === 'KeyP') actions |= ACTION_PAUSE;
      if (event.code === 'Enter' || event.code === 'Space') actions |= ACTION_CONFIRM;
    }
    held.add(event.code);
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
  });

  function trackMouse(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    mouse.y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  }
  canvas.addEventListener('mousemove', trackMouse);
  canvas.addEventListener('mousedown', (event) => {
    trackMouse(event);
    if (event.button === 0) {
      mouse.down = true;
      mouse.clicked = true;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    mouse,
    /** True while the key with this code is held. */
    down(code) {
      return held.has(code);
    },
    /** Movement axes from the keys: x in -1..1 (A/D, arrows), y in -1..1 (W/S, arrows). */
    moveAxis() {
      const x = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
      const y = (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0) - (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0);
      return { x, y };
    },
    /** One-shot actions pressed since the last call; reading them clears them. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Whether the mouse was clicked since the last step; reading clears it. */
    takeClick() {
      const was = mouse.clicked;
      mouse.clicked = false;
      return was;
    },
  };
}
