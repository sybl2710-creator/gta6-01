// Velvet Tide: an original open-world crime game set in the invented city of Costa Aurelia, built
// with three.js and delivered as plain static files. game/index.html opens offline and plays with
// keyboard and mouse: Jacob Rios walks or drives the 7x7 street grid, steals cars, deals with
// traffic and a living crowd, draws police heat up to five stars, fights on foot with fists and a
// pistol, and takes jobs from Marisol Vane that begin with "First Light" and pay $800. Progress
// saves to localStorage; the HUD carries health, cash, wanted stars, a minimap, the clock and the
// current objective. The few files here are the hand-in plumbing only.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
