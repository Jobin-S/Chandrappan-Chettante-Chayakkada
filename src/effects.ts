import * as THREE from 'three';
import { softTexture } from './textures';
import { rng } from './toon';

/** Lightweight ambient effects: steam, rain, drifting mist and glows. */

export function glowSprite(color: THREE.ColorRepresentation, size: number, opacity = 0.8): THREE.Sprite {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: softTexture(),
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  sprite.scale.setScalar(size);
  return sprite;
}

interface Puff {
  sprite: THREE.Sprite;
  age: number;
  life: number;
  dx: number;
  dz: number;
}

export interface SteamOptions {
  count?: number;
  rise?: number;
  size?: number;
  opacity?: number;
  life?: number;
}

/** A looping column of soft sprites rising from a local origin. */
export class Steam {
  /** Multiplier for size/opacity/rise – raised while a station is cooking. */
  intensity = 1;
  private puffs: Puff[] = [];
  private readonly rise: number;
  private readonly size: number;
  private readonly opacity: number;

  constructor(parent: THREE.Object3D, private origin: THREE.Vector3, o: SteamOptions = {}) {
    const count = o.count ?? 7;
    const life = o.life ?? 2.4;
    this.rise = o.rise ?? 0.6;
    this.size = o.size ?? 0.22;
    this.opacity = o.opacity ?? 0.5;
    const rand = rng(Math.floor(origin.x * 1000 + origin.z * 77));
    for (let i = 0; i < count; i++) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: softTexture(), color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }),
      );
      sprite.raycast = () => {};
      parent.add(sprite);
      this.puffs.push({ sprite, age: (i / count) * life, life, dx: (rand() - 0.5) * 0.2, dz: (rand() - 0.5) * 0.2 });
    }
  }

  update(dt: number, t: number) {
    for (const p of this.puffs) {
      p.age += dt;
      if (p.age > p.life) p.age -= p.life;
      const k = p.age / p.life;
      p.sprite.position.set(
        this.origin.x + p.dx * k + Math.sin(t * 2 + p.dz * 30) * 0.03 * k,
        this.origin.y + k * this.rise * (0.6 + this.intensity * 0.4),
        this.origin.z + p.dz * k,
      );
      p.sprite.scale.setScalar(this.size * (0.5 + k * 1.5) * (0.7 + this.intensity * 0.3));
      (p.sprite.material as THREE.SpriteMaterial).opacity = Math.min(0.9, Math.sin(k * Math.PI) * this.opacity * this.intensity);
    }
  }
}

/** Light rain as line streaks; drops never spawn under the shop roof. */
export class Rain {
  readonly lines: THREE.LineSegments;
  private positions: Float32Array;
  private speeds: Float32Array;
  private rand = rng(42);
  private readonly len = 0.34;
  private wind = -0.12;
  private active = 1600;
  private speedMul = 1;

  constructor(
    scene: THREE.Scene,
    private count = 3600,
    private area = { x: 24, zMin: -14, zMax: 20, top: 14 },
    public shelter = { x0: -3.9, x1: 3.9, z0: -2.9, z1: 3.1 },
  ) {
    this.positions = new Float32Array(count * 6);
    this.speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) this.spawn(i, this.rand() * area.top);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: '#CFE2E6', transparent: true, opacity: 0.42, depthWrite: false }),
    );
    this.lines.frustumCulled = false;
    this.lines.raycast = () => {};
    geo.setDrawRange(0, this.active * 2);
    scene.add(this.lines);
  }

  /** Heavy monsoon: more, faster, more slanted drops. */
  setHeavy(heavy: boolean) {
    this.active = heavy ? this.count : 1600;
    this.speedMul = heavy ? 1.35 : 1;
    this.wind = heavy ? -0.6 : -0.12;
    this.lines.geometry.setDrawRange(0, this.active * 2);
    (this.lines.material as THREE.LineBasicMaterial).opacity = heavy ? 0.55 : 0.42;
  }

  private spawn(i: number, y: number) {
    let x = 0;
    let z = 0;
    do {
      x = (this.rand() * 2 - 1) * this.area.x;
      z = this.area.zMin + this.rand() * (this.area.zMax - this.area.zMin);
    } while (x > this.shelter.x0 && x < this.shelter.x1 && z > this.shelter.z0 && z < this.shelter.z1);
    this.speeds[i] = 9 + this.rand() * 4;
    this.write(i, x, y, z);
  }

  private write(i: number, x: number, y: number, z: number) {
    const o = i * 6;
    this.positions[o] = x;
    this.positions[o + 1] = y;
    this.positions[o + 2] = z;
    this.positions[o + 3] = x - this.wind * this.len;
    this.positions[o + 4] = y - this.len;
    this.positions[o + 5] = z;
  }

  update(dt: number) {
    for (let i = 0; i < this.active; i++) {
      const o = i * 6;
      const y = this.positions[o + 1] - this.speeds[i] * this.speedMul * dt;
      if (y < 0) this.spawn(i, this.area.top + this.rand() * 2);
      else this.write(i, this.positions[o] + this.wind * dt, y, this.positions[o + 2]);
    }
    (this.lines.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}

/** Big soft billboards drifting through the valleys. */
export class Mist {
  private items: { sprite: THREE.Sprite; base: THREE.Vector3; speed: number; phase: number }[] = [];

  constructor(scene: THREE.Scene) {
    const rand = rng(7);
    const add = (pos: THREE.Vector3, w: number, h: number, opacity: number) => {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: softTexture(), color: '#EEF5F0', transparent: true, opacity, depthWrite: false }),
      );
      sprite.scale.set(w, h, 1);
      sprite.position.copy(pos);
      sprite.raycast = () => {};
      scene.add(sprite);
      this.items.push({ sprite, base: pos.clone(), speed: 0.2 + rand() * 0.3, phase: rand() * 10 });
    };
    // far valley ring
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + rand() * 0.3;
      const r = 38 + rand() * 26;
      add(new THREE.Vector3(Math.sin(a) * r, 4 + rand() * 9, Math.cos(a) * r), 46 + rand() * 20, 9 + rand() * 5, 0.38 + rand() * 0.2);
    }
    // low mist hugging the tea-garden hill
    for (let i = 0; i < 7; i++) {
      add(new THREE.Vector3(-30 + i * 10 + rand() * 4, 5 + rand() * 3, -18 - rand() * 14), 26, 5, 0.32);
    }
  }

  update(t: number) {
    for (const m of this.items) {
      m.sprite.position.x = m.base.x + Math.sin(t * 0.05 * m.speed + m.phase) * 6;
      m.sprite.position.y = m.base.y + Math.sin(t * 0.1 + m.phase) * 0.4;
    }
  }
}
