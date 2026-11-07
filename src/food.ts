import * as THREE from 'three';
import { PALETTE, TONES } from './palette';
import { G, group, part, toon } from './toon';
import { createPazhampori, createTeaGlass, createVada } from './models';
import type { RecipeId } from './recipes';

/** Finished-food models and the serving counter where they wait. */

function plate(parent: THREE.Object3D, r = 0.17) {
  part(parent, G.cyl(r, r * 0.82, 0.02, 22), toon(TONES.steel), { pos: [0, 0.01, 0] });
  part(parent, G.torus(r, 0.008, 4, 24), toon(TONES.steelDark), { pos: [0, 0.02, 0], rot: [Math.PI / 2, 0, 0], outline: false });
}

export function createFood(id: RecipeId): THREE.Group {
  const g = new THREE.Group();
  g.name = `food:${id}`;
  switch (id) {
    case 'chaya':
      createTeaGlass(g, [0, 0, 0], 1.35);
      break;
    case 'kattan': {
      part(g, G.cyl(0.067, 0.055, 0.2, 14), toon(TONES.glass, { opacity: 0.42 }), { pos: [0, 0.1, 0], shadow: false });
      part(g, G.cyl(0.059, 0.05, 0.15, 12), toon('#7A3A16'), { pos: [0, 0.076, 0], outline: false });
      break;
    }
    case 'coffee': {
      part(
        g,
        G.lathe('davara', [
          [0, 0],
          [0.07, 0],
          [0.11, 0.03],
          [0.12, 0.06],
        ], 18),
        toon(TONES.steel, { side: THREE.DoubleSide }),
      );
      part(g, G.cyl(0.058, 0.046, 0.17, 16), toon(TONES.steel), { pos: [0, 0.11, 0] });
      part(g, G.cyl(0.052, 0.052, 0.012, 14), toon('#A0683A'), { pos: [0, 0.19, 0], outline: false });
      break;
    }
    case 'pazhampori':
      plate(g);
      createPazhampori(g, [-0.04, 0.05, 0.03], 0.3).scale.multiplyScalar(1.3);
      createPazhampori(g, [0.05, 0.05, -0.05], -0.5).scale.multiplyScalar(1.3);
      break;
    case 'parippuvada':
      plate(g);
      createVada(g, [-0.06, 0.04, 0.03]);
      createVada(g, [0.06, 0.04, 0.04]);
      createVada(g, [0, 0.075, -0.04]).rotation.x = 0.3;
      break;
    case 'puttu': {
      part(g, G.box(0.36, 0.012, 0.24), toon('#4F8F3F'), { pos: [0, 0.006, 0] });
      const log = group(g, [0, 0.075, 0], [0, 0.3, Math.PI / 2]);
      part(log, G.cyl(0.065, 0.065, 0.26, 18), toon(PALETTE.softWhite), {});
      for (const y of [-0.07, 0.0, 0.07]) part(log, G.cyl(0.067, 0.067, 0.022, 18), toon('#E3D6B8'), { pos: [0, y, 0], outline: false });
      const bowl = group(g, [0.15, 0.012, -0.08]);
      part(bowl, G.cyl(0.05, 0.035, 0.04, 14), toon(TONES.steel), { pos: [0, 0.02, 0] });
      part(bowl, G.circle(0.045, 14), toon('#7A3A1E'), { pos: [0, 0.041, 0], rot: [-Math.PI / 2, 0, 0], outline: false });
      break;
    }
    case 'dosa': {
      plate(g, 0.22);
      part(g, G.cyl(0.045, 0.07, 0.38, 16), toon('#D9A250'), { pos: [0, 0.07, 0.02], rot: [0, 0.4, Math.PI / 2] });
      part(g, G.sphere(0.045, 10, 8), toon('#EFE9D0'), { pos: [0.1, 0.03, -0.1], scale: [1, 0.5, 1] });
      part(g, G.sphere(0.04, 10, 8), toon('#D9783A'), { pos: [-0.12, 0.03, -0.1], scale: [1, 0.5, 1] });
      break;
    }
  }
  return g;
}

export interface CounterItem {
  uid: number;
  recipe: RecipeId;
  model: THREE.Group;
  slot: number;
  held: boolean;
  appear: number;
}

let uid = 1;

export class ServingCounter {
  readonly items: (CounterItem | null)[];

  constructor(
    private parent: THREE.Object3D,
    private slots: THREE.Vector3[],
  ) {
    this.items = slots.map(() => null);
  }

  get full(): boolean {
    return this.items.every(Boolean);
  }

  list(): CounterItem[] {
    return this.items.filter((x): x is CounterItem => !!x);
  }

  place(recipe: RecipeId): CounterItem | null {
    const slot = this.items.indexOf(null);
    if (slot < 0) return null;
    const model = createFood(recipe);
    model.position.copy(this.slots[slot]);
    model.scale.setScalar(0.01);
    this.parent.add(model);
    const item: CounterItem = { uid: uid++, recipe, model, slot, held: false, appear: 0 };
    this.items[slot] = item;
    return item;
  }

  /** Remove from the counter (the model stays where it is for animations). */
  take(item: CounterItem) {
    if (this.items[item.slot] === item) this.items[item.slot] = null;
    item.held = false;
  }

  clear() {
    for (const it of this.list()) {
      this.parent.remove(it.model);
      this.items[it.slot] = null;
    }
  }

  update(dt: number, t: number) {
    for (const it of this.list()) {
      it.appear = Math.min(1, it.appear + dt * 4);
      const k = it.appear;
      it.model.scale.setScalar(Math.max(0.01, k < 1 ? 1 + Math.sin(k * Math.PI) * 0.25 * (1 - k) : 1) * k + (1 - k) * 0.01);
      const base = this.slots[it.slot];
      const targetY = it.held ? base.y + 0.16 + Math.sin(t * 4) * 0.02 : base.y;
      it.model.position.y += (targetY - it.model.position.y) * Math.min(1, dt * 12);
      it.model.rotation.y = it.held ? it.model.rotation.y + dt * 1.5 : it.model.rotation.y * 0.9;
    }
  }
}
