// Velvet Tide's rules and state, browser-free: one fixed 60 Hz step advances the player on foot
// or behind the wheel, traffic, pedestrians, the police response, gunplay and Marisol's jobs.
// The renderer only reads what is here; meshes are attached through `hooks` when an actor spawns.
import { CAR, MISSIONS, MISSION_POS, PALETTE, PLAYER, SAVE_KEY, TRAFFIC, WANTED, WEAPON } from './config.js';
import { clamp, dist2, pushOut, rayCylinder, turnToward } from './util.js';

const START = { x: -168, z: 38.5, yaw: Math.PI / 2 };
const PED_DOWN_LIFE = 26;
const clockText = (minutes) => {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveState(state) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: state.cash, completed: state.completed, wanted: state.wanted, gun: state.player.hasGun,
    }));
  } catch {
    // Private windows have no storage: the save then lasts this visit only.
  }
}

export function createSim({ city, random, audio, hooks = {} }) {
  const state = {
    time: 0,
    clock: 16 * 60 + 20,
    cash: 0,
    wanted: 0,
    completed: [false, false, false],
    mode: 'title',
    dead: null,
    missionDone: null,
    player: {
      x: START.x, y: 0, z: START.z, vx: 0, vy: 0, vz: 0, yaw: START.yaw, pitch: 0,
      health: PLAYER.maxHealth, car: null, hasGun: false, mag: 0, reserve: 0, reload: 0,
      punchCd: 0, fireCd: 0, onGround: true, phase: 0, moving: false, lastHurt: -99,
    },
    cars: [],
    peds: [],
    cops: [],
    tracers: [],
    effects: [],
    mission: { active: false, index: -1, step: 0, target: null, name: '', text: '', tag: 'Free Roam' },
    lastCrime: -999,
    decayTimer: 0,
    copTimer: 0,
    footTimer: 0,
    bustTimer: 0,
    toast: '',
    toastTime: 0,
    shake: 0,
  };
  let rook = null;

  function say(text, seconds = 3) {
    state.toast = text;
    state.toastTime = seconds;
  }

  function crime(level) {
    if (level > state.wanted) state.wanted = Math.min(WANTED.max, level);
    state.lastCrime = state.time;
    state.decayTimer = 0;
  }

  // ---------------------------------------------------------------- actors

  function addCar(kind, x, z, yaw, colour, extra = {}) {
    const car = {
      kind, x, z, yaw, speed: 0,
      colour: colour || PALETTE.car[Math.floor(random() * PALETTE.car.length)],
      health: kind === 'police' ? 150 : 100,
      axis: 'x', dir: 1, roadPos: 0, lane: 0, spd: 0.8 + random() * 0.45,
      stolen: false, rook: false, wrecked: false, mesh: null, ...extra,
    };
    state.cars.push(car);
    hooks.addCar?.(car);
    return car;
  }

  function addPed(x, z, cop, extra = {}) {
    const ped = {
      x, z, yaw: random() * Math.PI * 2, speed: 1.05 + random() * 0.55, health: cop ? 70 : 60,
      cop, state: 'walk', flee: 0, phase: random() * 6, down: 0, mesh: null, walk: null,
      corner: 0, fireCd: 0.6 + random() * 0.7,
      skin: Math.floor(random() * 4), shirt: Math.floor(random() * 6), ...extra,
    };
    if (cop) state.cops.push(ped);
    else state.peds.push(ped);
    hooks.addPed?.(ped);
    return ped;
  }

  function roadPoint(minFrom, maxFrom, fromX, fromZ) {
    for (let tries = 0; tries < 30; tries += 1) {
      const axis = random() < 0.5 ? 'x' : 'z';
      const line = city.roads[Math.floor(random() * city.roads.length)];
      const t = (random() * 2 - 1) * (city.bounds.max - 14);
      const x = axis === 'x' ? t : line + (random() < 0.5 ? -3.6 : 3.6);
      const z = axis === 'x' ? line + (random() < 0.5 ? -3.6 : 3.6) : t;
      const d = Math.hypot(x - fromX, z - fromZ);
      if (d >= minFrom && d <= maxFrom) return { x, z };
    }
    return { x: 0, z: 0 };
  }

  function spawnTraffic() {
    const axis = random() < 0.5 ? 'x' : 'z';
    const roadPos = city.roads[Math.floor(random() * city.roads.length)];
    const lane = (random() < 0.5 ? -1 : 1) * TRAFFIC.lane;
    const dir = random() < 0.5 ? -1 : 1;
    const t = (random() * 2 - 1) * (city.bounds.max - 16);
    const x = axis === 'x' ? t : roadPos + lane;
    const z = axis === 'x' ? roadPos + lane : t;
    return addCar('traffic', x, z, axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI), 0, {
      axis, dir, roadPos, lane,
    });
  }

  function spawnParked() {
    const axis = random() < 0.5 ? 'x' : 'z';
    const roadPos = city.roads[Math.floor(random() * city.roads.length)];
    const lane = (random() < 0.5 ? -1 : 1) * (TRAFFIC.lane + 1.7);
    const t = (random() * 2 - 1) * (city.bounds.max - 18);
    const x = axis === 'x' ? t : roadPos + lane;
    const z = axis === 'x' ? roadPos + lane : t;
    return addCar('parked', x, z, axis === 'x' ? Math.PI / 2 : 0, 0);
  }

  function spawnPed() {
    const walk = city.walks[Math.floor(random() * city.walks.length)];
    const r = walk.r;
    const corners = [
      { x: walk.cx - r, z: walk.cz - r }, { x: walk.cx + r, z: walk.cz - r },
      { x: walk.cx + r, z: walk.cz + r }, { x: walk.cx - r, z: walk.cz + r },
    ];
    const start = Math.floor(random() * 4);
    const ped = addPed(corners[start].x, corners[start].z, false, { walk: corners, corner: (start + 1) % 4 });
    return ped;
  }

  function spawnCop() {
    const p = roadPoint(16, 34, state.player.x, state.player.z);
    return addPed(p.x, p.z, true);
  }

  function spawnPoliceCar() {
    const p = roadPoint(70, 120, state.player.x, state.player.z);
    const car = addCar('police', p.x, p.z, 0, 0x24354a);
    return car;
  }

  // ---------------------------------------------------------------- setup

  let marisol = null;
  function spawnMarisol() {
    marisol = addPed(MISSION_POS.marisol.x, MISSION_POS.marisol.z, false, {
      speed: 0, state: 'idle', marisol: true,
    });
    marisol.yaw = Math.PI;
    return marisol;
  }
  for (let i = 0; i < TRAFFIC.cars; i += 1) spawnTraffic();
  for (let i = 0; i < TRAFFIC.parked; i += 1) spawnParked();
  for (let i = 0; i < TRAFFIC.peds; i += 1) spawnPed();
  spawnMarisol();

  // ---------------------------------------------------------------- helpers

  function collide(actor, radius) {
    let hit = false;
    for (let i = 0; i < city.colliders.length; i += 1) {
      if (pushOut(actor, radius, city.colliders[i])) hit = true;
    }
    actor.x = clamp(actor.x, city.bounds.min + radius, city.bounds.max - radius);
    actor.z = clamp(actor.z, city.bounds.min + radius, city.bounds.max - radius);
    return hit;
  }

  const forwardX = (yaw) => Math.sin(yaw);
  const forwardZ = (yaw) => Math.cos(yaw);

  function nearestCar(range) {
    let best = null;
    let bestD = range * range;
    for (const car of state.cars) {
      if (car === state.player.car || car.wrecked || car.rook) continue;
      const d = dist2(state.player.x, state.player.z, car.x, car.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function enterCar(car) {
    if (!car) return;
    state.player.car = car;
    state.player.x = car.x;
    state.player.z = car.z;
    if (!car.stolen) {
      car.stolen = true;
      if (car.kind === 'police') car.playerOwned = true;
      if (car.kind !== 'police') crime(1);
      else crime(3);
      say(car.kind === 'police' ? 'You jacked a cruiser. Bold.' : 'Car stolen. Keep it clean.');
      audio?.click?.();
    }
  }

  function exitCar() {
    const car = state.player.car;
    if (!car) return;
    const side = { x: car.x + Math.cos(car.yaw) * 1.6, z: car.z - Math.sin(car.yaw) * 1.6 };
    state.player.x = side.x;
    state.player.z = side.z;
    state.player.car = null;
    state.player.y = 0;
    car.speed = 0;
    car.playerOwned = false;
    if (car.kind !== 'parked') car.kind = 'parked';
    collide(state.player, PLAYER.radius);
    say('On foot.');
  }

  // ---------------------------------------------------------------- missions

  function stepDef() {
    const mission = MISSIONS[state.mission.index];
    return mission ? mission.steps[state.mission.step] : null;
  }

  function applySet(step) {
    if (!step?.set) return;
    if (step.set.wanted) {
      state.wanted = Math.min(WANTED.max, Math.max(state.wanted, step.set.wanted));
      state.lastCrime = state.time;
      state.decayTimer = 0;
    }
    if (step.set.spawnRook && !rook) {
      const p = roadPoint(30, 60, state.player.x, state.player.z);
      rook = addCar('traffic', p.x, p.z, 0, 0x2d2f33, { rook: true, health: 160 });
      let best = Infinity;
      for (const line of city.roads) {
        const d = Math.abs(p.z - line) + Math.abs(p.x - line);
        if (d < best) {
          best = d;
          rook.axis = Math.abs(p.z - line) < Math.abs(p.x - line) ? 'x' : 'z';
          rook.roadPos = line;
        }
      }
      rook.lane = 0;
      rook.dir = 1;
      if (rook.axis === 'x') {
        rook.x = p.x;
        rook.z = rook.roadPos;
      } else {
        rook.x = rook.roadPos;
        rook.z = p.z;
      }
      say("Rook's coupe is on the coast road. Wreck it.");
    }
  }

  function updateObjective() {
    const step = stepDef();
    const target = state.mission.target;
    if (!step) {
      state.mission.target = null;
      return;
    }
    state.mission.text = step.text;
    let tx = null;
    let tz = 0;
    if (step.type === 'goto') {
      tx = step.x;
      tz = step.z;
    } else if (step.type === 'car') {
      let best = null;
      let bestD = 90 * 90;
      for (const car of state.cars) {
        if (car.wrecked) continue;
        const d = dist2(state.player.x, state.player.z, car.x, car.z);
        if (d < bestD) {
          bestD = d;
          best = car;
        }
      }
      if (best) {
        tx = best.x;
        tz = best.z;
      }
    } else if (step.type === 'chase' && rook) {
      tx = rook.x;
      tz = rook.z;
    }
    if (tx === null) state.mission.target = null;
    else if (target) {
      target.x = tx;
      target.z = tz;
    } else state.mission.target = { x: tx, z: tz };
  }

  function startMission(index) {
    reset();
    state.mode = 'play';
    state.mission.active = true;
    state.mission.index = index;
    state.mission.step = 0;
    state.mission.name = MISSIONS[index].name;
    state.mission.tag = 'Job for Marisol';
    state.player.x = START.x;
    state.player.z = START.z;
    state.player.yaw = START.yaw;
    applySet(stepDef());
    updateObjective();
    say(`${MISSIONS[index].name} — ${MISSIONS[index].blurb}`, 4);
    audio?.mission?.();
  }

  function finishMission() {
    const mission = MISSIONS[state.mission.index];
    state.completed[state.mission.index] = true;
    state.cash += mission.pay;
    state.mission.active = false;
    state.mission.target = null;
    state.missionDone = { name: mission.name, pay: mission.pay };
    state.player.hasGun = true;
    if (state.player.mag === 0) {
      state.player.mag = WEAPON.mag;
      state.player.reserve = WEAPON.reserve;
    }
    saveState(state);
    audio?.cash?.();
    audio?.mission?.();
  }

  function advanceMission() {
    const mission = MISSIONS[state.mission.index];
    state.mission.step += 1;
    if (state.mission.step >= mission.steps.length) {
      finishMission();
      return;
    }
    applySet(stepDef());
    updateObjective();
    say(`Next: ${stepDef().text}`, 3.5);
  }

  function missionCheck() {
    if (!state.mission.active) return;
    const step = stepDef();
    if (!step) return;
    const p = state.player;
    let done = false;
    if (step.type === 'car') done = !!p.car;
    else if (step.type === 'goto') done = dist2(p.x, p.z, step.x, step.z) < step.r * step.r && (!step.needCar || p.car);
    else if (step.type === 'evade') done = state.wanted === 0;
    else if (step.type === 'chase') done = !!rook && rook.health <= 0;
    if (done) advanceMission();
    else updateObjective();
  }

  // ---------------------------------------------------------------- player on foot

  function onFoot(dt, input) {
    const p = state.player;
    p.yaw -= input.lookX * 0.0026;
    p.pitch = clamp(p.pitch - input.lookY * 0.0022, -1.15, 1.05);
    if (p.yaw > Math.PI) p.yaw -= Math.PI * 2;
    if (p.yaw < -Math.PI) p.yaw += Math.PI * 2;

    const fx = forwardX(p.yaw);
    const fz = forwardZ(p.yaw);
    const rx = Math.cos(p.yaw);
    const rz = -Math.sin(p.yaw);
    let mx = input.forward * fx + input.strafe * rx;
    let mz = input.forward * fz + input.strafe * rz;
    const len = Math.hypot(mx, mz);
    if (len > 1e-4) {
      mx /= len;
      mz /= len;
    }
    const speed = input.sprint ? PLAYER.sprint : PLAYER.walk;
    p.moving = len > 1e-4;
    p.x += mx * speed * dt;
    p.z += mz * speed * dt;
    if (p.moving) p.phase += dt * (input.sprint ? 12 : 8);

    if (input.jump && p.onGround) {
      p.vy = PLAYER.jump;
      p.onGround = false;
    }
    p.vy -= PLAYER.gravity * dt;
    p.y += p.vy * dt;
    if (p.y <= 0) {
      p.y = 0;
      p.vy = 0;
      p.onGround = true;
    }
    collide(p, PLAYER.radius);
  }

  function punch() {
    const p = state.player;
    if (p.punchCd > 0) return;
    p.punchCd = WEAPON.punchDelay;
    audio?.punch?.();
    const fx = forwardX(p.yaw);
    const fz = forwardZ(p.yaw);
    let best = null;
    let bestD = WEAPON.punchRange * WEAPON.punchRange;
    for (const ped of state.peds.concat(state.cops)) {
      if (ped.state === 'down' || ped.marisol) continue;
      const dx = ped.x - p.x;
      const dz = ped.z - p.z;
      const d = dx * dx + dz * dz;
      if (d > bestD) continue;
      const dl = Math.sqrt(d) || 1;
      if ((dx / dl) * fx + (dz / dl) * fz < 0.35) continue;
      bestD = d;
      best = ped;
    }
    if (!best) return;
    best.health -= WEAPON.punchDamage;
    audio?.hit?.();
    if (best.cop) crime(3);
    else crime(1);
    if (best.health <= 0) knockDown(best);
  }

  function shoot() {
    const p = state.player;
    if (p.fireCd > 0 || p.reload > 0) return;
    if (p.mag <= 0) {
      audio?.click?.();
      p.fireCd = 0.3;
      return;
    }
    p.fireCd = WEAPON.fireDelay;
    p.mag -= 1;
    state.shake = Math.max(state.shake, 0.25);
    audio?.gunshot?.();
    const cp = Math.cos(p.pitch);
    const dx = forwardX(p.yaw) * cp;
    const dy = Math.sin(p.pitch);
    const dz = forwardZ(p.yaw) * cp;
    const ox = p.x;
    const oy = p.y + PLAYER.eye;
    const oz = p.z;
    let hitPed = null;
    let hitCar = null;
    let hitT = WEAPON.range;
    for (const ped of state.peds.concat(state.cops)) {
      if (ped.state === 'down' || ped.marisol) continue;
      const t = rayCylinder(ox, oy, oz, dx, dy, dz, ped.x, ped.z, 0.48, 1.85);
      if (t > 0 && t < hitT) {
        hitT = t;
        hitPed = ped;
      }
    }
    for (const car of state.cars) {
      if (car === p.car || car.wrecked) continue;
      const t = rayCylinder(ox, oy, oz, dx, dy, dz, car.x, car.z, 1.5, 1.6);
      if (t > 0 && t < hitT) {
        hitT = t;
        hitPed = null;
        hitCar = car;
      }
    }
    const bx = ox + dx * hitT;
    const by = oy + dy * hitT;
    const bz = oz + dz * hitT;
    state.tracers.push({ ax: ox, ay: oy - 0.12, az: oz, bx, by, bz, ttl: 0.07 });
    state.effects.push({ kind: 'muzzle', x: ox + dx * 0.6, y: oy - 0.1, z: oz + dz * 0.6, ttl: 0.07 });
    crime(2);
    if (hitPed) {
      hitPed.health -= WEAPON.damage;
      hitPed.flee = Math.max(hitPed.flee, 4);
      audio?.hit?.();
      if (hitPed.cop) crime(4);
      if (hitPed.health <= 0) knockDown(hitPed);
    }
    if (hitCar) {
      damageCar(hitCar, WEAPON.damage * 1.4);
      state.effects.push({ kind: 'spark', x: bx, y: by, z: bz, ttl: 0.18 });
    }
    for (const ped of state.peds) {
      if (ped.state !== 'down' && dist2(ped.x, ped.z, p.x, p.z) < 625) ped.flee = Math.max(ped.flee, 3.5);
    }
  }

  function knockDown(ped) {
    if (ped.state === 'down') return;
    ped.state = 'down';
    ped.down = 0;
    ped.health = 0;
    audio?.thud?.();
    if (ped.cop) crime(4);
    else if (!ped.marisol) crime(2);
  }

  function reload() {
    const p = state.player;
    if (!p.hasGun || p.reload > 0 || p.mag >= WEAPON.mag || p.reserve <= 0) return;
    p.reload = WEAPON.reload;
    audio?.click?.();
  }

  // ---------------------------------------------------------------- driving

  function drive(dt, input) {
    const p = state.player;
    const car = p.car;
    const throttle = input.fwd;
    if (throttle > 0) car.speed += CAR.accel * throttle * dt;
    else if (throttle < 0) car.speed += (car.speed > 0 ? -CAR.brake : -CAR.accel * 0.7) * dt;
    if (input.handbrake) car.speed *= Math.pow(CAR.handbrake, dt * 60);
    car.speed *= Math.pow(CAR.drag, dt);
    car.speed = clamp(car.speed, -CAR.reverse, CAR.maxSpeed);
    if (Math.abs(car.speed) < 0.05 && throttle === 0) car.speed = 0;
    const grip = clamp(Math.abs(car.speed) / 9, 0, 1);
    car.yaw += input.steer * CAR.steer * grip * dt * (car.speed >= 0 ? 1 : -1);
    car.x += forwardX(car.yaw) * car.speed * dt;
    car.z += forwardZ(car.yaw) * car.speed * dt;
    if (collide(car, CAR.radius)) {
      if (Math.abs(car.speed) > 7) audio?.thud?.();
      car.speed *= 0.35;
      state.shake = Math.max(state.shake, 0.15);
    }
    p.x = car.x;
    p.z = car.z;
    p.y = 0;
    p.phase += car.speed * dt * 0.7;
  }

  function hitPedsByCars(dt) {
    for (const car of state.cars) {
      if (Math.abs(car.speed) < 4) continue;
      for (const ped of state.peds.concat(state.cops)) {
        if (ped.state === 'down' || ped.marisol) continue;
        if (dist2(car.x, car.z, ped.x, ped.z) > 2.4) continue;
        knockDown(ped);
        if (car === state.player.car) {
          crime(ped.cop ? 4 : 3);
          state.shake = Math.max(state.shake, 0.4);
        }
        ped.flee = 0;
      }
    }
  }

  function carVsCar(dt) {
    const p = state.player.car;
    for (let i = 0; i < state.cars.length; i += 1) {
      const a = state.cars[i];
      if (a === p) continue;
      for (let j = i + 1; j < state.cars.length; j += 1) {
        const b = state.cars[j];
        if (b === p) continue;
        const moving = a === p || b === p || Math.abs(a.speed) > 4 || Math.abs(b.speed) > 4;
        if (!moving) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d > 2.7 || d < 1e-4) continue;
        const push = (2.7 - d) / d / 2;
        a.x -= dx * push;
        a.z -= dz * push;
        b.x += dx * push;
        b.z += dz * push;
        const impact = Math.max(Math.abs(a.speed), Math.abs(b.speed));
        if (impact > 8) {
          if (a === p || b === p) state.shake = Math.max(state.shake, 0.35);
          if (a === p) damageCar(b, impact * 3);
          if (b === p) damageCar(a, impact * 3);
          if (a.rook || b.rook) {
            const other = a.rook ? b : a;
            damageCar(a.rook ? a : b, Math.max(10, Math.abs(other.speed) * 4));
          }
          a.speed *= 0.4;
          b.speed *= 0.4;
        }
      }
    }
  }

  function damageCar(car, amount) {
    if (car.wrecked) return;
    car.health -= amount;
    if (car.health <= 0) wreck(car);
  }

  // ---------------------------------------------------------------- traffic and people

  function updateTraffic(dt) {
    for (const car of state.cars) {
      if (car === state.player.car || car.kind === 'police' || car.wrecked) continue;
      if (car.kind === 'parked') continue;
      let speed = TRAFFIC.speed * car.spd;
      if (car.rook) speed = 15;
      const p = state.player;
      if (car !== p.car && dist2(car.x, car.z, p.x, p.z) < 64 && p.car) speed *= 0.55;
      car.speed = speed;
      if (car.axis === 'x') car.x += car.dir * speed * dt;
      else car.z += car.dir * speed * dt;
      car.yaw = car.axis === 'x' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
      if (car.axis === 'x') car.z = car.roadPos + car.lane;
      else car.x = car.roadPos + car.lane;
      const progress = car.axis === 'x' ? car.x : car.z;
      if (progress > city.bounds.max - 10 || progress < city.bounds.min + 10) car.dir *= -1;
      if (car.rook) {
        if (car.health <= 0 && !car.wrecked) wreck(car);
        continue;
      }
      let cross = null;
      let bestD = 3;
      for (const line of city.roads) {
        const d = (line - progress) * car.dir;
        if (d > 0 && d < bestD) {
          bestD = d;
          cross = line;
        }
      }
      if (cross !== null && random() < 0.4) {
        car.axis = car.axis === 'x' ? 'z' : 'x';
        car.roadPos = cross;
        car.lane = (random() < 0.5 ? -1 : 1) * TRAFFIC.lane;
        car.dir = random() < 0.5 ? -1 : 1;
        if (car.axis === 'x') car.z = car.roadPos + car.lane;
        else car.x = car.roadPos + car.lane;
      }
      if (random() < dt * 0.15) car.spd = 0.7 + random() * 0.6;
    }
  }

  function wreck(car) {
    car.wrecked = true;
    car.health = 0;
    car.speed = 0;
    if (car === rook) {
      rook.health = 0;
      say("Rook's coupe is scrap.");
    }
    state.effects.push({ kind: 'boom', x: car.x, y: 0.8, z: car.z, ttl: 0.5 });
    audio?.thud?.();
  }

  function updatePeds(dt) {
    for (let i = state.peds.length - 1; i >= 0; i -= 1) {
      const ped = state.peds[i];
      if (ped.state === 'down') {
        ped.down += dt;
        if (ped.down > PED_DOWN_LIFE) {
          hooks.removePed?.(ped);
          state.peds.splice(i, 1);
        }
        continue;
      }
      if (ped.marisol) continue;
      let threatX = 0;
      let threatZ = 0;
      let threat = false;
      for (const car of state.cars) {
        if (car === state.player.car || car.kind === 'parked') continue;
        if (Math.abs(car.speed) < 3) continue;
        if (dist2(car.x, car.z, ped.x, ped.z) < 49) {
          threat = true;
          threatX = car.x;
          threatZ = car.z;
          break;
        }
      }
      if (threat) ped.flee = Math.max(ped.flee, 2.2);
      if (ped.flee > 0) {
        ped.flee -= dt;
        if (!threat) {
          threatX = state.player.x;
          threatZ = state.player.z;
        }
        const dx = ped.x - threatX;
        const dz = ped.z - threatZ;
        const l = Math.hypot(dx, dz) || 1;
        ped.yaw = Math.atan2(dx / l, dz / l);
        const run = 3.4;
        ped.x += (dx / l) * run * dt;
        ped.z += (dz / l) * run * dt;
        ped.phase += dt * 14;
        collide(ped, 0.4);
        continue;
      }
      if (ped.walk) {
        const target = ped.walk[ped.corner];
        const dx = target.x - ped.x;
        const dz = target.z - ped.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.6) {
          ped.corner = (ped.corner + 1) % 4;
        } else {
          ped.yaw = Math.atan2(dx, dz);
          ped.x += (dx / d) * ped.speed * dt;
          ped.z += (dz / d) * ped.speed * dt;
          ped.phase += dt * 7;
        }
      }
    }
  }

  function updateCops(dt) {
    const p = state.player;
    for (let i = state.cops.length - 1; i >= 0; i -= 1) {
      const cop = state.cops[i];
      if (cop.state === 'down') {
        cop.down += dt;
        if (cop.down > PED_DOWN_LIFE) {
          hooks.removePed?.(cop);
          state.cops.splice(i, 1);
        }
        continue;
      }
      const dx = p.x - cop.x;
      const dz = p.z - cop.z;
      const d = Math.hypot(dx, dz) || 1;
      cop.yaw = Math.atan2(dx / d, dz / d);
      if (d > 1.7) {
        cop.x += (dx / d) * 3.1 * dt;
        cop.z += (dz / d) * 3.1 * dt;
        cop.phase += dt * 11;
        collide(cop, 0.4);
      }
      cop.fireCd -= dt;
      if (d < WANTED.copShootRange && cop.fireCd <= 0 && p.health > 0) {
        cop.fireCd = WANTED.copFireDelay + random() * 0.5;
        audio?.gunshot?.();
        state.tracers.push({
          ax: cop.x, ay: 1.35, az: cop.z, bx: p.x + (random() - 0.5) * 0.7, by: 1.25, bz: p.z + (random() - 0.5) * 0.7, ttl: 0.06,
        });
        state.effects.push({ kind: 'muzzle', x: cop.x, y: 1.3, z: cop.z, ttl: 0.06 });
        damagePlayer(WANTED.copDamage * 0.55 * (0.6 + random() * 0.8), cop.x, cop.z);
      }
    }
  }

  function updatePoliceCars(dt) {
    const p = state.player;
    for (const car of state.cars) {
      if (car.kind !== 'police' || car.wrecked || car.playerOwned) continue;
      const dx = p.x - car.x;
      const dz = p.z - car.z;
      const d = Math.hypot(dx, dz) || 1;
      const want = Math.atan2(dx / d, dz / d);
      car.yaw = turnToward(car.yaw, want, 1.5 * dt);
      car.speed += 9 * dt;
      car.speed = Math.min(car.speed, d < 10 ? 9 : 24);
      car.x += forwardX(car.yaw) * car.speed * dt;
      car.z += forwardZ(car.yaw) * car.speed * dt;
      if (collide(car, CAR.radius)) car.speed *= 0.5;
      if (d < 2.6) car.speed *= 0.85;
    }
  }

  function damagePlayer(amount, fromX, fromZ) {
    const p = state.player;
    if (p.health <= 0) return;
    p.health = Math.max(0, p.health - amount);
    p.lastHurt = state.time;
    state.shake = Math.max(state.shake, 0.3);
    audio?.hit?.();
    if (fromX !== undefined) {
      const dx = p.x - fromX;
      const dz = p.z - fromZ;
      const l = Math.hypot(dx, dz) || 1;
      p.x += (dx / l) * 0.25;
      p.z += (dz / l) * 0.25;
    }
    if (p.health <= 0) {
      state.dead = 'wasted';
      state.mode = 'end';
      audio?.busted?.();
      saveState(state);
    }
  }

  function policeResponse(dt) {
    const p = state.player;
    state.copTimer -= dt;
    state.footTimer -= dt;
    const wantCars = Math.min(state.wanted, WANTED.maxCars);
    let policeCars = 0;
    for (const car of state.cars) if (car.kind === 'police' && !car.wrecked) policeCars += 1;
    if (state.wanted > 0 && policeCars < wantCars && state.copTimer <= 0) {
      state.copTimer = 4.5;
      spawnPoliceCar();
    }
    const wantFoot = state.wanted >= 2 ? Math.min(WANTED.maxFoot, state.wanted * 2) : 0;
    if (state.wanted > 0 && state.cops.length < wantFoot && state.footTimer <= 0) {
      state.footTimer = 3.2;
      spawnCop();
    }
    if (state.wanted === 0) {
      for (let i = state.cars.length - 1; i >= 0; i -= 1) {
        const car = state.cars[i];
        if (car.kind === 'police' && car !== p.car) {
          hooks.removeCar?.(car);
          state.cars.splice(i, 1);
        }
      }
      for (let i = state.cops.length - 1; i >= 0; i -= 1) {
        hooks.removePed?.(state.cops[i]);
        state.cops.splice(i, 1);
      }
    }
    if (state.wanted > 0) {
      let near = false;
      for (const cop of state.cops) if (dist2(cop.x, cop.z, p.x, p.z) < 900) near = true;
      if (near && !p.car) {
        let bust = false;
        for (const cop of state.cops) if (dist2(cop.x, cop.z, p.x, p.z) < WANTED.bustRange * WANTED.bustRange) bust = true;
        state.bustTimer = bust ? state.bustTimer + dt : 0;
        if (state.bustTimer > WANTED.bustTime) {
          state.dead = 'busted';
          state.mode = 'end';
          audio?.busted?.();
          saveState(state);
        }
      } else state.bustTimer = 0;
    } else state.bustTimer = 0;
  }

  function decay(dt) {
    if (state.wanted <= 0) return;
    if (state.time - state.lastCrime < WANTED.decayAfter) {
      state.decayTimer = 0;
      return;
    }
    let near = 0;
    for (const cop of state.cops) if (dist2(cop.x, cop.z, state.player.x, state.player.z) < 625) near += 1;
    for (const car of state.cars) if (car.kind === 'police' && !car.wrecked && dist2(car.x, car.z, state.player.x, state.player.z) < 1225) near += 1;
    state.decayTimer += near > 0 ? dt * 0.5 : dt;
    if (state.decayTimer > WANTED.decayStep) {
      state.decayTimer = 0;
      state.wanted = Math.max(0, state.wanted - 1);
      if (state.wanted === 0) say('Heat is off. For now.');
    }
  }

  // ---------------------------------------------------------------- the step

  function step(dt, input) {
    if (state.mode !== 'play') return;
    state.time += dt;
    state.clock = (state.clock + dt * 0.55) % 1440;
    state.toastTime = Math.max(0, state.toastTime - dt);
    state.shake = Math.max(0, state.shake - dt * 2.2);
    const p = state.player;
    p.punchCd = Math.max(0, p.punchCd - dt);
    p.fireCd = Math.max(0, p.fireCd - dt);
    if (p.reload > 0) {
      p.reload -= dt;
      if (p.reload <= 0) {
        const need = WEAPON.mag - p.mag;
        const take = Math.min(need, p.reserve);
        p.mag += take;
        p.reserve -= take;
        p.reload = 0;
      }
    }

    if (input.interact) {
      if (p.car) exitCar();
      else enterCar(nearestCar(CAR.enterRange));
    }
    if (input.reload) reload();
    if (input.jump && p.car && Math.abs(p.car.speed) > 1) p.car.speed *= 0.97;

    if (p.car) drive(dt, input);
    else onFoot(dt, input);

    if (input.fire) {
      if (p.hasGun && !p.car) shoot();
      else if (!p.hasGun && !p.car) punch();
    }

    updateTraffic(dt);
    carVsCar(dt);
    updatePeds(dt);
    updateCops(dt);
    updatePoliceCars(dt);
    hitPedsByCars(dt);
    policeResponse(dt);
    decay(dt);
    missionCheck();

    if (p.health < PLAYER.maxHealth && state.time - p.lastHurt > PLAYER.regenDelay) {
      p.health = Math.min(PLAYER.maxHealth, p.health + PLAYER.regenRate * dt);
    }
    for (let i = state.tracers.length - 1; i >= 0; i -= 1) {
      state.tracers[i].ttl -= dt;
      if (state.tracers[i].ttl <= 0) state.tracers.splice(i, 1);
    }
    for (let i = state.effects.length - 1; i >= 0; i -= 1) {
      state.effects[i].ttl -= dt;
      if (state.effects[i].ttl <= 0) state.effects.splice(i, 1);
    }
    if (state.mission.active) updateObjective();
  }

  function reset() {
    for (const car of state.cars) hooks.removeCar?.(car);
    for (const ped of state.peds) hooks.removePed?.(ped);
    for (const cop of state.cops) hooks.removePed?.(cop);
    state.cars.length = 0;
    state.peds.length = 0;
    state.cops.length = 0;
    state.tracers.length = 0;
    state.effects.length = 0;
    rook = null;
    state.time = 0;
    state.clock = 16 * 60 + 20;
    state.wanted = 0;
    state.lastCrime = -999;
    state.decayTimer = 0;
    state.copTimer = 0;
    state.footTimer = 0;
    state.bustTimer = 0;
    state.dead = null;
    state.missionDone = null;
    state.mission.active = false;
    state.mission.index = -1;
    state.mission.step = 0;
    state.mission.target = null;
    state.mission.text = '';
    state.mission.tag = 'Free Roam';
    state.mission.name = '';
    const p = state.player;
    Object.assign(p, {
      x: START.x, y: 0, z: START.z, vx: 0, vy: 0, vz: 0, yaw: START.yaw, pitch: 0,
      health: PLAYER.maxHealth, car: null, reload: 0, punchCd: 0, fireCd: 0,
      onGround: true, phase: 0, moving: false, lastHurt: -99,
    });
    for (let i = 0; i < TRAFFIC.cars; i += 1) spawnTraffic();
    for (let i = 0; i < TRAFFIC.parked; i += 1) spawnParked();
    for (let i = 0; i < TRAFFIC.peds; i += 1) spawnPed();
    spawnMarisol();
    if (state.player.hasGun) {
      state.player.mag = WEAPON.mag;
      state.player.reserve = WEAPON.reserve;
    }
  }

  function startFreeRoam(restore) {
    reset();
    if (restore) applySave(restore);
    state.mode = 'play';
    state.mission.tag = 'Free Roam';
    state.mission.text = 'Explore Costa Aurelia';
    updateObjective();
  }

  function ackMissionDone() {
    state.missionDone = null;
    state.mission.tag = 'Free Roam';
    state.mission.text = 'Explore Costa Aurelia';
    state.mission.target = null;
  }

  function teleport(x, z, yaw) {
    state.player.x = x;
    state.player.z = z;
    if (yaw !== undefined) state.player.yaw = yaw;
    if (state.player.car) {
      state.player.car.x = x;
      state.player.car.z = z;
    }
  }

  function applySave(data) {
    if (!data) return false;
    state.cash = Math.max(0, data.cash | 0);
    if (Array.isArray(data.completed)) {
      for (let i = 0; i < state.completed.length; i += 1) state.completed[i] = !!data.completed[i];
    }
    state.wanted = clamp(data.wanted | 0, 0, WANTED.max);
    state.player.hasGun = !!data.gun;
    if (state.player.hasGun) {
      state.player.mag = WEAPON.mag;
      state.player.reserve = WEAPON.reserve;
    }
    return true;
  }

  return {
    state, step, reset, startMission, startFreeRoam, ackMissionDone, teleport, applySave,
    get marisol() { return marisol; },
    clockText,
  };
}
