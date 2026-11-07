import * as THREE from 'three';
import { PALETTE, TONES } from './palette';
import { G, addOutline, group, limb, part, toon, toonUnique } from './toon';
import { destinationTexture } from './textures';
import { BUS_STOP, ROAD } from './layout';

/**
 * Road traffic: cars, autorickshaws, scooters, estate jeeps and a red-and-cream
 * state bus. Vehicles keep left, follow each other at a safe gap, and the
 * eastbound bus pulls in at the stop beside the shop to drop passengers.
 */

type Kind = 'car' | 'auto' | 'scooter' | 'jeep' | 'bus';

interface Vehicle {
  kind: Kind;
  root: THREE.Group;
  wheels: { g: THREE.Group; r: number }[];
  length: number;
  dir: 1 | -1;
  laneZ: number;
  speed: number;
  maxSpeed: number;
  bus?: { state: 'driving' | 'stopping' | 'stopped' | 'leaving'; wait: number; stops: boolean };
}

const END = 68;
const PI = Math.PI;

function wheel(parent: THREE.Object3D, x: number, z: number, r: number, w = 0.22) {
  const g = group(parent, [x, r, z]);
  part(g, G.cyl(r, r, w, 14), toon('#1E1E1A'), { rot: [PI / 2, 0, 0] });
  part(g, G.cyl(r * 0.55, r * 0.55, w + 0.02, 10), toon(TONES.steel), { rot: [PI / 2, 0, 0], outline: false });
  part(g, G.box(r * 1.1, 0.04, w + 0.03), toon(TONES.steelDark), { outline: false });
  return { g, r };
}

function lights(parent: THREE.Object3D, frontX: number, backX: number, y: number, halfW: number) {
  const head = new THREE.MeshBasicMaterial({ color: '#FFF6D8' });
  const tail = new THREE.MeshBasicMaterial({ color: '#E0452E' });
  for (const s of [-1, 1]) {
    part(parent, G.box(0.05, 0.12, 0.22), head, { pos: [frontX, y, s * halfW], shadow: false });
    part(parent, G.box(0.05, 0.1, 0.18), tail, { pos: [backX, y, s * halfW], shadow: false });
  }
}

const glass = () => toon('#3B4D57');

function buildCar(): Vehicle {
  const root = new THREE.Group();
  const colors = ['#F2EFE6', '#B9C2C1', PALETTE.terracotta, '#3E7FB1', '#2E2E2A', '#C9A13E'];
  const paint = toon(colors[Math.floor(Math.random() * colors.length)]);
  part(root, G.box(3.6, 0.55, 1.6), paint, { pos: [0, 0.6, 0] });
  part(root, G.box(2.0, 0.55, 1.45), paint, { pos: [-0.25, 1.15, 0] });
  part(root, G.box(1.85, 0.4, 1.47), glass(), { pos: [-0.25, 1.17, 0], outline: false });
  part(root, G.box(0.06, 0.42, 1.3), glass(), { pos: [0.78, 1.15, 0], rot: [0, 0, 0.5], outline: false });
  lights(root, 1.81, -1.81, 0.68, 0.6);
  const wheels = [-1.15, 1.15].flatMap((x) => [-0.72, 0.72].map((z) => wheel(root, x, z, 0.32)));
  return { kind: 'car', root, wheels, length: 3.6, dir: 1, laneZ: 0, speed: 0, maxSpeed: 9 + Math.random() * 3 };
}

function buildAuto(): Vehicle {
  const root = new THREE.Group();
  const yellow = toon('#E8C341');
  const black = toon(PALETTE.charcoal);
  part(root, G.box(1.5, 0.65, 1.3), yellow, { pos: [-0.35, 0.65, 0] });
  part(root, G.box(0.9, 0.55, 0.9), yellow, { pos: [0.75, 0.6, 0] });
  part(root, G.box(2.3, 0.08, 1.38), black, { pos: [-0.05, 1.72, 0] });
  part(root, G.sphere(0.7, 14, 8, 0, PI / 2), black, { pos: [-0.05, 1.7, 0], scale: [1.6, 0.25, 1] });
  for (const z of [-0.6, 0.6]) part(root, G.box(0.06, 0.8, 0.06), black, { pos: [0.55, 1.3, z] });
  part(root, G.box(0.06, 0.55, 1.1), glass(), { pos: [0.95, 1.25, 0], outline: false });
  // driver
  part(root, G.capsule(0.2, 0.25, 4, 10), toon('#B8A06A'), { pos: [0.2, 1.1, 0] });
  part(root, G.sphere(0.17, 12, 10), toon('#A86E45'), { pos: [0.2, 1.52, 0] });
  lights(root, 1.21, -1.11, 0.75, 0.35);
  const wheels = [wheel(root, 0.95, 0, 0.25, 0.16), wheel(root, -0.7, -0.62, 0.27, 0.18), wheel(root, -0.7, 0.62, 0.27, 0.18)];
  return { kind: 'auto', root, wheels, length: 2.5, dir: 1, laneZ: 0, speed: 0, maxSpeed: 6.5 + Math.random() * 2 };
}

function buildScooter(): Vehicle {
  const root = new THREE.Group();
  const colors = ['#C9423A', '#3E7FB1', '#F2EFE6', PALETTE.leaf];
  const paint = toon(colors[Math.floor(Math.random() * colors.length)]);
  part(root, G.box(1.1, 0.18, 0.36), paint, { pos: [0, 0.42, 0] });
  part(root, G.box(0.6, 0.35, 0.4), paint, { pos: [-0.35, 0.65, 0] });
  part(root, G.box(0.2, 0.75, 0.42), paint, { pos: [0.55, 0.75, 0], rot: [0, 0, -0.25] });
  limb(root, [0.62, 1.05, -0.3], [0.62, 1.05, 0.3], 0.025, toon(PALETTE.charcoal));
  // rider in a raincoat with a helmet
  const coat = toon(['#E8C341', '#DB6846', '#3E7FB1', '#428B55'][Math.floor(Math.random() * 4)]);
  part(root, G.capsule(0.21, 0.3, 4, 10), coat, { pos: [-0.25, 1.25, 0], rot: [0, 0, -0.15] });
  part(root, G.sphere(0.2, 12, 10), toon(['#27271F', '#F2EFE6', '#C9423A'][Math.floor(Math.random() * 3)]), { pos: [-0.18, 1.75, 0] });
  for (const z of [-0.2, 0.2]) {
    limb(root, [-0.15, 1.45, z], [0.58, 1.08, z * 1.4], 0.06, coat);
    limb(root, [-0.3, 0.9, z], [0.15, 0.55, z * 1.2], 0.07, toon('#3A3D46'));
  }
  lights(root, 0.68, -0.7, 0.8, 0.08);
  const wheels = [wheel(root, 0.55, 0, 0.25, 0.12), wheel(root, -0.55, 0, 0.25, 0.12)];
  return { kind: 'scooter', root, wheels, length: 1.8, dir: 1, laneZ: 0, speed: 0, maxSpeed: 8 + Math.random() * 3 };
}

function buildJeep(): Vehicle {
  const root = new THREE.Group();
  const paint = toon(Math.random() < 0.5 ? '#F2EFE6' : '#3F6E4A');
  part(root, G.box(3.6, 0.75, 1.65), paint, { pos: [0, 0.75, 0] });
  part(root, G.box(1.0, 0.25, 1.6), paint, { pos: [1.3, 1.2, 0] });
  part(root, G.box(2.2, 0.85, 1.7), toon('#C9B98A'), { pos: [-0.65, 1.55, 0] });
  part(root, G.box(0.06, 0.6, 1.5), glass(), { pos: [0.55, 1.5, 0], outline: false });
  part(root, G.cyl(0.33, 0.33, 0.2, 14), toon('#1E1E1A'), { pos: [-1.88, 1.0, 0], rot: [0, 0, PI / 2] });
  lights(root, 1.81, -1.81, 0.95, 0.62);
  const wheels = [-1.15, 1.2].flatMap((x) => [-0.75, 0.75].map((z) => wheel(root, x, z, 0.38, 0.26)));
  return { kind: 'jeep', root, wheels, length: 3.8, dir: 1, laneZ: 0, speed: 0, maxSpeed: 8 + Math.random() * 2 };
}

let destTex: THREE.Texture | null = null;

function buildBus(): Vehicle {
  const root = new THREE.Group();
  const red = toon('#B8342A');
  const cream = toon('#F2E3C2');
  const L = 9;
  part(root, G.box(L, 1.0, 2.2), red, { pos: [0, 0.95, 0] });
  part(root, G.box(L, 0.95, 2.18), cream, { pos: [0, 1.92, 0] });
  part(root, G.box(L + 0.02, 0.12, 2.22), toon(PALETTE.gold), { pos: [0, 1.48, 0], outline: false });
  part(root, G.box(L - 0.3, 0.2, 2.1), cream, { pos: [0, 2.48, 0] });
  // windows with a few passengers inside
  part(root, G.box(L - 1.6, 0.62, 2.24), glass(), { pos: [-0.35, 1.98, 0], outline: false });
  for (let i = 0; i < 7; i++) part(root, G.box(0.08, 0.64, 2.25), cream, { pos: [-3.8 + i * 1.07, 1.98, 0], outline: false });
  const skin = ['#B07A50', '#C98A5E', '#A86E45'];
  for (let i = 0; i < 6; i++) {
    const x = -3.4 + i * 1.15;
    const z = i % 2 ? -0.75 : 0.75;
    part(root, G.sphere(0.17, 10, 8), toon(skin[i % 3]), { pos: [x, 1.98, z], outline: false });
  }
  // front: windscreen, destination board, bumper, door
  part(root, G.box(0.08, 0.95, 1.9), glass(), { pos: [L / 2 + 0.01, 1.85, 0], outline: false });
  if (!destTex) destTex = destinationTexture('MUNNAR', 'മൂന്നാർ');
  part(root, G.box(0.06, 0.26, 1.7), toonUnique('#ffffff', { map: destTex }), { pos: [L / 2 + 0.03, 2.48, 0], outline: false });
  part(root, G.box(0.2, 0.25, 2.25), toon(PALETTE.charcoal), { pos: [L / 2 + 0.05, 0.5, 0] });
  part(root, G.box(0.9, 1.6, 0.04), toon('#7C2620'), { pos: [L / 2 - 1.6, 1.25, -1.11], outline: false });
  lights(root, L / 2 + 0.03, -L / 2 - 0.03, 0.9, 0.85);
  const wheels = [-3.0, -2.0, 2.9].flatMap((x) => [-0.95, 0.95].map((z) => wheel(root, x, z, 0.5, 0.3)));
  return {
    kind: 'bus',
    root,
    wheels,
    length: L,
    dir: 1,
    laneZ: 0,
    speed: 0,
    maxSpeed: 7.5 + Math.random() * 1.5,
    bus: { state: 'driving', wait: 0, stops: false },
  };
}

const BUILDERS: Record<Kind, () => Vehicle> = { car: buildCar, auto: buildAuto, scooter: buildScooter, jeep: buildJeep, bus: buildBus };

/** Bus centre when stopped so its front door lines up with the shelter. */
const BUS_STOP_X = BUS_STOP.x - 2.9;
const BUS_WAIT = 6;

export class Traffic {
  vehicles: Vehicle[] = [];
  /** Called once each time the bus opens its door at the stop. */
  onBusStop: (door: THREE.Vector3) => void = () => {};
  onHorn: () => void = () => {};
  /** Multiplayer: the host announces buses so guests see the same one. */
  onBusSpawn: (dir: 1 | -1, x: number) => void = () => {};
  /** Guests turn this off and spawn buses when the host says so. */
  autoBus = true;

  private timers = [1, 3];
  private busTimer = 8;

  constructor(private scene: THREE.Scene) {
    // start with a little traffic already on the road
    for (const [kind, x, dir] of [
      ['car', -20, 1],
      ['auto', 25, -1],
      ['scooter', 8, 1],
    ] as [Kind, number, 1 | -1][])
      this.spawn(kind, dir, x);
  }

  private spawn(kind: Kind, dir: 1 | -1, x = -dir * END): Vehicle {
    const v = BUILDERS[kind]();
    v.dir = dir;
    v.laneZ = dir === 1 ? ROAD.laneEast : ROAD.laneWest;
    v.speed = v.maxSpeed;
    v.root.position.set(x, 0, v.laneZ);
    v.root.rotation.y = dir === 1 ? 0 : PI;
    addOutline(v.root);
    if (v.bus) v.bus.stops = dir === 1;
    this.scene.add(v.root);
    this.vehicles.push(v);
    return v;
  }

  /** Guests: mirror the host's bus. */
  spawnBus(dir: 1 | -1, x: number) {
    this.spawn('bus', dir, x);
  }

  private laneClear(dir: 1 | -1): boolean {
    const startX = -dir * END;
    return !this.vehicles.some((v) => v.dir === dir && Math.abs(v.root.position.x - startX) < 12);
  }

  private randomKind(): Kind {
    const r = Math.random();
    return r < 0.36 ? 'car' : r < 0.6 ? 'auto' : r < 0.85 ? 'scooter' : 'jeep';
  }

  update(dt: number) {
    // spawning
    for (const lane of [0, 1]) {
      this.timers[lane] -= dt;
      const dir = lane === 0 ? 1 : -1;
      if (this.timers[lane] <= 0 && this.laneClear(dir)) {
        this.spawn(this.randomKind(), dir);
        this.timers[lane] = 4 + Math.random() * 6;
      }
    }
    this.busTimer -= dt;
    if (this.busTimer <= 0 && this.autoBus) {
      const dir: 1 | -1 = Math.random() < 0.7 ? 1 : -1;
      if (this.laneClear(dir)) {
        const bus = this.spawn('bus', dir);
        this.onBusSpawn(dir, bus.root.position.x);
        this.busTimer = 35 + Math.random() * 20;
      } else this.busTimer = 2;
    }

    for (const v of this.vehicles) {
      const x = v.root.position.x;
      // follow the vehicle ahead at a safe gap
      let gap = Infinity;
      for (const o of this.vehicles) {
        if (o === v || o.dir !== v.dir) continue;
        const d = (o.root.position.x - x) * v.dir;
        if (d > 0) gap = Math.min(gap, d - (o.length + v.length) / 2);
      }
      let desired = Math.min(v.maxSpeed, Math.max(0, (gap - 2.5) * 1.6));

      if (v.bus && v.bus.stops) {
        const b = v.bus;
        const toStop = (BUS_STOP_X - x) * v.dir;
        if (b.state === 'driving' && toStop > 0 && toStop < 26) b.state = 'stopping';
        if (b.state === 'stopping') {
          desired = Math.min(desired, Math.sqrt(Math.max(0, 2 * 2.2 * toStop)));
          if (toStop < 0.08) {
            v.root.position.x = BUS_STOP_X;
            v.speed = 0;
            b.state = 'stopped';
            b.wait = BUS_WAIT;
            this.onBusStop(new THREE.Vector3(BUS_STOP_X + 2.9, 0, v.laneZ - 1.25));
          }
        }
        if (b.state === 'stopped') {
          desired = 0;
          b.wait -= dt;
          if (b.wait <= 0) {
            b.state = 'leaving';
            this.onHorn();
          }
        }
      }

      const accel = desired > v.speed ? 3 : 9;
      v.speed += THREE.MathUtils.clamp(desired - v.speed, -accel * dt, accel * dt);
      v.root.position.x += v.speed * v.dir * dt;
      for (const w of v.wheels) w.g.rotation.z -= (v.speed * dt) / w.r;
      // a gentle sway for the small ones
      if (v.kind === 'scooter' || v.kind === 'auto') v.root.position.y = Math.sin(x * 1.3) * 0.015;
    }

    for (const v of this.vehicles.filter((o) => o.root.position.x * o.dir > END + 4)) this.scene.remove(v.root);
    this.vehicles = this.vehicles.filter((o) => o.root.position.x * o.dir <= END + 4);
  }
}
