// Costa Aurelia, generated from one seed: a 7x7 grid of blocks on 58 m pitch, a downtown cluster
// of towers in the middle, low warehouses to the west, hotels facing the beach, and the ocean
// along the east edge. Every mesh here is built once at boot from primitives; the simulation only
// ever reads the collider and road arrays it returns.
import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';

const ROAD_LINES = [];
for (let i = 0; i < 8; i += 1) ROAD_LINES.push(-CITY.half + i * CITY.pitch);
const BLOCK_CENTRES = [];
for (let i = 0; i < 7; i += 1) BLOCK_CENTRES.push(-CITY.half + CITY.road / 2 + CITY.block / 2 + i * CITY.pitch);
const BEACH_X = 212;
const SHORE_X = 262;

function boxGeometry() {
  return new THREE.BoxGeometry(1, 1, 1);
}

function tint(hex, amount) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amount);
  return c;
}

function addInstanced(group, geometry, material, count) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.frustumCulled = false;
  group.add(mesh);
  return mesh;
}

/** A CanvasTexture of soft window glazing, used on the low-rise shopfronts. */
function shopTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  g.fillStyle = '#d8c7aa';
  g.fillRect(0, 0, size, size);
  g.fillStyle = '#41545c';
  g.fillRect(10, 30, 108, 66);
  g.fillStyle = 'rgba(255,225,170,.32)';
  for (let i = 0; i < 4; i += 1) g.fillRect(16 + i * 27, 36, 16, 54);
  g.fillStyle = '#b9a583';
  g.fillRect(0, 104, size, 24);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function createCity(random) {
  const group = new THREE.Group();
  const colliders = [];
  const buildings = [];
  const palms = [];
  const props = [];
  const roadLines = [];

  for (const pos of ROAD_LINES) {
    roadLines.push({ axis: 'x', pos, min: -CITY.half, max: CITY.half });
    roadLines.push({ axis: 'z', pos, min: -CITY.half, max: CITY.half });
  }

  // Ground: warm stone across the city, sand along the coast, then the sea.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 560),
    new THREE.MeshStandardMaterial({ color: PALETTE.sidewalk, roughness: 0.94 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 0);
  ground.receiveShadow = true;
  group.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(SHORE_X - BEACH_X + 6, 560),
    new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 1 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set((BEACH_X + SHORE_X) / 2, 0.03, 0);
  sand.receiveShadow = true;
  group.add(sand);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(620, 620),
    new THREE.MeshStandardMaterial({ color: PALETTE.ocean, roughness: 0.24, metalness: 0.25 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(SHORE_X + 310, -0.35, 0);
  group.add(sea);

  const foam = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 560),
    new THREE.MeshStandardMaterial({ color: PALETTE.foam, roughness: 0.6, transparent: true, opacity: 0.7 }),
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(SHORE_X - 4, 0.05, 0);
  group.add(foam);

  // Asphalt for the two directions of every road, plus lane dashes and crosswalks.
  const asphalt = new THREE.MeshStandardMaterial({ color: PALETTE.asphalt, roughness: 0.9 });
  const roadGeom = new THREE.BoxGeometry(CITY.half * 2 + CITY.road, 0.08, CITY.road);
  for (const pos of ROAD_LINES) {
    const alongX = new THREE.Mesh(roadGeom, asphalt);
    alongX.position.set(0, 0.04, pos);
    alongX.receiveShadow = true;
    group.add(alongX);
    const alongZ = new THREE.Mesh(roadGeom, asphalt);
    alongZ.rotation.y = Math.PI / 2;
    alongZ.position.set(pos, 0.041, 0);
    alongZ.receiveShadow = true;
    group.add(alongZ);
  }

  const dashGeom = new THREE.BoxGeometry(0.22, 0.02, 2.6);
  const dashes = [];
  for (const pos of ROAD_LINES) {
    for (let t = -CITY.half + 9; t < CITY.half - 6; t += 9) {
      const nearCross = ROAD_LINES.some((line) => Math.abs(line - t) < 10);
      if (nearCross) continue;
      dashes.push({ x: t, z: pos, rot: 0 });
      dashes.push({ x: pos, z: t, rot: Math.PI / 2 });
    }
  }
  const dashMesh = addInstanced(group, dashGeom, new THREE.MeshBasicMaterial({ color: 0xf2e6c2 }), dashes.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const posV = new THREE.Vector3();
  for (let i = 0; i < dashes.length; i += 1) {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), dashes[i].rot);
    posV.set(dashes[i].x, 0.09, dashes[i].z);
    m.compose(posV, q, scale);
    dashMesh.setMatrixAt(i, m);
  }

  const crossGeom = new THREE.BoxGeometry(0.5, 0.02, 3.2);
  const crosses = [];
  for (const px of ROAD_LINES) {
    for (const pz of ROAD_LINES) {
      for (let k = -4; k <= 4; k += 1) {
        if (Math.abs(k) < 1) continue;
        crosses.push({ x: px + k * 1.25, z: pz + CITY.road / 2 + 2, rot: 0 });
        crosses.push({ x: px + k * 1.25, z: pz - CITY.road / 2 - 2, rot: 0 });
        crosses.push({ x: px + CITY.road / 2 + 2, z: pz + k * 1.25, rot: Math.PI / 2 });
        crosses.push({ x: px - CITY.road / 2 - 2, z: pz + k * 1.25, rot: Math.PI / 2 });
      }
    }
  }
  const crossMesh = addInstanced(group, crossGeom, new THREE.MeshBasicMaterial({ color: 0xe8ddc2 }), crosses.length);
  for (let i = 0; i < crosses.length; i += 1) {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), crosses[i].rot);
    posV.set(crosses[i].x, 0.092, crosses[i].z);
    m.compose(posV, q, scale);
    crossMesh.setMatrixAt(i, m);
  }

  // Lots: every block is split into one to four footprints.
  const lots = [];
  for (let bi = 0; bi < 7; bi += 1) {
    for (let bj = 0; bj < 7; bj += 1) {
      const cx = BLOCK_CENTRES[bi];
      const cz = BLOCK_CENTRES[bj];
      const isPark = bi === 2 && bj === 5;
      const isMarina = bi === 6 && bj === 2;
      if (isPark) {
        const lawn = new THREE.Mesh(
          new THREE.BoxGeometry(CITY.block - 8, 0.12, CITY.block - 8),
          new THREE.MeshStandardMaterial({ color: PALETTE.park, roughness: 1 }),
        );
        lawn.position.set(cx, 0.08, cz);
        lawn.receiveShadow = true;
        group.add(lawn);
        for (let p = 0; p < 7; p += 1) palms.push({ x: cx - 14 + (p % 4) * 9, z: cz - 12 + Math.floor(p / 4) * 16 });
        props.push({ kind: 'bench', x: cx, z: cz + 6, rot: 0 });
        continue;
      }
      if (isMarina) {
        const dock = new THREE.Mesh(
          new THREE.BoxGeometry(CITY.block - 10, 0.3, CITY.block - 10),
          new THREE.MeshStandardMaterial({ color: 0x9a8a72, roughness: 0.9 }),
        );
        dock.position.set(cx, 0.16, cz);
        group.add(dock);
        for (let b = 0; b < 5; b += 1) props.push({ kind: 'crate', x: cx - 12 + b * 6, z: cz + 9, rot: 0 });
        continue;
      }
      const downtown = Math.abs(bi - 3) <= 1 && Math.abs(bj - 3) <= 1;
      const beachfront = bi === 6;
      const split = random() < 0.62 ? 2 : 1;
      const cell = (CITY.block - 10) / split;
      for (let si = 0; si < split; si += 1) {
        for (let sj = 0; sj < split; sj += 1) {
          if (split === 2 && random() < 0.12) continue;
          const lx = cx - (CITY.block - 10) / 2 + cell * (si + 0.5);
          const lz = cz - (CITY.block - 10) / 2 + cell * (sj + 0.5);
          const w = cell * (0.62 + random() * 0.26);
          const d = cell * (0.62 + random() * 0.26);
          let h;
          if (downtown) h = 38 + random() * 78;
          else if (beachfront) h = 16 + random() * 30;
          else if (bi <= 1 || bj <= 1) h = 7 + random() * 13;
          else h = 11 + random() * 26;
          lots.push({ x: lx, z: lz, w, d, h, downtown, beachfront });
        }
      }
    }
  }

  // Building bodies, window ribbons and parapets, each in one instanced draw call.
  const bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0.08 });
  const bandMat = new THREE.MeshStandardMaterial({ color: PALETTE.glass, roughness: 0.18, metalness: 0.55 });
  const roofMat = new THREE.MeshStandardMaterial({ roughness: 0.95 });
  const bodyMesh = addInstanced(group, boxGeometry(), bodyMat, lots.length);
  let bandCount = 0;
  for (const lot of lots) bandCount += Math.max(1, Math.floor(lot.h / 3.4));
  const bandMesh = addInstanced(group, boxGeometry(), bandMat, bandCount);
  const roofMesh = addInstanced(group, boxGeometry(), roofMat, lots.length);
  const colour = new THREE.Color();
  let band = 0;
  for (let i = 0; i < lots.length; i += 1) {
    const lot = lots[i];
    colour.setHex(PALETTE.building[i % PALETTE.building.length]);
    if (lot.downtown) colour.offsetHSL(0.02, 0.05, -0.08);
    if (lot.beachfront) colour.setHex(i % 3 === 0 ? 0xf2e3c4 : 0xe6b48c);
    posV.set(lot.x, lot.h / 2, lot.z);
    scale.set(lot.w, lot.h, lot.d);
    q.identity();
    m.compose(posV, q, scale);
    bodyMesh.setMatrixAt(i, m);
    bodyMesh.setColorAt(i, colour);
    posV.set(lot.x, lot.h + 0.35, lot.z);
    scale.set(lot.w + 0.7, 0.7, lot.d + 0.7);
    m.compose(posV, q, scale);
    roofMesh.setMatrixAt(i, m);
    roofMesh.setColorAt(i, tint(0xb7a68d, 0));
    const floors = Math.max(1, Math.floor(lot.h / 3.4));
    for (let f = 0; f < floors; f += 1) {
      posV.set(lot.x, 1.9 + f * 3.4, lot.z);
      scale.set(lot.w + 0.16, 1.15, lot.d + 0.16);
      m.compose(posV, q, scale);
      bandMesh.setMatrixAt(band, m);
      bandMesh.setColorAt(band, tint(lot.downtown ? 0x2b5966 : 0x39565f, random() * 0.05));
      band += 1;
    }
    colliders.push({
      minX: lot.x - lot.w / 2, maxX: lot.x + lot.w / 2,
      minZ: lot.z - lot.d / 2, maxZ: lot.z + lot.d / 2, h: lot.h,
    });
    buildings.push({ x: lot.x, z: lot.z, w: lot.w, d: lot.d, h: lot.h, downtown: lot.downtown });
  }
  bodyMesh.instanceColor.needsUpdate = true;
  bandMesh.instanceColor.needsUpdate = true;
  roofMesh.instanceColor.needsUpdate = true;

  // Rooftop plant: a few AC boxes and aerials on the taller roofs.
  const acGeom = new THREE.BoxGeometry(1, 1, 1);
  const acMat = new THREE.MeshStandardMaterial({ color: 0xa9a396, roughness: 0.85 });
  const acs = [];
  for (const lot of lots) {
    if (lot.h < 18) continue;
    const n = 1 + Math.floor(random() * 3);
    for (let a = 0; a < n; a += 1) {
      acs.push({ x: lot.x + (random() - 0.5) * lot.w * 0.6, z: lot.z + (random() - 0.5) * lot.d * 0.6, y: lot.h + 1.1, s: 1 + random() * 1.6 });
    }
  }
  const acMesh = addInstanced(group, acGeom, acMat, acs.length);
  for (let i = 0; i < acs.length; i += 1) {
    posV.set(acs[i].x, acs[i].y, acs[i].z);
    scale.set(acs[i].s, 1.4, acs[i].s);
    q.identity();
    m.compose(posV, q, scale);
    acMesh.setMatrixAt(i, m);
  }

  // Shopfront awnings on the low-rise blocks give the streets a human scale.
  const shopMat = new THREE.MeshStandardMaterial({ map: shopTexture(), roughness: 0.8 });
  const shops = lots.filter((lot) => lot.h < 16 && !lot.downtown).slice(0, 26);
  for (const lot of shops) {
    const facade = new THREE.Mesh(new THREE.BoxGeometry(lot.w + 0.1, 3.4, lot.d + 0.1), shopMat);
    facade.position.set(lot.x, 1.7, lot.z);
    group.add(facade);
  }

  // Palm trees: tapered trunks plus crossed frond planes.
  const trunkGeom = new THREE.CylinderGeometry(0.2, 0.42, 1, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: PALETTE.trunk, roughness: 0.95 });
  const frondGeom = new THREE.ConeGeometry(0.55, 4.4, 4, 1, true);
  const frondMat = new THREE.MeshStandardMaterial({ color: PALETTE.frond, roughness: 0.9, side: THREE.DoubleSide });
  const frond2 = new THREE.ConeGeometry(0.4, 3.2, 3, 1, true);
  const palmCount = palms.length;
  const trunkMesh = addInstanced(group, trunkGeom, trunkMat, palmCount);
  const frondMesh = addInstanced(group, frondGeom, frondMat, palmCount * 4);
  const frondMesh2 = addInstanced(group, frond2, frondMat, palmCount * 2);
  for (let i = 0; i < palmCount; i += 1) {
    const palm = palms[i];
    const h = 7 + random() * 5;
    q.identity();
    posV.set(palm.x, h / 2, palm.z);
    scale.set(1, h, 1);
    m.compose(posV, q, scale);
    trunkMesh.setMatrixAt(i, m);
    for (let f = 0; f < 4; f += 1) {
      q.setFromEuler(new THREE.Euler(0.62, (f * Math.PI) / 2 + random() * 0.4, 0));
      posV.set(palm.x, h + 0.5, palm.z);
      scale.set(1, 1, 1);
      m.compose(posV, q, scale);
      frondMesh.setMatrixAt(i * 4 + f, m);
    }
    for (let f = 0; f < 2; f += 1) {
      q.setFromEuler(new THREE.Euler(0.95, f * Math.PI + 0.5, 0));
      posV.set(palm.x, h + 0.3, palm.z);
      m.compose(posV, q, scale);
      frondMesh2.setMatrixAt(i * 2 + f, m);
    }
  }

  // Beach palms and promenade lamps.
  for (let z = -230; z <= 230; z += 17) {
    palms.push({ x: BEACH_X + 7 + random() * 8, z });
  }
  for (let z = -200; z <= 200; z += 20) props.push({ kind: 'lamp', x: 208, z, rot: 0 });
  for (let x = -190; x <= 190; x += 26) {
    props.push({ kind: 'lamp', x, z: -208, rot: 0 });
    props.push({ kind: 'lamp', x, z: 208, rot: 0 });
  }
  for (let z = -100; z <= 100; z += 22) props.push({ kind: 'umbrella', x: BEACH_X + 22 + random() * 16, z, rot: random() * 3 });

  // Rebuild the beach palms now that they exist, in their own instanced meshes.
  const beachPalms = palms.slice(palmCount);
  if (beachPalms.length > 0) {
    const bt = addInstanced(group, trunkGeom, trunkMat, beachPalms.length);
    const bf = addInstanced(group, frondGeom, frondMat, beachPalms.length * 4);
    for (let i = 0; i < beachPalms.length; i += 1) {
      const palm = beachPalms[i];
      const h = 6 + random() * 5;
      q.identity();
      posV.set(palm.x, h / 2, palm.z);
      scale.set(1, h, 1);
      m.compose(posV, q, scale);
      bt.setMatrixAt(i, m);
      for (let f = 0; f < 4; f += 1) {
        q.setFromEuler(new THREE.Euler(0.7, (f * Math.PI) / 2 + random() * 0.4, 0));
        posV.set(palm.x, h + 0.4, palm.z);
        scale.set(1, 1, 1);
        m.compose(posV, q, scale);
        bf.setMatrixAt(i * 4 + f, m);
      }
    }
  }

  // Lamp posts, benches, crates and parasols as simple instanced parts.
  const lampPosts = props.filter((p) => p.kind === 'lamp');
  const lampGeom = new THREE.CylinderGeometry(0.09, 0.12, 5.4, 5);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x3a4045, roughness: 0.7 });
  const lampMesh = addInstanced(group, lampGeom, lampMat, lampPosts.length);
  const headGeom = new THREE.BoxGeometry(0.9, 0.16, 0.32);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff0c0, emissive: 0xffe0a0, emissiveIntensity: 0.55 });
  const headMesh = addInstanced(group, headGeom, headMat, lampPosts.length);
  for (let i = 0; i < lampPosts.length; i += 1) {
    const p = lampPosts[i];
    q.identity();
    posV.set(p.x, 2.7, p.z);
    scale.set(1, 1, 1);
    m.compose(posV, q, scale);
    lampMesh.setMatrixAt(i, m);
    posV.set(p.x + 0.35, 5.3, p.z);
    m.compose(posV, q, scale);
    headMesh.setMatrixAt(i, m);
  }

  const crates = props.filter((p) => p.kind === 'crate');
  const crateGeom = new THREE.BoxGeometry(1.1, 1.1, 1.1);
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x8a6b46, roughness: 0.9 });
  const crateMesh = addInstanced(group, crateGeom, crateMat, crates.length);
  for (let i = 0; i < crates.length; i += 1) {
    posV.set(crates[i].x, 0.7, crates[i].z);
    scale.set(1, 1, 1);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), crates[i].rot);
    m.compose(posV, q, scale);
    crateMesh.setMatrixAt(i, m);
    colliders.push({ minX: crates[i].x - 0.6, maxX: crates[i].x + 0.6, minZ: crates[i].z - 0.6, maxZ: crates[i].z + 0.6, h: 1.1 });
  }

  const benches = props.filter((p) => p.kind === 'bench');
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x6d5033, roughness: 0.9 });
  for (const bench of benches) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.7), benchMat);
    mesh.position.set(bench.x, 0.3, bench.z);
    group.add(mesh);
  }

  const umbrellas = props.filter((p) => p.kind === 'umbrella');
  const poleGeom = new THREE.CylinderGeometry(0.05, 0.05, 2.4, 4);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xdddddd });
  const canopyGeom = new THREE.ConeGeometry(1.6, 0.55, 8);
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0xf07a5e, roughness: 0.85, side: THREE.DoubleSide });
  const poleMesh = addInstanced(group, poleGeom, poleMat, umbrellas.length);
  const canopyMesh = addInstanced(group, canopyGeom, canopyMat, umbrellas.length);
  for (let i = 0; i < umbrellas.length; i += 1) {
    const u = umbrellas[i];
    q.identity();
    posV.set(u.x, 1.2, u.z);
    scale.set(1, 1, 1);
    m.compose(posV, q, scale);
    poleMesh.setMatrixAt(i, m);
    posV.set(u.x, 2.45, u.z);
    m.compose(posV, q, scale);
    canopyMesh.setMatrixAt(i, m);
  }

  // Kerbs: a thin pale lip around each block, read at street level.
  const kerbGeom = new THREE.BoxGeometry(CITY.block, 0.16, 0.5);
  const kerbMat = new THREE.MeshStandardMaterial({ color: 0xded0b4, roughness: 0.95 });
  const kerbs = [];
  for (const cx of BLOCK_CENTRES) {
    for (const cz of BLOCK_CENTRES) {
      kerbs.push({ x: cx, z: cz - CITY.block / 2 - 0.3, rot: 0 });
      kerbs.push({ x: cx, z: cz + CITY.block / 2 + 0.3, rot: 0 });
      kerbs.push({ x: cx - CITY.block / 2 - 0.3, z: cz, rot: Math.PI / 2 });
      kerbs.push({ x: cx + CITY.block / 2 + 0.3, z: cz, rot: Math.PI / 2 });
    }
  }
  const kerbMesh = addInstanced(group, kerbGeom, kerbMat, kerbs.length);
  for (let i = 0; i < kerbs.length; i += 1) {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), kerbs[i].rot);
    posV.set(kerbs[i].x, 0.08, kerbs[i].z);
    scale.set(1, 1, 1);
    m.compose(posV, q, scale);
    kerbMesh.setMatrixAt(i, m);
  }

  // Sidewalk rectangles for pedestrian routes: a ring just inside each block.
  const walks = [];
  for (const cx of BLOCK_CENTRES) {
    for (const cz of BLOCK_CENTRES) {
      const r = CITY.block / 2 - 2.2;
      walks.push({ minX: cx - r, maxX: cx + r, minZ: cz - r, maxZ: cz + r, cx, cz, r });
    }
  }

  return {
    group, colliders, buildings, roadLines, walks, palms,
    beach: { x: BEACH_X, shore: SHORE_X },
    roads: ROAD_LINES, blocks: BLOCK_CENTRES,
    bounds: { min: -CITY.half - 6, max: CITY.half + 6 },
  };
}

/** Distance from a point to the nearest road centreline, used by traffic and the minimap label. */
export function nearestRoad(city, x, z) {
  let best = Infinity;
  let line = null;
  for (const road of city.roadLines) {
    const d = road.axis === 'x' ? Math.abs(z - road.pos) : Math.abs(x - road.pos);
    if (d < best) {
      best = d;
      line = road;
    }
  }
  return { d: best, line };
}
