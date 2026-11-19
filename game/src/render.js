// The 3D layer: one WebGL scene for the city, a pool of actor meshes the simulation owns by
// reference, the third-person cameras on foot and in a car, and the small effect pools for
// tracers, muzzle flashes and sparks. It only reads simulation state, never writes it.
import * as THREE from 'three';
import { CITY, PALETTE, RENDER } from './config.js';
import { createCarMesh, createMarkerMesh, createPersonMesh, createPlayerMesh } from './models.js';

const UP = new THREE.Vector3(0, 1, 0);

export function createRenderScene(canvas, city) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.add(city.group);
  let sky = null;
  const camera = new THREE.PerspectiveCamera(62, 1, 0.25, RENDER.far);
  camera.position.set(-145, 8, 60);

  const playerMesh = createPlayerMesh();
  playerMesh.visible = false;
  scene.add(playerMesh);
  const marker = createMarkerMesh();
  marker.visible = false;
  scene.add(marker);

  // Tracer lines: a fixed pool, positions rewritten each frame from the simulation's list.
  const tracerGeom = new THREE.BufferGeometry();
  tracerGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * 3), 3));
  const tracerPool = [];
  for (let i = 0; i < 16; i += 1) {
    const line = new THREE.Line(tracerGeom.clone(), new THREE.LineBasicMaterial({
      color: 0xffe9a8, transparent: true, opacity: 0.9, depthWrite: false,
    }));
    line.frustumCulled = false;
    line.visible = false;
    scene.add(line);
    tracerPool.push(line);
  }

  const sparkGeom = new THREE.SphereGeometry(0.14, 6, 4);
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const effectPool = [];
  for (let i = 0; i < 16; i += 1) {
    const mesh = new THREE.Mesh(sparkGeom, flashMat);
    mesh.visible = false;
    scene.add(mesh);
    effectPool.push(mesh);
  }

  const carMeshes = new Map();
  const pedMeshes = new Map();

  const hooks = {
    addCar(car) {
      const mesh = createCarMesh(car.colour, car.kind === 'police');
      mesh.position.set(car.x, 0, car.z);
      mesh.rotation.y = car.yaw;
      scene.add(mesh);
      carMeshes.set(car, mesh);
      car.mesh = mesh;
    },
    removeCar(car) {
      const mesh = carMeshes.get(car);
      if (!mesh) return;
      scene.remove(mesh);
      carMeshes.delete(car);
      car.mesh = null;
    },
    addPed(ped) {
      const mesh = createPersonMesh(ped.skin, ped.shirt, ped.cop);
      if (ped.marisol) {
        mesh.children[0].material = new THREE.MeshStandardMaterial({ color: 0x8f2f4f, roughness: 0.8 });
      }
      mesh.position.set(ped.x, 0, ped.z);
      mesh.rotation.y = ped.yaw;
      scene.add(mesh);
      pedMeshes.set(ped, mesh);
      ped.mesh = mesh;
    },
    removePed(ped) {
      const mesh = pedMeshes.get(ped);
      if (!mesh) return;
      scene.remove(mesh);
      pedMeshes.delete(ped);
      ped.mesh = null;
    },
  };

  function syncCars(state) {
    for (const car of state.cars) {
      const mesh = carMeshes.get(car);
      if (!mesh) continue;
      mesh.position.set(car.x, car.wrecked ? -0.28 : 0, car.z);
      mesh.rotation.y = car.yaw;
      if (car.wrecked) mesh.rotation.z = 0.08;
      const wheels = mesh.userData.wheels;
      if (wheels) {
        const spin = car.speed * 0.5;
        for (let i = 0; i < wheels.length; i += 1) {
          wheels[i].rotation.x += spin;
          if (i >= 2) wheels[i].rotation.y = 0;
        }
      }
      const siren = mesh.userData.siren;
      if (siren) {
        const on = state.wanted > 0;
        const phase = Math.floor(state.time * 6) % 2;
        siren[0].material.emissiveIntensity = on && phase === 0 ? 2.2 : 0.15;
        siren[1].material.emissiveIntensity = on && phase === 1 ? 2.2 : 0.15;
      }
      if (car === state.player.car) mesh.visible = true;
    }
  }

  function syncPeds(state) {
    for (const ped of state.peds) posePed(ped);
    for (const ped of state.cops) posePed(ped);
  }

  function posePed(ped) {
    const mesh = pedMeshes.get(ped);
    if (!mesh) return;
    const down = ped.state === 'down';
    mesh.position.set(ped.x, down ? 0.24 : 0, ped.z);
    mesh.rotation.y = ped.yaw;
    mesh.rotation.x = down ? -Math.PI / 2 : 0;
    const { legs, arms, gun } = mesh.userData;
    const swing = ped.state === 'idle' || down ? 0 : Math.sin(ped.phase) * (ped.cop ? 0.55 : 0.42);
    if (legs) {
      legs[0].rotation.x = swing;
      legs[1].rotation.x = -swing;
    }
    if (arms) {
      arms[0].rotation.x = -swing * 0.8;
      arms[1].rotation.x = swing * 0.8;
    }
    if (gun) gun.visible = !!ped.cop && !down;
  }

  function syncPlayer(state) {
    const p = state.player;
    playerMesh.visible = !p.car && state.mode !== 'title';
    playerMesh.position.set(p.x, p.y, p.z);
    playerMesh.rotation.y = p.yaw;
    const swing = p.moving ? Math.sin(p.phase) * 0.5 : 0;
    const data = playerMesh.userData;
    if (data.legs) {
      data.legs[0].rotation.x = swing;
      data.legs[1].rotation.x = -swing;
    }
    if (data.arms) {
      data.arms[0].rotation.x = -swing * 0.8;
      data.arms[1].rotation.x = swing * 0.8;
    }
    if (data.gun) data.gun.visible = p.hasGun && !p.car;
  }

  function syncMarker(state) {
    const target = state.mission.target;
    if (!target) {
      marker.visible = false;
      return;
    }
    marker.visible = true;
    marker.position.set(target.x, 0, target.z);
    const pulse = 1 + Math.sin(state.time * 3) * 0.06;
    marker.scale.set(pulse, 1, pulse);
    marker.userData.beam.material.opacity = 0.13 + Math.sin(state.time * 2.2) * 0.04;
  }

  function syncEffects(state) {
    for (let i = 0; i < tracerPool.length; i += 1) {
      const tracer = state.tracers[i];
      const line = tracerPool[i];
      if (!tracer) {
        line.visible = false;
        continue;
      }
      line.visible = true;
      const pos = line.geometry.attributes.position;
      pos.setXYZ(0, tracer.ax, tracer.ay, tracer.az);
      pos.setXYZ(1, tracer.bx, tracer.by, tracer.bz);
      pos.needsUpdate = true;
      line.material.opacity = Math.min(1, tracer.ttl * 14);
    }
    for (let i = 0; i < effectPool.length; i += 1) {
      const fx = state.effects[i];
      const mesh = effectPool[i];
      if (!fx) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      mesh.position.set(fx.x, fx.y, fx.z);
      mesh.material = fx.kind === 'spark' ? sparkMat : flashMat;
      const s = fx.kind === 'boom' ? 1 + (0.5 - fx.ttl) * 6 : 1;
      mesh.scale.setScalar(s);
      mesh.material.opacity = Math.min(1, fx.ttl * 8);
    }
  }

  function updateCamera(state, dt) {
    const p = state.player;
    const car = p.car;
    let tx;
    let ty;
    let tz;
    let lx;
    let ly;
    let lz;
    if (car) {
      const back = 9.2;
      tx = car.x - Math.sin(car.yaw) * back;
      tz = car.z - Math.cos(car.yaw) * back;
      ty = 4.4 + Math.max(0, car.speed) * 0.05;
      lx = car.x + Math.sin(car.yaw) * 5;
      ly = 1.4;
      lz = car.z + Math.cos(car.yaw) * 5;
    } else {
      const pitch = Math.max(-0.7, Math.min(0.7, p.pitch)) * 0.7;
      const back = 5.4;
      const yaw = p.yaw + Math.PI;
      tx = p.x + Math.sin(yaw) * back * Math.cos(pitch);
      tz = p.z + Math.cos(yaw) * back * Math.cos(pitch);
      ty = p.y + 2.3 - Math.sin(pitch) * back;
      lx = p.x + Math.sin(p.yaw) * 6;
      ly = p.y + 1.5;
      lz = p.z + Math.cos(p.yaw) * 6;
      const pan = state.cameraPan ?? 0;
      lx += Math.cos(p.yaw) * pan;
      lz -= Math.sin(p.yaw) * pan;
    }
    if (state.shake > 0) {
      const t = state.time * 47;
      tx += Math.sin(t) * state.shake * 0.4;
      ty += Math.cos(t * 1.3) * state.shake * 0.3;
      tz += Math.sin(t * 0.7) * state.shake * 0.4;
    }
    const k = 1 - Math.exp(-dt * 9);
    camera.position.x += (tx - camera.position.x) * k;
    camera.position.y += (ty - camera.position.y) * k;
    camera.position.z += (tz - camera.position.z) * k;
    camera.lookAt(lx, ly, lz);
    const fov = car ? 66 + Math.min(10, Math.abs(car.speed) * 0.3) : 62;
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov += (fov - camera.fov) * Math.min(1, dt * 4);
      camera.updateProjectionMatrix();
    }
    sky?.update(p.x, p.z);
  }

  function resize() {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  function update(state, dt) {
    syncCars(state);
    syncPeds(state);
    syncPlayer(state);
    syncMarker(state);
    syncEffects(state);
    updateCamera(state, dt);
  }

  function render() {
    renderer.render(scene, camera);
  }

  return {
    renderer, scene, camera, hooks, update, render, resize, marker, playerMesh,
    setSky(next) { sky = next; },
  };
}

/** Live minimap: roads, blocks, the player, cars, police and the job marker, rotated to north. */
export function drawMinimap(context, state, city) {
  const size = context.canvas.width;
  const half = size / 2;
  const span = 190;
  const scale = half / span;
  const px = state.player.car ? state.player.car.x : state.player.x;
  const pz = state.player.car ? state.player.car.z : state.player.z;
  context.clearRect(0, 0, size, size);
  context.save();
  context.beginPath();
  context.arc(half, half, half, 0, Math.PI * 2);
  context.clip();
  context.fillStyle = '#152329';
  context.fillRect(0, 0, size, size);
  context.translate(half, half);
  context.scale(scale, scale);
  context.translate(-px, -pz);

  context.strokeStyle = 'rgba(240, 228, 200, 0.16)';
  context.lineWidth = CITY.road;
  for (const line of city.roads) {
    context.beginPath();
    context.moveTo(-CITY.half, line);
    context.lineTo(CITY.half, line);
    context.moveTo(line, -CITY.half);
    context.lineTo(line, CITY.half);
    context.stroke();
  }
  context.fillStyle = 'rgba(246, 230, 200, 0.1)';
  for (const walk of city.walks) {
    context.fillRect(walk.minX, walk.minZ, walk.maxX - walk.minX, walk.maxZ - walk.minZ);
  }
  for (const car of state.cars) {
    if (car.wrecked) continue;
    context.fillStyle = car.kind === 'police' ? '#6fa8ff' : '#d9d0bd';
    context.fillRect(car.x - 2.2, car.z - 2.2, 4.4, 4.4);
  }
  for (const ped of state.cops) {
    if (ped.state === 'down') continue;
    context.fillStyle = '#ff6f61';
    context.beginPath();
    context.arc(ped.x, ped.z, 2.4, 0, Math.PI * 2);
    context.fill();
  }
  if (state.mission.target) {
    const t = state.mission.target;
    context.fillStyle = '#ffc45e';
    context.beginPath();
    context.arc(t.x, t.z, 5.5, 0, Math.PI * 2);
    context.fill();
  }
  context.fillStyle = '#43d8c8';
  context.beginPath();
  context.arc(px, pz, 4.6, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = 'rgba(255,255,255,.85)';
  context.lineWidth = 2;
  const yaw = state.player.car ? state.player.car.yaw : state.player.yaw;
  context.beginPath();
  context.moveTo(px + Math.sin(yaw) * 10, pz + Math.cos(yaw) * 10);
  context.lineTo(px + Math.sin(yaw + 2.5) * 5, pz + Math.cos(yaw + 2.5) * 5);
  context.lineTo(px + Math.sin(yaw - 2.5) * 5, pz + Math.cos(yaw - 2.5) * 5);
  context.closePath();
  context.stroke();
  context.restore();
}

/** A name for the street nearest the player, shown under the minimap. */
export function streetName(city, x, z) {
  let best = Infinity;
  let index = 0;
  let axis = 'x';
  for (const road of city.roadLines) {
    const d = road.axis === 'x' ? Math.abs(z - road.pos) : Math.abs(x - road.pos);
    if (d < best) {
      best = d;
      index = city.roads.indexOf(road.pos);
      axis = road.axis;
    }
  }
  const names = ['Coral', 'Avenida', 'Marina', 'Sol', 'Palma', 'Vista', 'Roca', 'Tide'];
  return `${names[Math.max(0, index) % names.length]} ${axis === 'x' ? 'Street' : 'Avenue'}`;
}
