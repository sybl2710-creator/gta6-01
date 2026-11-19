// Shared procedural meshes: cars, people and the mission marker. Every model is built from boxes,
// cylinders and spheres with a handful of cached materials, and each actor owns one Group so the
// renderer only moves transforms in the hot loop.
import * as THREE from 'three';
import { PALETTE } from './config.js';

const carBody = new THREE.BoxGeometry(1.9, 0.62, 4.3);
const carCabin = new THREE.BoxGeometry(1.66, 0.56, 2.15);
const carWheel = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10);
const carLight = new THREE.BoxGeometry(0.42, 0.16, 0.08);
const carBumper = new THREE.BoxGeometry(1.96, 0.18, 0.3);
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.85 });
const glassMat = new THREE.MeshStandardMaterial({ color: 0x1f3a44, roughness: 0.12, metalness: 0.6 });
const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff3cc, emissive: 0xffe7a8, emissiveIntensity: 0.7 });
const tailMat = new THREE.MeshStandardMaterial({ color: 0x7a1c1c, emissive: 0xd8352a, emissiveIntensity: 0.55 });
const trimMat = new THREE.MeshStandardMaterial({ color: 0x2a2c2f, roughness: 0.7 });

const bodyMaterials = new Map();
function bodyMaterial(hex) {
  let mat = bodyMaterials.get(hex);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.42, metalness: 0.35 });
    bodyMaterials.set(hex, mat);
  }
  return mat;
}

export function createCarMesh(colour, police) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(carBody, bodyMaterial(colour));
  body.position.y = 0.62;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(carCabin, police ? bodyMaterial(colour) : glassMat);
  cabin.position.set(0, 1.12, -0.18);
  cabin.castShadow = true;
  group.add(cabin);
  const wheels = [];
  for (let i = 0; i < 4; i += 1) {
    const wheel = new THREE.Mesh(carWheel, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(i % 2 === 0 ? -0.94 : 0.94, 0.34, i < 2 ? -1.38 : 1.38);
    group.add(wheel);
    wheels.push(wheel);
  }
  const bumper = new THREE.Mesh(carBumper, trimMat);
  bumper.position.set(0, 0.38, 2.12);
  group.add(bumper);
  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(carLight, lightMat);
    head.position.set(side * 0.62, 0.66, 2.14);
    group.add(head);
    const tail = new THREE.Mesh(carLight, tailMat);
    tail.position.set(side * 0.62, 0.68, -2.14);
    group.add(tail);
  }
  if (police) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 0.3), new THREE.MeshStandardMaterial({ color: 0x14263d }));
    bar.position.set(0, 1.47, -0.1);
    group.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.26), new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0xff3b30, emissiveIntensity: 1.6 }));
    red.position.set(-0.3, 1.58, -0.1);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.26), new THREE.MeshStandardMaterial({ color: 0x2f7bff, emissive: 0x2f7bff, emissiveIntensity: 1.6 }));
    blue.position.set(0.3, 1.58, -0.1);
    group.add(blue);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.22, 1.1), new THREE.MeshStandardMaterial({ color: 0xe9eef4 }));
    stripe.position.set(0, 0.7, 0.1);
    group.add(stripe);
    group.userData.siren = [red, blue];
  }
  group.userData.wheels = wheels;
  return group;
}

const skinMats = PALETTE.skin.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 }));
const shirtMats = PALETTE.shirt.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }));
const trouserMat = new THREE.MeshStandardMaterial({ color: 0x33404a, roughness: 0.9 });
const copMat = new THREE.MeshStandardMaterial({ color: PALETTE.cop, roughness: 0.7 });
const copVest = new THREE.MeshStandardMaterial({ color: 0x1c2f44, roughness: 0.8 });
const shoeMat = new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.9 });
const capMat = new THREE.MeshStandardMaterial({ color: 0x1b3358, roughness: 0.8 });

const torsoGeom = new THREE.BoxGeometry(0.5, 0.62, 0.28);
const headGeom = new THREE.SphereGeometry(0.145, 10, 8);
const legGeom = new THREE.BoxGeometry(0.17, 0.72, 0.2);
const armGeom = new THREE.BoxGeometry(0.13, 0.56, 0.16);
const capGeom = new THREE.CylinderGeometry(0.16, 0.16, 0.09, 8);
const gunGeom = new THREE.BoxGeometry(0.08, 0.1, 0.34);

export function createPersonMesh(skinIndex, shirtIndex, cop) {
  const group = new THREE.Group();
  const shirt = cop ? copMat : shirtMats[shirtIndex % shirtMats.length];
  const torso = new THREE.Mesh(torsoGeom, shirt);
  torso.position.y = 1.2;
  torso.castShadow = true;
  group.add(torso);
  const vest = cop ? new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.4, 0.32), copVest) : null;
  if (vest) {
    vest.position.y = 1.26;
    group.add(vest);
  }
  const head = new THREE.Mesh(headGeom, skinMats[skinIndex % skinMats.length]);
  head.position.y = 1.66;
  head.castShadow = true;
  group.add(head);
  if (cop) {
    const cap = new THREE.Mesh(capGeom, capMat);
    cap.position.y = 1.78;
    group.add(cap);
  }
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(legGeom, trouserMat);
    leg.position.set(side * 0.12, 0.55, 0);
    leg.castShadow = true;
    group.add(leg);
    legs.push(leg);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.11, 0.3), shoeMat);
    shoe.position.set(side * 0.12, 0.16, 0.04);
    group.add(shoe);
  }
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(armGeom, shirt);
    arm.position.set(side * 0.32, 1.18, 0);
    arm.castShadow = true;
    group.add(arm);
    arms.push(arm);
  }
  const gun = new THREE.Mesh(gunGeom, trimMat);
  gun.position.set(0.34, 1.02, 0.28);
  gun.visible = false;
  group.add(gun);
  group.userData = { legs, arms, gun, vest, cop };
  return group;
}

export function createMarkerMesh() {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(1.7, 1.7, 0.18, 24),
    new THREE.MeshStandardMaterial({ color: PALETTE.marker, emissive: PALETTE.marker, emissiveIntensity: 0.7, transparent: true, opacity: 0.92 }),
  );
  ring.position.y = 0.12;
  group.add(ring);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 1.5, 12, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: PALETTE.marker, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 6;
  group.add(beam);
  group.userData.ring = ring;
  group.userData.beam = beam;
  return group;
}

export function createPlayerMesh() {
  const group = createPersonMesh(0, 0, false);
  const jacket = new THREE.MeshStandardMaterial({ color: PALETTE.playerJacket, roughness: 0.75 });
  group.children[0].material = jacket;
  group.children[0].scale.set(1.06, 1.06, 1.06);
  const gun = new THREE.Mesh(gunGeom, trimMat);
  gun.position.set(0.34, 1.02, 0.3);
  gun.visible = false;
  group.add(gun);
  group.userData.gun = gun;
  return group;
}
