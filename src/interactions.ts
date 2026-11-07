import * as THREE from 'three';
import { PALETTE } from './palette';
import { G, OUTLINE, addOutline, createOutlineMaterial } from './toon';
import { glowSprite } from './effects';

/**
 * Raycaster picking for everything clickable in the 3D world: cooking
 * stations, finished food on the counter and customers. Drags (camera
 * orbit/pan) never count as clicks; HUD elements sit above the canvas so
 * their events never reach here.
 */

export type PickKind = 'station' | 'item' | 'customer';
export type Mark = 'selected' | 'target';

export interface Pickable {
  kind: PickKind;
  key: string;
  root: THREE.Object3D;
  ringRadius?: number;
}

export interface PickerEvents {
  onHover(p: Pickable | null, clientX: number, clientY: number): void;
  onClick(p: Pickable | null): void;
}

interface Entry {
  p: Pickable;
  mat: THREE.ShaderMaterial;
  meshes: THREE.Object3D[];
}

const CLICK_SLOP = 6;

export class Picker {
  hovered: Pickable | null = null;
  focused: Pickable | null = null;
  enabled = true;

  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private entries = new Map<string, Entry>();
  private owner = new Map<THREE.Object3D, Pickable>();
  private targets: THREE.Object3D[] = [];
  private marks = new Map<string, Mark>();
  private ring: THREE.Mesh;
  private glow: THREE.Sprite;
  private down: { x: number; y: number } | null = null;
  private last = { x: 0, y: 0 };
  private gold = new THREE.Color(PALETTE.gold);
  private ink = new THREE.Color(PALETTE.charcoal);
  private hoverInk = new THREE.Color('#F2C27A');

  constructor(
    private camera: THREE.Camera,
    private dom: HTMLElement,
    scene: THREE.Scene,
    private events: PickerEvents,
  ) {
    this.ring = new THREE.Mesh(
      G.torus(1, 0.07, 8, 48),
      new THREE.MeshBasicMaterial({ color: PALETTE.gold, transparent: true, opacity: 0.95, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.ring.renderOrder = 2;
    this.glow = glowSprite(PALETTE.gold, 1, 0.6);
    this.glow.visible = false;
    scene.add(this.ring, this.glow);

    dom.addEventListener('pointermove', this.onMove);
    dom.addEventListener('pointerdown', this.onDown);
    dom.addEventListener('pointerup', this.onUp);
    dom.addEventListener('pointerleave', () => this.setHover(null, 0, 0));
  }

  add(p: Pickable) {
    if (this.entries.has(p.key)) return;
    const mat = createOutlineMaterial(PALETTE.charcoal, OUTLINE.base);
    // re-registered models already carry hulls: hand them the new material
    p.root.traverse((o) => {
      if (o.userData.isOutline) (o as THREE.Mesh).material = mat;
    });
    addOutline(p.root, mat, p.kind === 'item');
    const meshes: THREE.Object3D[] = [];
    p.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !o.userData.isOutline) {
        meshes.push(o);
        this.owner.set(o, p);
      }
    });
    this.entries.set(p.key, { p, mat, meshes });
    this.rebuild();
  }

  remove(p: Pickable | string) {
    const key = typeof p === 'string' ? p : p.key;
    const e = this.entries.get(key);
    if (!e) return;
    for (const m of e.meshes) this.owner.delete(m);
    // the model may live on (e.g. food in a customer's hand): reset its outline
    (e.mat.uniforms.uColor.value as THREE.Color).copy(this.ink);
    e.mat.uniforms.uThickness.value = OUTLINE.base;
    this.entries.delete(key);
    this.marks.delete(key);
    if (this.hovered?.key === key) this.setHover(null, 0, 0);
    if (this.focused?.key === key) this.focus(null);
    this.rebuild();
  }

  has(key: string) {
    return this.entries.has(key);
  }

  mark(key: string, mark: Mark | null) {
    if (mark) this.marks.set(key, mark);
    else this.marks.delete(key);
  }

  /** Gold ring + glow under one station. */
  focus(p: Pickable | null) {
    this.focused = p;
    this.ring.visible = this.glow.visible = !!p;
    if (!p) return;
    const pos = p.root.getWorldPosition(new THREE.Vector3());
    const r = p.ringRadius ?? 0.4;
    this.ring.position.set(pos.x, pos.y + 0.02, pos.z);
    this.ring.scale.setScalar(r);
    this.glow.position.set(pos.x, pos.y + 0.15, pos.z);
    this.glow.scale.setScalar(r * 3.2);
  }

  /** Re-run hover at the last pointer position (after the scene changes). */
  refreshHover() {
    if (this.last.x || this.last.y) this.setHover(this.pick(this.last.x, this.last.y), this.last.x, this.last.y);
  }

  private rebuild() {
    this.targets = [...this.entries.values()].flatMap((e) => e.meshes);
  }

  private pick(clientX: number, clientY: number): Pickable | null {
    if (!this.enabled) return null;
    const r = this.dom.getBoundingClientRect();
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.targets, false)[0];
    return hit ? (this.owner.get(hit.object) ?? null) : null;
  }

  private setHover(p: Pickable | null, x: number, y: number) {
    this.hovered = p;
    this.dom.style.cursor = p ? 'pointer' : '';
    this.events.onHover(p, x, y);
  }

  private onMove = (e: PointerEvent) => {
    this.last = { x: e.clientX, y: e.clientY };
    if (e.buttons !== 0) {
      if (this.hovered) this.setHover(null, 0, 0);
      return;
    }
    this.setHover(this.pick(e.clientX, e.clientY), e.clientX, e.clientY);
  };

  private onDown = (e: PointerEvent) => {
    this.down = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
  };

  private onUp = (e: PointerEvent) => {
    if (!this.down || e.button !== 0) return;
    const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
    this.down = null;
    if (moved > CLICK_SLOP) return;
    const hit = this.pick(e.clientX, e.clientY);
    this.events.onClick(hit);
    this.setHover(this.pick(e.clientX, e.clientY), e.clientX, e.clientY);
  };

  update(t: number) {
    for (const { p, mat } of this.entries.values()) {
      const u = mat.uniforms;
      const mark = this.marks.get(p.key);
      const color = u.uColor.value as THREE.Color;
      if (mark === 'selected') {
        color.copy(this.gold);
        u.uThickness.value = OUTLINE.selected + Math.sin(t * 5) * 0.006;
      } else if (this.hovered?.key === p.key) {
        color.copy(this.hoverInk);
        u.uThickness.value = OUTLINE.hover;
      } else if (mark === 'target') {
        color.copy(this.gold);
        u.uThickness.value = OUTLINE.base + 0.006 + Math.sin(t * 4) * 0.004;
      } else {
        color.copy(this.ink);
        u.uThickness.value = OUTLINE.base;
      }
    }
    if (this.focused) {
      const pulse = 1 + Math.sin(t * 4) * 0.06;
      this.ring.scale.setScalar((this.focused.ringRadius ?? 0.4) * pulse);
      (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.75 + Math.sin(t * 4) * 0.2;
    }
  }
}
