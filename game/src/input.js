// Keyboard, mouse and pointer lock. Held keys are booleans; one-shot presses (interact, reload,
// mute, pause) are queued as bits and taken once per frame so a press between frames is never
// lost. Mouse movement accumulates into a delta the camera drains each frame.
export const ACTION_INTERACT = 1;
export const ACTION_RELOAD = 2;
export const ACTION_MUTE = 4;
export const ACTION_PAUSE = 8;
export const ACTION_START = 16;
export const ACTION_JUMP = 32;

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let mouseDX = 0;
  let mouseDY = 0;
  let firePressed = false;
  let fireHeld = false;
  let locked = false;
  const lockListeners = [];

  const oneShot = {
    KeyE: ACTION_INTERACT, KeyR: ACTION_RELOAD, KeyM: ACTION_MUTE,
    Escape: ACTION_PAUSE, Enter: ACTION_START, KeyP: ACTION_PAUSE,
  };

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space') {
      if (!event.repeat) actions |= ACTION_JUMP;
      held.add('Space');
      event.preventDefault();
      return;
    }
    if (oneShot[event.code] && !event.repeat) actions |= oneShot[event.code];
    held.add(event.code);
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
    fireHeld = false;
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      firePressed = true;
      fireHeld = true;
    }
    if (!locked) requestLock();
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) fireHeld = false;
  });
  window.addEventListener('mousemove', (event) => {
    if (!locked) return;
    mouseDX += event.movementX;
    mouseDY += event.movementY;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    for (const fn of lockListeners) fn(locked);
  });

  function requestLock() {
    if (document.pointerLockElement === canvas || !canvas.requestPointerLock) return;
    try {
      const result = canvas.requestPointerLock();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
      // Headless or a refused request: keyboard play still works without mouse look.
    }
  }

  return {
    held(code) { return held.has(code); },
    axis(neg, pos) { return (held.has(pos) ? 1 : 0) - (held.has(neg) ? 1 : 0); },
    get locked() { return locked; },
    requestLock,
    onLockChange(fn) { lockListeners.push(fn); },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    takeFire() {
      const pressed = firePressed;
      firePressed = false;
      return pressed;
    },
    get firing() { return fireHeld; },
    takeLook() {
      const out = { x: mouseDX, y: mouseDY };
      mouseDX = 0;
      mouseDY = 0;
      return out;
    },
    releaseLock() {
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    },
  };
}
