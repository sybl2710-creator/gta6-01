// A sun-soaked afternoon: gradient dome, warm key light with shadows, a cool sky bounce and a
// pale coastal haze. The sun follows the player so the shadow map stays crisp near the action.
import * as THREE from 'three';
import { PALETTE, RENDER } from './config.js';

const VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = `
uniform vec3 topColor;
uniform vec3 horizonColor;
uniform vec3 sunColor;
uniform vec3 sunDir;
varying vec3 vDir;
void main() {
  float h = clamp(vDir.y * 1.6 + 0.08, 0.0, 1.0);
  vec3 col = mix(horizonColor, topColor, pow(h, 0.72));
  float glow = pow(max(dot(normalize(vDir), normalize(sunDir)), 0.0), 22.0);
  float halo = pow(max(dot(normalize(vDir), normalize(sunDir)), 0.0), 4.0);
  col += sunColor * (glow * 0.9 + halo * 0.16);
  gl_FragColor = vec4(col, 1.0);
}`;

export function createSky(scene) {
  const uniforms = {
    topColor: { value: new THREE.Color(PALETTE.skyTop) },
    horizonColor: { value: new THREE.Color(PALETTE.skyHorizon) },
    sunColor: { value: new THREE.Color(PALETTE.sun) },
    sunDir: { value: new THREE.Vector3(0.45, 0.55, -0.35).normalize() },
  };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(780, 32, 18),
    new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false, fog: false }),
  );
  dome.frustumCulled = false;
  scene.add(dome);

  scene.fog = new THREE.Fog(PALETTE.fog, RENDER.fogNear, RENDER.fogFar);

  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.35);
  sun.position.set(110, 150, -70);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 420;
  sun.shadow.camera.left = -110;
  sun.shadow.camera.right = 110;
  sun.shadow.camera.top = 110;
  sun.shadow.camera.bottom = -110;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  scene.add(sun.target);

  const bounce = new THREE.HemisphereLight(0xbfe0ff, 0xe6c9a2, 1.12);
  scene.add(bounce);

  const rim = new THREE.DirectionalLight(0xffd0a0, 0.5);
  rim.position.set(-80, 60, 120);
  scene.add(rim);

  const focus = new THREE.Vector3();
  return {
    sun,
    uniforms,
    update(x, z) {
      focus.set(x, 0, z);
      sun.position.set(x + 110, 150, z - 70);
      sun.target.position.copy(focus);
      dome.position.set(x, 0, z);
    },
  };
}
