// The three screenshot scenes behind ?shot=start|play|end. Each sets the real simulation to a
// scene the game can reach, runs the real fixed step for a fixed number of ticks so traffic,
// pedestrians and the clock have moved, and leaves the world frozen for the capture. The city,
// the crowd and the frame all come from the seed, so the same seed always paints the same picture.
import { MISSIONS, STEP } from './config.js';

const IDLE = {
  lookX: 0, lookY: 0, forward: 0, strafe: 0, fwd: 0, sprint: false,
  jump: false, handbrake: false, interact: false, reload: false, fire: false,
};

function run(sim, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) sim.step(STEP, IDLE);
  sim.state.player.punchCd = 0;
  sim.state.player.fireCd = 0;
}

function freeze(sim, renderer) {
  sim.state.mode = 'paused';
  sim.state.dead = null;
  sim.state.toastTime = 0;
  renderer.update(sim.state, 0);
}

export function stageShot(name, sim, renderer) {
  if (name === 'play') {
    sim.startFreeRoam();
    const state = sim.state;
    state.player.x = -145.6;
    state.player.z = 44;
    state.player.yaw = 0;
    state.player.pitch = -0.02;
    const car = state.cars.find((c) => c.kind === 'parked') || state.cars[0];
    if (car) {
      car.x = -140.2;
      car.z = 47;
      car.yaw = 0;
    }
    const ped = state.peds.find((p) => !p.marisol);
    if (ped) {
      ped.x = -150.6;
      ped.z = 58;
      ped.yaw = 2.7;
      ped.state = 'idle';
      ped.walk = null;
      ped.phase = 0;
    }
    state.player.hasGun = false;
    state.mission.tag = 'Free Roam';
    state.mission.text = 'Explore Costa Aurelia';
    state.mission.target = null;
    run(sim, 0.35);
    freeze(sim, renderer);
    return 'play';
  }

  if (name === 'end') {
    sim.startMission(0);
    run(sim, 0.6);
    const state = sim.state;
    state.completed[0] = true;
    state.cash = 800;
    state.mission.active = false;
    state.mission.target = null;
    state.missionDone = { name: MISSIONS[0].name, pay: MISSIONS[0].pay };
    state.player.hasGun = true;
    state.mission.text = 'Back to the coast — Marisol will call.';
    state.player.mag = 12;
    state.player.reserve = 60;
    state.cameraPan = -3.1;
    freeze(sim, renderer);
    return 'mission';
  }

  sim.reset();
  sim.state.cash = 0;
  sim.state.player.x = 198;
  sim.state.player.z = 6;
  sim.state.player.yaw = -1.35;
  sim.state.player.pitch = 0.04;
  sim.state.mode = 'play';
  run(sim, 2.6);
  sim.state.mode = 'title';
  sim.state.mission.text = 'Explore Costa Aurelia';
  sim.state.mission.target = null;
  renderer.update(sim.state, 0);
  return 'title';
}
