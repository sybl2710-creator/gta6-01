// Small maths helpers shared by the simulation and the renderer. All of them are pure and
// allocation-free so the 60 Hz loop can call them freely.
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);

/** Shortest signed angle from a to b, in (-PI, PI]. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function turnToward(a, b, maxStep) {
  const d = angleDelta(a, b);
  return a + clamp(d, -maxStep, maxStep);
}

/** Push a circle (p.x, p.z, r) out of an axis-aligned box. Returns true on contact. */
export function pushOut(p, r, box) {
  const cx = clamp(p.x, box.minX, box.maxX);
  const cz = clamp(p.z, box.minZ, box.maxZ);
  const dx = p.x - cx;
  const dz = p.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-6) {
    const d = Math.sqrt(d2);
    const push = (r - d) / d;
    p.x += dx * push;
    p.z += dz * push;
  } else {
    const left = p.x - box.minX;
    const right = box.maxX - p.x;
    const near = p.z - box.minZ;
    const far = box.maxZ - p.z;
    const m = Math.min(left, right, near, far);
    if (m === left) p.x = box.minX - r;
    else if (m === right) p.x = box.maxX + r;
    else if (m === near) p.z = box.minZ - r;
    else p.z = box.maxZ + r;
  }
  return true;
}

export function inBox(x, z, box) {
  return x > box.minX && x < box.maxX && z > box.minZ && z < box.maxZ;
}

/** Ray (origin o, unit dir d) against a vertical cylinder of radius r; returns distance or -1. */
export function rayCylinder(ox, oy, oz, dx, dy, dz, cx, cz, r, height) {
  const mx = ox - cx;
  const mz = oz - cz;
  const a = dx * dx + dz * dz;
  if (a < 1e-6) return -1;
  const b = 2 * (mx * dx + mz * dz);
  const c = mx * mx + mz * mz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0) return -1;
  const y = oy + dy * t;
  return y > -0.2 && y < height ? t : -1;
}
