import type * as THREE from 'three';

export type StationId = 'chaya' | 'fryer' | 'tawa' | 'puttu';

export interface Station {
  id: StationId;
  name: string;
  subtitle: string;
  malayalam: string;
  root: THREE.Object3D;
  /** Radius of the gold selection ring drawn at the station base. */
  ringRadius: number;
  /** Height above the root where the floating label sits. */
  labelHeight: number;
}

export interface HudStats {
  shopName: string;
  money: number;
  reputation: number;
  maxReputation: number;
  day: number;
  level: number;
  /** Customers handled today / today's quota. */
  handled: number;
  quota: number;
}
