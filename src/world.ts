import * as THREE from 'three';
import { PALETTE, TONES } from './palette';
import { G, addOutline, group, part, rng, toon, toonUnique } from './toon';
import { Mist } from './effects';
import { milestoneTexture } from './textures';

/** Munnar surroundings: tea-garden hillside, road, trees, mountains and mist. */

export interface World {
  update(dt: number, t: number): void;
}

const smooth = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/** Flat shelf for the shop + road, tea hill rising behind, valley in front. */
export function terrainHeight(x: number, z: number): number {
  let h = 0;
  const d = -3.6 - z;
  if (d > 0) {
    // tea slope up to a low ridge, then a misty valley before the mountains
    h += 3.2 * smooth(d / 14) - 2.4 * smooth((d - 19) / 16);
    h += Math.sin(x * 0.11 + 1.3) * 0.9 * smooth(d / 14);
    h += Math.sin(x * 0.27 + z * 0.13) * 0.45 * smooth(d / 10);
  }
  const f = z - 8.6;
  if (f > 0) h -= f * 0.32 + Math.sin(x * 0.15) * 0.4 * smooth(f / 6);
  return h;
}

export function buildWorld(scene: THREE.Scene): World {
  const rand = rng(1234);
  buildTerrain(scene, rand);
  buildTeaRows(scene, rand);
  buildRoad(scene);
  buildMountains(scene, rand);
  buildNature(scene, rand);
  buildRoadside(scene);
  const mist = new Mist(scene);
  return {
    update(_dt, t) {
      mist.update(t);
    },
  };
}

function buildTerrain(scene: THREE.Scene, rand: () => number) {
  const geo = new THREE.PlaneGeometry(200, 160, 120, 96);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -30);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color(TONES.grass);
  const slope = new THREE.Color('#3F6E3F');
  const far = new THREE.Color('#2F5A3C');
  const valley = new THREE.Color('#4E7E45');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, terrainHeight(x, z));
    c.copy(grass);
    if (z < -3.6) c.lerp(slope, smooth((-3.6 - z) / 4));
    if (z < -28) c.lerp(far, smooth((-28 - z) / 20));
    if (z > 8.6) c.lerp(valley, smooth((z - 8.6) / 5));
    c.offsetHSL(0, 0, (rand() - 0.5) * 0.03);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, toonUnique('#ffffff', { vertexColors: true }));
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  scene.add(mesh);
}

/** Contour rows of clipped tea bushes – the Munnar signature. */
function buildTeaRows(scene: THREE.Scene, rand: () => number) {
  const spots: THREE.Matrix4[] = [];
  const tints: THREE.Color[] = [];
  const palette = ['#3F7D45', '#4A8A4A', '#356E3E', '#4F8F48'].map((h) => new THREE.Color(h));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let z = -5.4; z > -27; z -= 1.15) {
    for (let x = -46; x < 46; x += 0.95) {
      // winding footpath through the garden
      if (Math.abs(x - (z * 0.55 + 7)) < 0.9) continue;
      const jx = x + (rand() - 0.5) * 0.25;
      const jz = z + Math.sin(x * 0.2) * 0.25;
      const k = 0.9 + rand() * 0.25;
      p.set(jx, terrainHeight(jx, jz) + 0.2 * k, jz);
      q.setFromEuler(new THREE.Euler(0, rand() * Math.PI, 0));
      s.set(1.05 * k, 0.62 * k, 0.8 * k);
      spots.push(m.clone().compose(p, q, s));
      tints.push(palette[Math.floor(rand() * palette.length)]);
    }
  }
  const mesh = new THREE.InstancedMesh(G.ico(0.5, 1), toonUnique('#ffffff'), spots.length);
  spots.forEach((mat, i) => {
    mesh.setMatrixAt(i, mat);
    mesh.setColorAt(i, tints[i]);
  });
  mesh.receiveShadow = true;
  mesh.name = 'tea-rows';
  scene.add(mesh);
}

function buildRoad(scene: THREE.Scene) {
  const flat = (w: number, d: number, color: string, pos: [number, number, number], opacity = 1) => {
    const mesh = part(scene, G.plane(w, d), toon(color, opacity < 1 ? { opacity } : {}), {
      pos,
      rot: [-Math.PI / 2, 0, 0],
      shadow: false,
      outline: false,
    });
    return mesh;
  };
  // red laterite shoulder + shop yard
  flat(60, 2.6, TONES.soil, [0, 0.012, 3.15]);
  flat(9.2, 6.2, TONES.soil, [0, 0.01, -0.3]);
  // wet asphalt
  flat(140, 3.4, TONES.asphalt, [0, 0.025, 6.0]);
  flat(140, 0.08, '#D9D2BE', [0, 0.03, 4.45]);
  flat(140, 0.08, '#D9D2BE', [0, 0.03, 7.55]);
  const dashes = new THREE.InstancedMesh(G.plane(1.2, 0.1), toon(PALETTE.cream), 46);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 46; i++) {
    m.makeRotationX(-Math.PI / 2).setPosition(-69 + i * 3, 0.032, 6.0);
    dashes.setMatrixAt(i, m);
  }
  dashes.receiveShadow = true;
  scene.add(dashes);
  // puddles
  const puddles: [number, number, number, number][] = [
    [-1.6, 3.5, 0.9, 0.45],
    [3.6, 5.3, 1.2, 0.5],
    [-4.9, 6.5, 1.0, 0.4],
    [1.2, 7.0, 0.8, 0.35],
    [6.2, 3.2, 0.7, 0.4],
  ];
  for (const [x, z, sx, sz] of puddles) {
    part(scene, G.circle(1, 24), toon('#9CC0C8', { opacity: 0.7 }), {
      pos: [x, 0.036, z],
      rot: [-Math.PI / 2, 0, 0],
      scale: [sx, sz, 1],
      shadow: false,
    });
  }
}

function buildMountains(scene: THREE.Scene, rand: () => number) {
  const layers = [
    { r: 50, n: 16, color: '#3E7158', h: [10, 18] },
    { r: 70, n: 18, color: '#6A9583', h: [16, 26] },
    { r: 92, n: 20, color: '#94B8A9', h: [22, 36] },
  ];
  for (const L of layers) {
    for (let i = 0; i < L.n; i++) {
      const a = (i / L.n) * Math.PI * 2 + rand() * 0.25;
      const w = 16 + rand() * 14;
      const h = L.h[0] + rand() * (L.h[1] - L.h[0]);
      const x = Math.sin(a) * L.r;
      const z = Math.cos(a) * L.r;
      part(scene, G.sphere(1, 20, 10, 0, Math.PI / 2), toon(L.color), {
        pos: [x, terrainHeight(x, z) - 3, z],
        scale: [w, h, w * 0.75],
        rot: [0, a, 0],
        shadow: false,
        outline: false,
      });
    }
  }
}

function teaBush(parent: THREE.Object3D, x: number, z: number, rand: () => number) {
  const g = group(parent, [x, terrainHeight(x, z), z]);
  const greens = ['#3F7D45', '#4A8A4A', '#356E3E'];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const r = i === 0 ? 0 : 0.28;
    part(g, G.ico(0.32 + rand() * 0.1, 1), toon(greens[i % 3]), {
      pos: [Math.cos(a) * r, 0.32 + (i === 0 ? 0.12 : 0), Math.sin(a) * r],
      scale: [1, 0.78, 1],
    });
  }
  addOutline(g);
}

function silverOak(parent: THREE.Object3D, x: number, z: number, rand: () => number) {
  const h = 6 + rand() * 3;
  const g = group(parent, [x, terrainHeight(x, z), z]);
  part(g, G.cyl(0.07, 0.14, h, 7), toon('#6B5B4B'), { pos: [0, h / 2, 0] });
  const greens = ['#3C6B4A', '#467656', '#35603F'];
  for (let i = 0; i < 6; i++) {
    const y = h * (0.45 + (i / 6) * 0.55);
    const a = rand() * Math.PI * 2;
    part(g, G.ico(0.5 + rand() * 0.4, 0), toon(greens[i % 3]), {
      pos: [Math.cos(a) * 0.45, y, Math.sin(a) * 0.45],
      scale: [1, 0.75, 1],
    });
  }
}

function bananaPlant(parent: THREE.Object3D, x: number, z: number, rand: () => number) {
  const g = group(parent, [x, terrainHeight(x, z), z], [0, rand() * Math.PI, 0]);
  part(g, G.cyl(0.09, 0.14, 1.7, 10), toon('#7B8F48'), { pos: [0, 0.85, 0] });
  const leaf = [toon('#4F8F3F'), toon('#3F7A38'), toon('#5C9A47')];
  for (let i = 0; i < 7; i++) {
    const holder = group(g, [0, 1.6 + rand() * 0.15, 0], [0, (i / 7) * Math.PI * 2, 0]);
    part(holder, G.sphere(1, 12, 6), leaf[i % 3], {
      pos: [0, 0.18, 0.62],
      rot: [0.45 + rand() * 0.35, 0, 0],
      scale: [0.24, 0.025, 0.72],
    });
  }
  addOutline(g);
}

function buildNature(scene: THREE.Scene, rand: () => number) {
  // the 2–4 tea bushes right beside the shop
  teaBush(scene, -5.1, 3.1, rand);
  teaBush(scene, -6.4, 1.3, rand);
  teaBush(scene, 5.7, 3.4, rand);
  teaBush(scene, 6.2, -0.8, rand);
  bananaPlant(scene, -6.6, -2.2, rand);
  bananaPlant(scene, -7.8, 0.3, rand);
  bananaPlant(scene, 7.6, -2.6, rand);
  const oaks: [number, number][] = [
    [-14, -11],
    [16, -14],
    [24, -7],
    [-26, -6],
    [-6, -23],
  ];
  for (const [x, z] of oaks) silverOak(scene, x, z, rand);
}

function buildRoadside(scene: THREE.Scene) {
  // Kerala milestone
  const stone = group(scene, [-5.3, 0, 4.15], [0, 0.35, 0]);
  part(stone, G.box(0.42, 0.55, 0.16), toon(PALETTE.softWhite), { pos: [0, 0.275, 0] });
  part(stone, G.cyl(0.21, 0.21, 0.16, 16, false, Math.PI / 2, Math.PI), toon(PALETTE.gold), {
    pos: [0, 0.55, 0],
    rot: [Math.PI / 2, 0, 0],
  });
  part(stone, G.plane(0.4, 0.5), toonUnique('#ffffff', { map: milestoneTexture() }), { pos: [0, 0.3, 0.081], outline: false });
  addOutline(stone);

  // electric pole and drooping wires
  const pole = group(scene, [11.5, 0, 4.4]);
  part(pole, G.cyl(0.07, 0.11, 7, 6), toon('#A8A79A'), { pos: [0, 3.5, 0] });
  part(pole, G.box(0.08, 0.08, 1.2), toon('#7A7A70'), { pos: [0, 6.6, 0] });
  for (const z of [-0.5, 0.5]) part(pole, G.cyl(0.03, 0.03, 0.1, 6), toon(PALETTE.softWhite), { pos: [0, 6.7, z] });
  addOutline(pole);
  const wireMat = new THREE.LineBasicMaterial({ color: PALETTE.charcoal });
  for (const dz of [-0.5, 0.5]) {
    for (const dir of [-1, 1]) {
      const a = new THREE.Vector3(11.5, 6.72, 4.4 + dz);
      const b = new THREE.Vector3(11.5 + dir * 45, 6.4, 4.6 + dz);
      const mid = a.clone().lerp(b, 0.5);
      mid.y -= 1.6;
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(30)), wireMat));
    }
  }
}
