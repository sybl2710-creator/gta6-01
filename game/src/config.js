// Every tuning number, colour and story beat in one place. Units are metres and seconds; the
// simulation runs at a fixed 60 Hz step whatever the display does.
export const STEP = 1 / 60;

export const CITY = { count: 7, block: 44, road: 14, pitch: 58, half: 203, mapSpan: 520 };

export const PLAYER = {
  walk: 4.6, sprint: 8.2, jump: 6.4, gravity: 19, radius: 0.42, height: 1.8,
  maxHealth: 100, regenDelay: 9, regenRate: 3, eye: 1.62,
};

export const CAR = {
  maxSpeed: 27, reverse: 8, accel: 10.5, brake: 22, drag: 0.7, roll: 1.6,
  wheelbase: 2.7, steer: 0.62, radius: 1.7, length: 4.4, width: 2.0,
  enterRange: 4.2, handbrake: 0.965,
};

export const WEAPON = {
  damage: 34, range: 70, mag: 12, reserve: 60, reload: 1.35, fireDelay: 0.24,
  spread: 0.012, punchRange: 2.4, punchDamage: 42, punchDelay: 0.4,
};

export const WANTED = {
  max: 5, decayAfter: 14, decayStep: 6, sirenRange: 90, bustRange: 2.4, bustTime: 1.4,
  copShootRange: 24, copDamage: 5, copFireDelay: 1.15, maxCars: 4, maxFoot: 8,
};

export const TRAFFIC = { cars: 30, parked: 26, peds: 44, speed: 8.5, lane: 3.6 };

export const RENDER = { fogNear: 90, fogFar: 430, far: 900 };

export const SAVE_KEY = 'velvet-tide.save.v1';

/** Warm sun-soaked palette: coral render, cream stone, teal glass, pale sand. */
export const PALETTE = {
  skyTop: 0x4c9ad6, skyHorizon: 0xffd6a8, sun: 0xfff0c9, fog: 0xf7e0c2,
  asphalt: 0x3b3f43, sidewalk: 0xc9b79b, lot: 0xa89a86, sand: 0xe8d3a4,
  ocean: 0x1f8ea8, foam: 0xf3f6ee, park: 0x6f9e58,
  building: [0xf4e6cf, 0xe8c9a8, 0xe6a882, 0xd98b72, 0xc8d9d4, 0x9fc7c9, 0xf0d9b0, 0xb8c8cf],
  glass: 0x2f5f6e, band: 0x2a4b57, trunk: 0x8a6a44, frond: 0x3f7a44,
  car: [0xd94f45, 0xf2f0e8, 0x2f6f8f, 0xe7b23e, 0x2d2f33, 0x7fb8a6, 0xc06a9a, 0xf0a04a],
  police: 0x24354a, cop: 0x2c4f86, player: 0xe8dcc8, playerJacket: 0x2f7d74,
  skin: [0xf0c9a0, 0xc98d63, 0x8d5b3c, 0x6b4128],
  shirt: [0xe8e2d2, 0xd96f5a, 0x4f8f9e, 0xe0b552, 0x7a5a8f, 0x5c8a5a],
  marker: 0xffc45e, markerDone: 0x43d8c8,
};

export const MISSION_POS = {
  marisol: { x: -160, z: 38.5 },
  pier: { x: 145, z: 203 },
  docks: { x: 145, z: 145 },
  warehouse: { x: -145, z: -145 },
  lighthouse: { x: -203, z: 203 },
  rook: { x: 87, z: 87 },
};

/**
 * The three-job story chain. Each step is one objective; the world advances the step when the
 * condition holds, and pays the job's cash when the last one does. `set` fires once on entry.
 */
export const MISSIONS = [
  {
    name: 'First Light', pay: 800, blurb: 'Lift a car and shake the heat.',
    steps: [
      { type: 'car', text: 'Steal any car — press E beside one' },
      { type: 'goto', text: 'Drive to Pier 9 on the beachfront', ...MISSION_POS.pier, r: 9, needCar: true },
      { type: 'evade', text: 'Lose the police before they box you in', set: { wanted: 2 } },
      { type: 'goto', text: 'Get back to Marisol', ...MISSION_POS.marisol, r: 8 },
    ],
  },
  {
    name: 'Salt & Ledger', pay: 1400, blurb: 'Collect the ledger from the fish docks.',
    steps: [
      { type: 'goto', text: 'Pick up the ledger at the fish docks', ...MISSION_POS.docks, r: 7 },
      { type: 'goto', text: 'Deliver it to the warehouse on the north side', ...MISSION_POS.warehouse, r: 9, needCar: true, set: { wanted: 2 } },
      { type: 'evade', text: 'Lose the cops before you get paid' },
      { type: 'goto', text: 'Report back to Marisol', ...MISSION_POS.marisol, r: 8 },
    ],
  },
  {
    name: 'The Lighthouse Run', pay: 2600, blurb: 'Run Rook off the coast road.',
    steps: [
      { type: 'chase', text: "Wreck Rook's coupe — ram it or shoot it", set: { spawnRook: true } },
      { type: 'evade', text: 'Lose the heat', set: { wanted: 3 } },
      { type: 'goto', text: 'Meet Marisol at the lighthouse', ...MISSION_POS.lighthouse, r: 10 },
    ],
  },
];

export const STORY = 'Marisol Vane pays for nerve, not loyalty.';
