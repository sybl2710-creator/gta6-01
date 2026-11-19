// The world the simulation and the renderer share: the city built from one seed, the sky, and
// the actor hooks that keep meshes in step with state. main.js builds one and hands it out.
import { createCity } from './city.js';
import { createSky } from './sky.js';

export function buildWorld(random) {
  const city = createCity(random);
  return { city, createSky };
}
