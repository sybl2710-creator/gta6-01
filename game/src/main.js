// Velvet Tide's boot: one seeded world, one fixed-step simulation, one render pass per frame.
// Input is read every frame, the simulation advances in 1/60 s steps, and the DOM HUD is only
// touched when a value changes. The page's screens are start, play, pause, mission complete and
// the busted/wasted end card; ?shot=start|play|end stages a deterministic frame instead.
import { CAR, MISSIONS, STEP } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import { ACTION_INTERACT, ACTION_JUMP, ACTION_MUTE, ACTION_PAUSE, ACTION_RELOAD, createInput } from './input.js';
import { buildWorld } from './world.js';
import { createRenderScene, drawMinimap, streetName } from './render.js';
import { createSim, loadSave, saveState } from './sim.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const $ = (id) => document.getElementById(id);
const ui = {
  hud: $('hud'), health: $('health-fill'), cash: $('cash'), stars: $('stars'),
  clock: $('clock'), objTag: $('obj-tag'), objText: $('obj-text'), ammo: $('ammo'),
  weapon: $('weapon'), speed: $('speed'), map: $('minimap'), street: $('map-street'),
  hint: $('hint'), toast: $('toast'), crosshair: $('crosshair'), mute: $('mute-badge'),
  start: $('start'), pause: $('pause'), end: $('end'), endTitle: $('end-title'),
  endText: $('end-text'), endKicker: $('end-kicker'), mission: $('mission-complete'),
  mcName: $('mc-name'), mcPay: $('mc-payout'), play: $('play-btn'), cont: $('continue-btn'),
  resume: $('resume-btn'), quit: $('quit-btn'), restart: $('restart-btn'),
  endQuit: $('end-quit-btn'), mcContinue: $('mc-continue'), missionList: $('mission-list'),
  saveNote: $('save-note'),
};

const random = createRandom(seed);
const world = buildWorld(random);
const audio = createAudio();
const renderer = createRenderScene(canvas, world.city);
const sky = world.createSky(renderer.scene);
renderer.setSky(sky);
const sim = createSim({ city: world.city, random, audio, hooks: renderer.hooks });
if (shot) sim.applySave(null); else sim.applySave(loadSave());
const minimap = ui.map.getContext('2d');
const starEls = Array.from(ui.stars.children);

let screen = 'title';
let paused = false;
let accumulator = 0;
let last = performance.now();
let toastShown = '';

function announce(text) {
  status.textContent = text;
}

function setScreen(next) {
  screen = next;
  ui.start.classList.toggle('hidden', next !== 'title');
  ui.pause.classList.toggle('hidden', next !== 'pause');
  ui.end.classList.toggle('hidden', next !== 'end');
  ui.mission.classList.toggle('hidden', next !== 'mission');
  ui.hud.classList.toggle('dim', next === 'title');
  ui.crosshair.classList.toggle('hidden', next !== 'play');
}

function renderMissions() {
  ui.missionList.replaceChildren();
  const completed = sim.state.completed;
  MISSIONS.forEach((mission, index) => {
    const button = document.createElement('button');
    button.className = 'mission';
    const unlocked = index === 0 || completed[index - 1];
    button.disabled = !unlocked;
    const no = document.createElement('span');
    no.className = 'no';
    no.textContent = String(index + 1);
    const body = document.createElement('span');
    const title = document.createElement('b');
    title.textContent = mission.name;
    const blurb = document.createElement('small');
    blurb.textContent = unlocked ? mission.blurb : 'Finish the job before this one.';
    body.append(title, blurb);
    const pay = document.createElement('span');
    pay.className = completed[index] ? 'done' : 'pay';
    pay.textContent = completed[index] ? '✓ done' : `$${mission.pay}`;
    button.append(no, body, pay);
    button.addEventListener('click', () => beginMission(index));
    ui.missionList.append(button);
  });
}

function refreshTitle() {
  const save = loadSave();
  const hasSave = !!save && (save.cash > 0 || (save.completed || []).some(Boolean));
  ui.cont.classList.toggle('hidden', !hasSave);
  ui.saveNote.textContent = hasSave
    ? `Saved: $${save.cash} · ${(save.completed || []).filter(Boolean).length} of ${MISSIONS.length} jobs done.`
    : 'Click a job to start it, or Play for free roam.';
  renderMissions();
}

function beginMission(index) {
  audio.resume();
  sim.startMission(index);
  setScreen('play');
  paused = false;
  accumulator = 0;
  renderer.resize();
  input.requestLock();
  announce(`Job started: ${MISSIONS[index].name}.`);
}

function beginFreeRoam(restore) {
  audio.resume();
  sim.startFreeRoam(restore);
  setScreen('play');
  paused = false;
  accumulator = 0;
  renderer.resize();
  input.requestLock();
  announce('Free roam. Find a car and press E.');
}

function endCard(kind) {
  ui.end.classList.remove('hidden');
  ui.endKicker.textContent = kind === 'busted' ? 'Costa Aurelia Police Department' : 'Costa Aurelia General Hospital';
  ui.endTitle.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
  ui.endTitle.className = kind === 'busted' ? 'busted' : 'wasted';
  ui.endText.textContent = kind === 'busted'
    ? 'They caught up with you. The city always does.'
    : 'The sun set on you. Somebody will miss the money.';
}

function updateHud() {
  const state = sim.state;
  const p = state.player;
  ui.health.style.width = `${Math.round((p.health / 100) * 100)}%`;
  ui.cash.textContent = `$${state.cash}`;
  for (let i = 0; i < starEls.length; i += 1) {
    starEls[i].className = i < state.wanted ? 'on' : '';
    if (i < state.wanted && state.wanted > 0 && state.time - state.lastCrime > 20) starEls[i].classList.add('cool');
  }
  ui.clock.textContent = sim.clockText(state.clock);
  ui.objTag.textContent = state.mission.active ? 'Job for Marisol' : state.mission.tag;
  ui.objText.textContent = state.mission.text || 'Explore Costa Aurelia';
  ui.weapon.textContent = p.car ? 'Driving' : p.hasGun ? 'Pistol' : 'Unarmed';
  ui.ammo.innerHTML = p.hasGun ? `${p.mag}<small> / ${p.reserve}</small>` : '—';
  if (p.car) {
    ui.speed.classList.remove('hidden');
    ui.speed.innerHTML = `${Math.round(Math.abs(p.car.speed) * 2.237)}<small> mph</small>`;
  } else ui.speed.classList.add('hidden');
  ui.crosshair.classList.toggle('armed', p.hasGun && !p.car);
  ui.mute.textContent = audio.muted ? 'MUTED' : '';
  const target = state.mission.target;
  if (target) {
    const d = Math.round(Math.hypot(target.x - p.x, target.z - p.z));
    ui.hint.classList.remove('hidden');
    ui.hint.textContent = `${d} m to the marker`;
  } else ui.hint.classList.add('hidden');
  if (state.toast !== toastShown) {
    toastShown = state.toast;
    ui.toast.textContent = state.toast;
    ui.toast.classList.toggle('show', state.toastTime > 0);
  } else ui.toast.classList.toggle('show', state.toastTime > 0);
  ui.street.textContent = streetName(world.city, p.x, p.z).toUpperCase();
  drawMinimap(minimap, state, world.city);
}

function readInput(actions, look, fire) {
  const forward = input.axis('KeyS', 'KeyW') || input.axis('ArrowDown', 'ArrowUp');
  return {
    lookX: look.x, lookY: look.y,
    forward,
    strafe: input.axis('KeyA', 'KeyD') || input.axis('ArrowLeft', 'ArrowRight'),
    fwd: forward,
    steer: input.axis('KeyA', 'KeyD') || input.axis('ArrowLeft', 'ArrowRight'),
    sprint: input.held('ShiftLeft') || input.held('ShiftRight'),
    jump: !!(actions & ACTION_JUMP),
    handbrake: input.held('Space'),
    interact: !!(actions & ACTION_INTERACT),
    reload: !!(actions & ACTION_RELOAD),
    fire,
  };
}

function resume() {
  paused = false;
  setScreen('play');
  input.requestLock();
  accumulator = 0;
  announce('Playing.');
}

function finishFrame() {
  const state = sim.state;
  if (state.missionDone && screen === 'play') {
    ui.mcName.textContent = state.missionDone.name;
    ui.mcPay.textContent = `+$${state.missionDone.pay}`;
    setScreen('mission');
    input.releaseLock();
  }
  if (state.dead && screen === 'play') {
    endCard(state.dead);
    setScreen('end');
    input.releaseLock();
  }
  updateHud();
}

function handleActions(actions) {
  if (actions & ACTION_MUTE) {
    audio.toggleMute();
    announce(audio.muted ? 'Muted.' : 'Sound on.');
  }
  if (actions & ACTION_PAUSE) {
    if (screen === 'play' && !paused) {
      paused = true;
      setScreen('pause');
      input.releaseLock();
      announce('Paused.');
    } else if (screen === 'pause') resume();
  }
}

function tick(now) {
  const dt = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  const actions = input.takeActions();
  const look = input.takeLook();
  const fire = input.takeFire();
  handleActions(actions);
  if (screen === 'play' && !paused) {
    accumulator += dt;
    const inputState = readInput(actions, look, fire);
    let steps = 0;
    while (accumulator >= STEP && steps < 8) {
      sim.step(STEP, inputState);
      accumulator -= STEP;
      steps += 1;
    }
  } else {
    accumulator = 0;
  }
  const p = sim.state.player;
  const speed = p.car ? Math.abs(p.car.speed) : 0;
  audio.engine(speed, CAR.maxSpeed, !!p.car);
  let near = false;
  for (const cop of sim.state.cops) if (Math.hypot(cop.x - p.x, cop.z - p.z) < 90) near = true;
  for (const car of sim.state.cars) if (car.kind === 'police' && !car.wrecked && Math.hypot(car.x - p.x, car.z - p.z) < 90) near = true;
  audio.siren(sim.state.wanted, near);
  renderer.update(sim.state, dt);
  renderer.render();
  finishFrame();
  requestAnimationFrame(tick);
}

let input = null;

function wireUi() {
  ui.play.addEventListener('click', () => beginFreeRoam(null));
  ui.cont.addEventListener('click', () => beginFreeRoam(loadSave()));
  ui.resume.addEventListener('click', resume);
  ui.quit.addEventListener('click', () => {
    setScreen('title');
    paused = false;
    refreshTitle();
  });
  ui.restart.addEventListener('click', () => {
    if (sim.state.mission.active) beginMission(sim.state.mission.index);
    else beginFreeRoam(null);
  });
  ui.endQuit.addEventListener('click', () => {
    sim.reset();
    setScreen('title');
    refreshTitle();
  });
  ui.mcContinue.addEventListener('click', () => {
    sim.ackMissionDone();
    setScreen('play');
    refreshTitle();
    input.requestLock();
    announce('Job complete. Back to the coast.');
  });
  canvas.addEventListener('mousedown', () => audio.resume());
}

function start() {
  input = createInput(canvas);
  input.onLockChange(() => {
    // Pointer lock may be unavailable (headless or refused): keyboard play continues regardless.
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play' && !paused) {
      paused = true;
      setScreen('pause');
      announce('Paused.');
    }
  });
  window.addEventListener('beforeunload', () => saveState(sim.state));
  wireUi();
  refreshTitle();
  setScreen('title');
  renderer.resize();
  renderer.update(sim.state, 0);
  renderer.render();
  requestAnimationFrame(tick);
  announce('Velvet Tide. Press Play, or pick a job for Marisol.');
}

function runShot(name) {
  refreshTitle();
  const scene = stageShot(name, sim, renderer);
  if (scene === 'mission' && sim.state.missionDone) {
    ui.mcName.textContent = sim.state.missionDone.name;
    ui.mcPay.textContent = `+$${sim.state.missionDone.pay}`;
  }
  setScreen(scene);
  for (let i = 0; i < 16; i += 1) renderer.update(sim.state, 0.2);
  let painted = 0;
  function paint() {
    renderer.update(sim.state, 1 / 60);
    renderer.render();
    updateHud();
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

if (shot) runShot(shot);
else start();
