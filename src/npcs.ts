import * as THREE from 'three';
import { PALETTE } from './palette';
import { G, group, part, toonUnique } from './toon';
import { CUSTOMER_TYPES, CustomerModel, Look, createCustomerModel } from './customers';
import { createTeaGlass } from './models';
import { newspaperTexture } from './textures';
import { ROAD } from './layout';
import { terrainHeight } from './world';

/** Ambient townsfolk: pedestrians with umbrellas and the shop's regulars. */

const SHIRTS = ['#E8B53E', '#7FA3C2', '#C9603F', '#428B55', '#EDE3CC', '#B0567A', '#5E93B6'];
const UMBRELLAS = ['#27271F', '#3E7FB1', '#DB6846', '#245C3C', '#7A2E3A'];

function randomLook(): Look {
  const base = CUSTOMER_TYPES.filter((t) => t.id !== 'chakka')[Math.floor(Math.random() * 6)].look;
  return {
    ...base,
    shirt: SHIRTS[Math.floor(Math.random() * SHIRTS.length)],
    jacket: Math.random() < 0.2 ? '#3E7FB1' : undefined,
    umbrella: UMBRELLAS[Math.floor(Math.random() * UMBRELLAS.length)],
    backpack: Math.random() < 0.25 ? '#DB6846' : undefined,
    camera: false,
  };
}

function noShadows(o: THREE.Object3D) {
  o.traverse((m) => {
    if ((m as THREE.Mesh).isMesh) m.castShadow = false;
  });
}

// ================================================================ pedestrians

interface Walker {
  model: CustomerModel;
  path: THREE.Vector3[];
  speed: number;
  phase: number;
  far: boolean;
}

export class Walkers {
  private list: Walker[] = [];
  private timer = 2;

  constructor(private scene: THREE.Scene, private max = 4) {}

  /** Someone strolling past – or stepping off the bus at `from`. */
  spawn(from?: THREE.Vector3) {
    if (this.list.length >= this.max + (from ? 2 : 0)) return;
    const model = createCustomerModel(randomLook());
    noShadows(model.root);
    model.setMood(Math.random() < 0.5 ? 'happy' : 'neutral');
    const far = !from && Math.random() < 0.5;
    const z = far ? ROAD.walkFar : ROAD.walkNear;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const start = from ? from.clone() : new THREE.Vector3(-dir * 30, 0, z);
    const path = from
      ? [new THREE.Vector3(from.x + dir * 0.6, 0, ROAD.walkNear), new THREE.Vector3(dir * 30, 0, ROAD.walkNear)]
      : [new THREE.Vector3(dir * 30, 0, z)];
    model.root.position.copy(start);
    if (model.umbrella) model.umbrella.visible = true;
    model.arms[1].rotation.x = -0.75;
    this.scene.add(model.root);
    this.list.push({ model, path, speed: 1.3 + Math.random() * 0.6, phase: Math.random() * 10, far });
  }

  update(dt: number, t: number) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.spawn();
      this.timer = 5 + Math.random() * 7;
    }
    for (const w of this.list) {
      const p = w.model.root.position;
      const target = w.path[0];
      if (!target) continue;
      const to = target.clone().sub(p).setY(0);
      const d = to.length();
      if (d < w.speed * dt) {
        p.copy(target);
        w.path.shift();
      } else {
        p.addScaledVector(to.normalize(), w.speed * dt);
        w.model.root.rotation.y = Math.atan2(to.x, to.z);
      }
      p.y = w.far ? terrainHeight(p.x, p.z) : 0;
      const s = Math.sin(t * 6.5 + w.phase);
      w.model.legs[0].rotation.x = s * 0.45;
      w.model.legs[1].rotation.x = -s * 0.45;
      w.model.arms[0].rotation.x = -s * 0.4;
      w.model.body.position.y = Math.abs(s) * 0.03;
    }
    for (const w of this.list.filter((x) => x.path.length === 0)) this.scene.remove(w.model.root);
    this.list = this.list.filter((x) => x.path.length > 0);
  }
}

// ==================================================================== regulars

interface Regular {
  model: CustomerModel;
  kind: 'reader' | 'sipper';
  paper?: THREE.Group;
  page?: THREE.Group;
  next: number;
  anim: number;
  phase: number;
}

const REGULAR_LOOKS: Look[] = [
  // old Kuttan Pilla with his glasses
  { skin: '#B07A50', shirt: '#EDE3CC', lower: 'pants', lowerColor: '#F6F1E4', hair: 'bald', hairColor: '#D8D4C8', glasses: true, moustache: '#E6E2D6', belly: true, shoes: '#5A311E' },
  // Varghese chettan
  { skin: '#A86E45', shirt: '#7FA3C2', lower: 'pants', lowerColor: '#4A4A44', hair: 'short', hairColor: PALETTE.charcoal, moustache: PALETTE.charcoal, shoes: '#3B2A1E' },
  // the tea sipper
  { skin: '#C68B5C', shirt: '#C9603F', lower: 'pants', lowerColor: '#5A5A50', hair: 'neat', hairColor: PALETTE.charcoal, shoes: '#2A2A26' },
  // a student on the front stool
  { skin: '#C98A5E', shirt: '#E8C341', lower: 'pants', lowerColor: '#3E5C86', hair: 'spiky', hairColor: PALETTE.charcoal, glasses: true, shoes: '#F2F2EC' },
];

let paperTex: THREE.Texture | null = null;

function newspaper(parent: THREE.Object3D): { paper: THREE.Group; page: THREE.Group } {
  if (!paperTex) paperTex = newspaperTexture();
  const mat = toonUnique('#ffffff', { map: paperTex });
  const paper = group(parent, [0, 1.2, 0.36], [0.25, 0, 0]);
  // two-page spread folded slightly toward the reader; printed on both faces
  const left = group(paper, [0, 0, 0], [0, 0.25, 0]);
  const page = group(paper, [0, 0, 0], [0, -0.25, 0]);
  for (const [g, sx] of [
    [left, -1],
    [page, 1],
  ] as [THREE.Group, number][]) {
    part(g, G.plane(0.34, 0.46), mat, { pos: [sx * 0.17, 0, 0.002], outline: false, shadow: false });
    part(g, G.plane(0.34, 0.46), mat, { pos: [sx * 0.17, 0, -0.002], rot: [0, Math.PI, 0], outline: false, shadow: false });
  }
  return { paper, page };
}

/** Seated regulars: newspaper readers and a chaya sipper. */
export class Regulars {
  private list: Regular[] = [];

  constructor(parent: THREE.Object3D, seats: { pos: THREE.Vector3; facing: number; kind: 'reader' | 'sipper'; look: number }[]) {
    for (const s of seats) {
      const model = createCustomerModel(REGULAR_LOOKS[s.look]);
      noShadows(model.root);
      model.setMood(s.kind === 'sipper' ? 'happy' : 'neutral');
      model.root.position.copy(s.pos);
      model.root.rotation.y = s.facing;
      // sit: lower the body onto the seat, legs forward
      model.body.position.y = -0.35;
      for (const l of model.legs) l.rotation.x = -1.25;
      const r: Regular = { model, kind: s.kind, next: 3 + Math.random() * 6, anim: -1, phase: Math.random() * 10 };
      if (s.kind === 'reader') {
        model.arms.forEach((a, i) => a.rotation.set(-1.15, 0, (i === 0 ? 1 : -1) * 0.25));
        const np = newspaper(model.body);
        r.paper = np.paper;
        r.page = np.page;
        model.head.rotation.x = 0.28;
      } else {
        createTeaGlass(model.hand, [0, -0.02, 0], 1);
        model.arms[1].rotation.x = -0.7;
        model.arms[0].rotation.x = -0.3;
      }
      parent.add(model.root);
      this.list.push(r);
    }
  }

  update(dt: number, t: number) {
    for (const r of this.list) {
      const m = r.model;
      m.body.position.y = -0.35 + Math.sin(t * 1.4 + r.phase) * 0.005;
      r.next -= dt;
      if (r.next <= 0 && r.anim < 0) r.anim = 0;
      if (r.anim >= 0) {
        r.anim += dt;
        const k = Math.min(1, r.anim / 1.4);
        const swing = Math.sin(k * Math.PI);
        if (r.kind === 'reader' && r.page) {
          // turn the page over
          r.page.rotation.y = -0.25 + swing * 2.2;
          m.head.rotation.y = swing * 0.2;
        } else {
          // lift the glass for a sip
          m.arms[1].rotation.x = -0.7 - swing * 1.5;
          m.head.rotation.x = -swing * 0.25;
        }
        if (k >= 1) {
          r.anim = -1;
          r.next = 5 + Math.random() * 8;
        }
      } else if (r.kind === 'reader') {
        m.head.rotation.y = Math.sin(t * 0.4 + r.phase) * 0.08;
        r.paper!.rotation.z = Math.sin(t * 0.7 + r.phase) * 0.03;
      }
    }
  }
}
