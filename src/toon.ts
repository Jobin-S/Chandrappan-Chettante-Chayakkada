import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE } from './palette';

/**
 * Reusable procedural-modelling toolkit: cached toon materials, cached
 * geometries, a `part()` placement helper and inverted-hull outlines.
 */

export type V3 = [number, number, number];

// ---------------------------------------------------------------- materials

let gradient: THREE.DataTexture | null = null;
/** Four hard light bands give the hand-illustrated cel look. */
export function toonGradient(): THREE.DataTexture {
  if (!gradient) {
    const data = new Uint8Array([110, 170, 220, 255]);
    gradient = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
    gradient.minFilter = THREE.NearestFilter;
    gradient.magFilter = THREE.NearestFilter;
    gradient.generateMipmaps = false;
    gradient.needsUpdate = true;
  }
  return gradient;
}

export interface ToonOptions {
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
  side?: THREE.Side;
  vertexColors?: boolean;
  map?: THREE.Texture | null;
}

/** A fresh (unshared) toon material – use when it will be recoloured later. */
export function toonUnique(color: THREE.ColorRepresentation, o: ToonOptions = {}): THREE.MeshToonMaterial {
  const opacity = o.opacity ?? 1;
  const mat = new THREE.MeshToonMaterial({
    color,
    gradientMap: toonGradient(),
    emissive: o.emissive ?? 0x000000,
    emissiveIntensity: o.emissiveIntensity ?? 1,
    side: o.side ?? THREE.FrontSide,
    vertexColors: o.vertexColors ?? false,
    map: o.map ?? null,
    transparent: opacity < 1,
    opacity,
  });
  if (opacity < 1) mat.depthWrite = false;
  return mat;
}

const materialCache = new Map<string, THREE.MeshToonMaterial>();
/** Shared toon material, cached by colour + options. */
export function toon(color: THREE.ColorRepresentation, o: ToonOptions = {}): THREE.MeshToonMaterial {
  const key = [
    new THREE.Color(color).getHexString(),
    o.emissive ?? '',
    o.emissiveIntensity ?? '',
    o.opacity ?? '',
    o.side ?? '',
    o.vertexColors ?? '',
    o.map?.uuid ?? '',
  ].join('|');
  let mat = materialCache.get(key);
  if (!mat) {
    mat = toonUnique(color, o);
    materialCache.set(key, mat);
  }
  return mat;
}

// --------------------------------------------------------------- geometries

const geoCache = new Map<string, THREE.BufferGeometry>();
function cached<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key) as T | undefined;
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

export const G = {
  box: (w: number, h: number, d: number) => cached(`box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d)),
  cyl: (rt: number, rb: number, h: number, seg = 16, open = false, thetaStart = 0, thetaLength = Math.PI * 2) =>
    cached(`cyl:${rt}:${rb}:${h}:${seg}:${open}:${thetaStart}:${thetaLength}`, () =>
      new THREE.CylinderGeometry(rt, rb, h, seg, 1, open, thetaStart, thetaLength),
    ),
  sphere: (r: number, ws = 16, hs = 12, thetaStart = 0, thetaLength = Math.PI) =>
    cached(`sph:${r}:${ws}:${hs}:${thetaStart}:${thetaLength}`, () =>
      new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, thetaStart, thetaLength),
    ),
  cone: (r: number, h: number, seg = 16) => cached(`cone:${r}:${h}:${seg}`, () => new THREE.ConeGeometry(r, h, seg)),
  torus: (r: number, tube: number, rs = 8, ts = 24, arc = Math.PI * 2) =>
    cached(`tor:${r}:${tube}:${rs}:${ts}:${arc}`, () => new THREE.TorusGeometry(r, tube, rs, ts, arc)),
  capsule: (r: number, len: number, cs = 6, rs = 14) =>
    cached(`cap:${r}:${len}:${cs}:${rs}`, () => new THREE.CapsuleGeometry(r, len, cs, rs)),
  ico: (r: number, detail = 1) => cached(`ico:${r}:${detail}`, () => new THREE.IcosahedronGeometry(r, detail)),
  circle: (r: number, seg = 24) => cached(`circ:${r}:${seg}`, () => new THREE.CircleGeometry(r, seg)),
  plane: (w: number, h: number) => cached(`plane:${w}:${h}`, () => new THREE.PlaneGeometry(w, h)),
  /** Lathe from [radius, height] pairs; `name` keys the cache. */
  lathe: (name: string, pts: number[][], seg = 24) =>
    cached(`lathe:${name}:${seg}`, () => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg)),
};

// ------------------------------------------------------------------ helpers

export interface PartOptions {
  pos?: V3;
  rot?: V3;
  scale?: number | V3;
  shadow?: boolean;
  outline?: boolean;
  name?: string;
}

/** Create a mesh, place it and attach it to `parent`. */
export function part(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material | THREE.Material[],
  o: PartOptions = {},
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  if (o.pos) mesh.position.set(o.pos[0], o.pos[1], o.pos[2]);
  if (o.rot) mesh.rotation.set(o.rot[0], o.rot[1], o.rot[2]);
  if (o.scale !== undefined) {
    if (typeof o.scale === 'number') mesh.scale.setScalar(o.scale);
    else mesh.scale.set(o.scale[0], o.scale[1], o.scale[2]);
  }
  mesh.castShadow = o.shadow ?? true;
  mesh.receiveShadow = true;
  if (o.outline === false) mesh.userData.noOutline = true;
  if (o.name) mesh.name = o.name;
  parent.add(mesh);
  return mesh;
}

export function group(parent: THREE.Object3D, pos?: V3, rot?: V3, name?: string): THREE.Group {
  const g = new THREE.Group();
  if (pos) g.position.set(pos[0], pos[1], pos[2]);
  if (rot) g.rotation.set(rot[0], rot[1], rot[2]);
  if (name) g.name = name;
  parent.add(g);
  return g;
}

const UP = new THREE.Vector3(0, 1, 0);
/** A capsule stretched between two points – arms, braces, moustaches. */
export function limb(parent: THREE.Object3D, a: V3, b: V3, radius: number, material: THREE.Material): THREE.Mesh {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const dir = vb.clone().sub(va);
  const len = Math.max(0.001, Math.round(dir.length() * 1000) / 1000);
  const mesh = new THREE.Mesh(G.capsule(radius, len, 4, 10), material);
  mesh.position.copy(va).add(vb).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// ----------------------------------------------------------------- outlines

export const OUTLINE = { base: 0.016, hover: 0.028, selected: 0.036 };

/** Inverted-hull outline, extruded in view space so scaled parts stay even. */
export function createOutlineMaterial(color: THREE.ColorRepresentation = PALETTE.charcoal, thickness = OUTLINE.base) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uThickness: { value: thickness },
    },
    vertexShader: /* glsl */ `
      uniform float uThickness;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        mv.xyz += n * uThickness;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      void main() {
        gl_FragColor = vec4(uColor, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
  });
}

const sharedOutline = createOutlineMaterial();
const outlineGeoCache = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();

/** Weld vertices and smooth normals so hard-edged boxes get a closed hull. */
function outlineGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
  let g = outlineGeoCache.get(source);
  if (!g) {
    const clone = new THREE.BufferGeometry();
    clone.setAttribute('position', source.getAttribute('position'));
    if (source.index) clone.setIndex(source.index);
    g = mergeVertices(clone, 1e-3);
    g.computeVertexNormals();
    outlineGeoCache.set(source, g);
  }
  return g;
}

/** Add charcoal outlines to every opaque mesh under `root`. */
export function addOutline(root: THREE.Object3D, material: THREE.Material = sharedOutline, force = false): THREE.Mesh[] {
  const targets: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh) return;
    if (m.userData.isOutline || m.userData.hasOutline || (m.userData.noOutline && !force)) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    if (mats.some((x) => x.transparent || (x as THREE.MeshBasicMaterial).isMeshBasicMaterial)) return;
    targets.push(m);
  });
  return targets.map((m) => {
    const hull = new THREE.Mesh(outlineGeometry(m.geometry), material);
    hull.userData.isOutline = true;
    hull.castShadow = false;
    hull.receiveShadow = false;
    hull.raycast = () => {};
    m.userData.hasOutline = true;
    m.add(hull);
    return hull;
  });
}

// --------------------------------------------------------------------- misc

/** Small deterministic PRNG so the hand-made variation is stable per load. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
