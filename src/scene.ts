import * as THREE from 'three';
import { PALETTE } from './palette';
import { skyTexture } from './textures';

/** Renderer, scene, camera, lights and resize handling. */

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
}

export function createStage(container: HTMLElement): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(PALETTE.mist, 22, 110);

  const camera = new THREE.PerspectiveCamera(44, container.clientWidth / container.clientHeight, 0.1, 400);

  // soft overcast monsoon light
  const hemi = new THREE.HemisphereLight('#E6F1EA', '#56684A', 1.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#FFF1DC', 1.5);
  sun.position.set(7, 14, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -11;
  sc.right = 11;
  sc.top = 11;
  sc.bottom = -11;
  sc.near = 1;
  sc.far = 45;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);

  return { renderer, scene, camera, hemi, sun };
}
