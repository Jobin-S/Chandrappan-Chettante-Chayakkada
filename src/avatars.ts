import * as THREE from 'three';
import { createShopkeeper, Shopkeeper } from './models';
import { addOutline } from './toon';
import type { RemotePlayer } from './game';

/** Other players drawn as shopkeepers in their own colours, smoothly following their poses. */

const EYE_HEIGHT = 1.95;

interface Avatar {
  sk: Shopkeeper;
  target: THREE.Vector3;
  yaw: number;
  look: string;
  walk: number;
}

export class Avatars {
  private map = new Map<string, Avatar>();

  constructor(private parent: THREE.Object3D) {}

  sync(players: RemotePlayer[]) {
    const keep = new Set(players.map((p) => p.id));
    for (const [id, a] of this.map) {
      if (keep.has(id)) continue;
      this.parent.remove(a.sk.root);
      this.map.delete(id);
    }
    for (const p of players) {
      const look = `${p.shirt}|${p.apron}`;
      let a = this.map.get(p.id);
      if (a && a.look !== look) {
        this.parent.remove(a.sk.root);
        a = undefined;
      }
      if (!a) {
        const sk = createShopkeeper({ shirt: p.shirt, apron: p.apron });
        addOutline(sk.root);
        sk.root.position.set(p.pos.x, p.pos.y - EYE_HEIGHT, p.pos.z);
        this.parent.add(sk.root);
        a = { sk, target: new THREE.Vector3(), yaw: p.yaw, look, walk: 0 };
        this.map.set(p.id, a);
      }
      a.target.set(p.pos.x, p.pos.y - EYE_HEIGHT, p.pos.z);
      a.yaw = p.yaw;
    }
  }

  update(dt: number, t: number) {
    for (const a of this.map.values()) {
      const root = a.sk.root;
      const before = root.position.clone();
      root.position.lerp(a.target, Math.min(1, dt * 10));
      const speed = before.distanceTo(root.position) / Math.max(dt, 1e-3);
      a.walk = speed > 0.3 ? a.walk + dt * 9 : a.walk * 0.9;
      root.position.y += Math.abs(Math.sin(a.walk)) * (speed > 0.3 ? 0.05 : 0);
      const diff = Math.atan2(Math.sin(a.yaw - root.rotation.y), Math.cos(a.yaw - root.rotation.y));
      root.rotation.y += diff * Math.min(1, dt * 10);
      a.sk.update(t);
    }
  }

  /** World positions of every avatar's head (for voices and name tags). */
  heads(): Map<string, THREE.Vector3> {
    const out = new Map<string, THREE.Vector3>();
    for (const [id, a] of this.map) out.set(id, a.sk.root.position.clone().add(new THREE.Vector3(0, 1.85, 0)));
    return out;
  }

  clear() {
    for (const a of this.map.values()) this.parent.remove(a.sk.root);
    this.map.clear();
  }
}
