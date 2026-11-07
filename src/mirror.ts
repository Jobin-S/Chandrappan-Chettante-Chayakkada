import * as THREE from 'three';
import { CUSTOMER_TYPES, CustomerModel, CustomerType, createCustomerModel } from './customers';
import { createFood } from './food';
import type { CustSnap } from './protocol';
import type { RecipeId } from './recipes';

/** Guests: a customer drawn from the host's snapshots, smoothly interpolated and animated. */
export class CustomerPuppet {
  readonly model: CustomerModel;
  readonly type: CustomerType;
  snap: CustSnap;
  private target = new THREE.Vector3();
  private walkPhase = Math.random() * 10;
  private reacts = 0;
  private anim: { kind: 'happy' | 'angry'; t: number } | null = null;
  private carried: RecipeId | null = null;

  constructor(s: CustSnap) {
    this.type = CUSTOMER_TYPES.find((t) => t.id === s.ty) ?? CUSTOMER_TYPES[0];
    this.model = createCustomerModel(this.type.look);
    this.model.root.position.set(s.x, 0, s.z);
    this.model.root.rotation.y = s.ry;
    this.snap = s;
    this.reacts = s.react;
    this.apply(s);
  }

  get id() {
    return this.snap.id;
  }
  get position() {
    return this.model.root.position;
  }
  get waiting() {
    return this.snap.st === 'waiting';
  }

  apply(s: CustSnap) {
    this.snap = s;
    this.target.set(s.x, 0, s.z);
    this.model.setMood(s.mood);
    if (s.react !== this.reacts) {
      this.reacts = s.react;
      this.anim = { kind: s.mood === 'angry' ? 'angry' : 'happy', t: 0 };
    }
    if (s.c && s.c !== this.carried) {
      this.carried = s.c;
      const food = createFood(s.c);
      food.position.set(0, -0.05, 0.05);
      food.scale.setScalar(0.9);
      this.model.hand.add(food);
    }
  }

  update(dt: number, t: number) {
    const m = this.model;
    const p = m.root.position;
    const before = p.clone();
    p.lerp(this.target, Math.min(1, dt * 8));
    const moved = before.distanceTo(p) / Math.max(dt, 1e-3);
    const walking = moved > 0.4;
    // smooth turn toward the host's facing
    const diff = Math.atan2(Math.sin(this.snap.ry - m.root.rotation.y), Math.cos(this.snap.ry - m.root.rotation.y));
    m.root.rotation.y += diff * Math.min(1, dt * 8);

    const swing = walking ? Math.sin(t * 9 + this.walkPhase) * 0.55 : 0;
    m.legs[0].rotation.x = swing;
    m.legs[1].rotation.x = -swing;
    if (!m.holdsWithBothArms) {
      const umbrellaOut = !!m.umbrella && p.z > 3.05;
      m.arms[0].rotation.x = -swing * 0.7;
      m.arms[1].rotation.x = umbrellaOut ? -0.75 : swing * 0.7;
      if (m.umbrella) m.umbrella.visible = umbrellaOut;
    }
    m.body.position.y = walking ? Math.abs(Math.sin(t * 9 + this.walkPhase)) * 0.045 : Math.sin(t * 2 + this.walkPhase) * 0.008;
    m.head.rotation.y = walking ? 0 : Math.sin(t * 0.6 + this.walkPhase) * 0.25;
    if (this.anim) {
      this.anim.t += dt;
      const k = this.anim.t;
      if (this.anim.kind === 'happy') m.body.position.y += Math.abs(Math.sin(k * 11)) * 0.16 * Math.max(0, 1 - k / 1.1);
      else m.head.rotation.y = Math.sin(k * 22) * 0.35 * Math.max(0, 1 - k / 0.9);
      if (k > 1.2) this.anim = null;
    }
  }
}
