import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * Camera director with four modes:
 *  - menu:      slow cinematic orbit behind the title screen
 *  - customize: fixed framing that keeps the shop to the right of the form
 *  - fp:        first person as Chandrappan – drag to look, WASD to walk inside the shop
 *  - overview:  constrained orbit (left-drag orbit, right-drag pan, wheel zoom)
 * Switching modes glides between poses.
 */

export type ViewMode = 'menu' | 'customize' | 'fp' | 'overview';

const ORBIT_TARGET = new THREE.Vector3(-0.3, 2.3, 0.4);
const ORBIT_POSE = new THREE.Spherical(13.4, 1.31, 0.6);
const TARGET_MIN = new THREE.Vector3(-3, 0.9, -2);
const TARGET_MAX = new THREE.Vector3(3, 3.2, 3.2);

/** First-person defaults: standing behind the counter, facing the road. */
const EYE_HEIGHT = 1.95;
const FP_HOME = { x: -0.5, z: -0.05, yaw: 0.02, pitch: -0.17 };
const FP_FOV = 72;
const ORBIT_FOV = 44;
/** Walkable floor inside the shop (x/z), and obstacles to push out of. */
const FP_BOUNDS = { x0: -2.2, x1: 2.95, z0: -1.5, z1: 0.85 };
const FP_BLOCKERS = [{ x0: 1.5, x1: 3.1, z0: -1.5, z1: -0.5 }];
const WALK_SPEED = 2.2;

interface Tween {
  t: number;
  dur: number;
  fromPos: THREE.Vector3;
  fromQuat: THREE.Quaternion;
  fromFov: number;
  toPos: () => THREE.Vector3;
  toQuat: () => THREE.Quaternion;
  toFov: number;
  done: () => void;
}

export class CameraDirector {
  mode: ViewMode = 'menu';
  readonly controls: OrbitControls;
  /** Whether WASD walking is allowed (only while the shop is open). */
  walkEnabled = true;
  onModeChange: (mode: ViewMode) => void = () => {};

  private floorY: number;
  private fp = {
    pos: new THREE.Vector3(),
    yaw: FP_HOME.yaw,
    pitch: FP_HOME.pitch,
    yawGoal: FP_HOME.yaw,
    pitchGoal: FP_HOME.pitch,
    fov: FP_FOV,
  };
  private keys = new Set<string>();
  private drag: { x: number; y: number } | null = null;
  private tween: Tween | null = null;
  private menuTheta = 0.4;
  private walkPhase = 0;
  private euler = new THREE.Euler(0, 0, 0, 'YXZ');

  constructor(
    private camera: THREE.PerspectiveCamera,
    dom: HTMLElement,
    floorY: number,
  ) {
    this.floorY = floorY;
    this.fp.pos.set(FP_HOME.x, floorY + EYE_HEIGHT, FP_HOME.z);

    const c = new OrbitControls(camera, dom);
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.rotateSpeed = 0.7;
    c.panSpeed = 0.8;
    c.zoomSpeed = 0.9;
    c.minDistance = 5.5;
    c.maxDistance = 24;
    c.minPolarAngle = 0.28;
    c.maxPolarAngle = 1.4;
    c.minAzimuthAngle = -1.95;
    c.maxAzimuthAngle = 1.95;
    c.screenSpacePanning = true;
    c.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    c.enabled = false;
    c.target.copy(ORBIT_TARGET);
    this.controls = c;
    camera.position.copy(this.menuPosition());
    camera.lookAt(ORBIT_TARGET);

    dom.addEventListener('pointerdown', (e) => {
      if (this.mode === 'fp' && !this.tween && e.button === 0) this.drag = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      this.drag = { x: e.clientX, y: e.clientY };
      this.fp.yawGoal -= dx * 0.0042;
      this.fp.pitchGoal = THREE.MathUtils.clamp(this.fp.pitchGoal - dy * 0.0036, -1.05, 0.5);
    });
    window.addEventListener('pointerup', () => (this.drag = null));
    dom.addEventListener(
      'wheel',
      (e) => {
        if (this.mode !== 'fp') return;
        e.preventDefault();
        this.fp.fov = THREE.MathUtils.clamp(this.fp.fov + Math.sign(e.deltaY) * 4, 45, 85);
      },
      { passive: false },
    );
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  get firstPerson() {
    return this.mode === 'fp';
  }

  get busy() {
    return !!this.tween;
  }

  /** World-space eye position in first person (for customers to look at). */
  get eye(): THREE.Vector3 {
    return this.fp.pos;
  }

  setMode(mode: ViewMode, instant = false) {
    const prev = this.mode;
    if (mode === prev && mode !== 'overview') return;
    this.mode = mode;
    this.drag = null;
    this.controls.enabled = false;
    const done = () => {
      if (mode === 'overview') {
        this.controls.target.copy(ORBIT_TARGET);
        this.controls.enabled = true;
        this.controls.update();
      }
    };
    const toPos = () => this.poseFor(mode).pos;
    const toQuat = () => this.poseFor(mode).quat;
    const toFov = mode === 'fp' ? this.fp.fov : ORBIT_FOV;
    if (instant) {
      this.camera.position.copy(toPos());
      this.camera.quaternion.copy(toQuat());
      this.setFov(toFov);
      this.tween = null;
      done();
    } else {
      this.tween = {
        t: 0,
        dur: mode === 'fp' || prev === 'fp' ? 1.3 : 1.0,
        fromPos: this.camera.position.clone(),
        fromQuat: this.camera.quaternion.clone(),
        fromFov: this.camera.fov,
        toPos,
        toQuat,
        toFov,
        done,
      };
    }
    this.onModeChange(mode);
  }

  /** R: back to the home pose of the current mode. */
  reset() {
    if (this.mode === 'fp') {
      this.fp.pos.set(FP_HOME.x, this.floorY + EYE_HEIGHT, FP_HOME.z);
      this.fp.yawGoal = FP_HOME.yaw;
      this.fp.pitchGoal = FP_HOME.pitch;
      this.fp.fov = FP_FOV;
    } else if (this.mode === 'overview') {
      this.setMode('overview');
    }
  }

  /** First person: smoothly turn to look at a world point (lift raises the aim). */
  lookAt(p: THREE.Vector3, lift = 0) {
    if (this.mode !== 'fp') return;
    const d = p.clone().sub(this.fp.pos);
    let yaw = Math.atan2(d.x, d.z);
    while (yaw - this.fp.yawGoal > Math.PI) yaw -= Math.PI * 2;
    while (yaw - this.fp.yawGoal < -Math.PI) yaw += Math.PI * 2;
    this.fp.yawGoal = yaw;
    this.fp.pitchGoal = THREE.MathUtils.clamp(Math.atan2(d.y + lift, Math.hypot(d.x, d.z)), -1.05, 0.5);
  }

  private setFov(f: number) {
    if (Math.abs(this.camera.fov - f) > 0.01) {
      this.camera.fov = f;
      this.camera.updateProjectionMatrix();
    }
  }

  private menuPosition(): THREE.Vector3 {
    return new THREE.Vector3().setFromSpherical(new THREE.Spherical(15, 1.25, this.menuTheta)).add(ORBIT_TARGET);
  }

  private fpQuat(yaw = this.fp.yaw, pitch = this.fp.pitch): THREE.Quaternion {
    // the camera looks down -Z; yaw 0 should face +Z (toward the road)
    this.euler.set(pitch, yaw + Math.PI, 0, 'YXZ');
    return new THREE.Quaternion().setFromEuler(this.euler);
  }

  private poseFor(mode: ViewMode): { pos: THREE.Vector3; quat: THREE.Quaternion } {
    const look = (pos: THREE.Vector3, target: THREE.Vector3) => {
      const m = new THREE.Matrix4().lookAt(pos, target, new THREE.Vector3(0, 1, 0));
      return { pos, quat: new THREE.Quaternion().setFromRotationMatrix(m) };
    };
    switch (mode) {
      case 'fp':
        return { pos: this.fp.pos.clone(), quat: this.fpQuat(this.fp.yawGoal, this.fp.pitchGoal) };
      case 'overview':
        return look(new THREE.Vector3().setFromSpherical(ORBIT_POSE).add(ORBIT_TARGET), ORBIT_TARGET);
      case 'customize':
        return look(new THREE.Vector3(3.2, 4.4, 10.6), new THREE.Vector3(-2.6, 1.9, 0.6));
      default:
        return look(this.menuPosition(), ORBIT_TARGET);
    }
  }

  private moving(): boolean {
    if (!this.walkEnabled) return false;
    for (const c of this.keys) if (/^(Key[WASD]|Arrow(Up|Down|Left|Right))$/.test(c)) return true;
    return false;
  }

  private walk(dt: number) {
    const k = this.keys;
    const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const s = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    if (!f && !s) return;
    const yaw = this.fp.yaw;
    // forward = (sin yaw, cos yaw); screen-right = (-cos yaw, sin yaw)
    const dx = (Math.sin(yaw) * f - Math.cos(yaw) * s) * WALK_SPEED * dt;
    const dz = (Math.cos(yaw) * f + Math.sin(yaw) * s) * WALK_SPEED * dt;
    const p = this.fp.pos;
    let nx = THREE.MathUtils.clamp(p.x + dx, FP_BOUNDS.x0, FP_BOUNDS.x1);
    let nz = THREE.MathUtils.clamp(p.z + dz, FP_BOUNDS.z0, FP_BOUNDS.z1);
    for (const b of FP_BLOCKERS) {
      if (nx > b.x0 && nx < b.x1 && nz > b.z0 && nz < b.z1) {
        if (!(p.x > b.x0 && p.x < b.x1)) nx = p.x;
        if (!(p.z > b.z0 && p.z < b.z1)) nz = p.z;
      }
    }
    p.x = nx;
    p.z = nz;
    this.walkPhase += dt * 9;
  }

  update(dt: number) {
    if (this.mode === 'menu') this.menuTheta += dt * 0.07;

    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      const e = tw.t < 0.5 ? 4 * tw.t ** 3 : 1 - (-2 * tw.t + 2) ** 3 / 2;
      this.camera.position.lerpVectors(tw.fromPos, tw.toPos(), e);
      this.camera.quaternion.slerpQuaternions(tw.fromQuat, tw.toQuat(), e);
      this.setFov(tw.fromFov + (tw.toFov - tw.fromFov) * e);
      if (tw.t >= 1) {
        this.tween = null;
        if (this.mode === 'fp') {
          this.fp.yaw = this.fp.yawGoal;
          this.fp.pitch = this.fp.pitchGoal;
        }
        tw.done();
      }
      return;
    }

    if (this.mode === 'fp') {
      const moving = this.moving();
      if (moving) this.walk(dt);
      else this.walkPhase *= 0.85;
      const k = Math.min(1, dt * 14);
      this.fp.yaw += (this.fp.yawGoal - this.fp.yaw) * k;
      this.fp.pitch += (this.fp.pitchGoal - this.fp.pitch) * k;
      this.camera.position.set(this.fp.pos.x, this.fp.pos.y + Math.sin(this.walkPhase) * 0.025, this.fp.pos.z);
      this.camera.quaternion.copy(this.fpQuat());
      this.setFov(THREE.MathUtils.damp(this.camera.fov, this.fp.fov, 10, dt));
    } else if (this.mode === 'menu') {
      this.camera.position.copy(this.menuPosition());
      this.camera.lookAt(ORBIT_TARGET);
    } else if (this.mode === 'overview') {
      this.controls.update();
      const target = this.controls.target;
      const clamped = target.clone().clamp(TARGET_MIN, TARGET_MAX);
      if (!clamped.equals(target)) {
        this.camera.position.add(clamped.clone().sub(target));
        target.copy(clamped);
      }
    }
  }

  get orbitTarget(): THREE.Vector3 {
    return this.controls.target;
  }
}
