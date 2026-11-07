import * as THREE from 'three';
import { PALETTE, TONES } from './palette';
import { G, addOutline, group, limb, part, rng, toon, toonUnique } from './toon';
import * as M from './models';
import { calendarTexture, menuBoardTexture, signboardTexture } from './textures';
import { Steam, glowSprite } from './effects';
import { AWNING, UpgradeId, buildUpgrade } from './upgrades';
import type { Station, StationId } from './types';

/** The chayakkada: plinth, plank walls, tin roof, counter, hearth and props. */

export const FLOOR = 0.35;
export const COUNTER_TOP = FLOOR + 1.02;
export const HEARTH_TOP = FLOOR + 1.0;
export const DEFAULT_SHOP_NAME = 'Chandrappan Chettante Chayakkada';
/** Where finished food waits on the counter (front edge, beside Chandrappan). */
export const SERVE_SLOTS = [-2.1, -1.66, -1.22].map((x) => new THREE.Vector3(x, COUNTER_TOP, 1.64));
/** Where customers stand in front of the counter. */
export const QUEUE_SLOTS = [
  new THREE.Vector3(-0.35, 0, 2.8),
  new THREE.Vector3(0.95, 0, 2.8),
  new THREE.Vector3(2.2, 0, 2.8),
  // fourth spot, unlocked by Extra Seating
  new THREE.Vector3(3.3, 0, 2.95),
];
/** Chandrappan's spot behind the counter (also the first-person eye position). */
export const SHOPKEEPER_POS = new THREE.Vector3(-0.6, FLOOR, 0.6);

const ROOF = { zBack: -2.75, zFront: 2.95, yBack: 4.65, yFront: 3.65, width: 7.6 };
const SLOPE = Math.atan2(ROOF.yBack - ROOF.yFront, ROOF.zFront - ROOF.zBack);
export const roofY = (z: number) =>
  ROOF.yBack + ((z - ROOF.zBack) / (ROOF.zFront - ROOF.zBack)) * (ROOF.yFront - ROOF.yBack);
const WALL = { x: 3.2, zBack: -2.4, zFront: 2.0 };

/** True when a sloped sheet (y linear in z) lies between the camera and its target. */
function sheetBlocks(
  cam: THREE.Vector3,
  target: THREE.Vector3,
  y: (z: number) => number,
  halfW: number,
  z0: number,
  z1: number,
): boolean {
  const f0 = cam.y - y(cam.z);
  const f1 = target.y - y(target.z);
  if (f0 <= 0 || f1 >= 0) return false;
  const t = f0 / (f0 - f1);
  const x = cam.x + (target.x - cam.x) * t;
  const z = cam.z + (target.z - cam.z) * t;
  return Math.abs(x) < halfW + 0.2 && z > z0 - 0.2 && z < z1 + 0.2;
}

export function roofBlocksView(cam: THREE.Vector3, target: THREE.Vector3): boolean {
  return sheetBlocks(cam, target, roofY, ROOF.width / 2, ROOF.zBack, ROOF.zFront);
}

const awningY = (z: number) => AWNING.y0 + ((z - AWNING.z0) / (AWNING.z1 - AWNING.z0)) * (AWNING.y1 - AWNING.y0);
const HEARTH = { x0: -3.16, x1: -2.4, z0: -2.2, z1: 0.75 };

export interface Shop {
  root: THREE.Group;
  stations: Station[];
  shopkeeper: M.Shopkeeper;
  trim: THREE.MeshToonMaterial;
  setRoofOpacity(opacity: number): void;
  setStationBusy(id: StationId | null): void;
  /** Roof (and awning, once bought) between camera and target? */
  blocksView(cam: THREE.Vector3, target: THREE.Vector3): boolean;
  setLook(look: ShopLook): void;
  addUpgrade(id: UpgradeId, animate?: boolean): void;
  clearUpgrades(): void;
  setShopkeeperVisible(visible: boolean): void;
  update(dt: number, t: number): void;
}

export interface ShopLook {
  shopName: string;
  trim: string;
  shirt: string;
  apron: string;
}

export function buildShop(scene: THREE.Scene): Shop {
  const root = group(scene, undefined, undefined, 'shop');
  const rand = rng(99);
  const trim = toonUnique(PALETTE.leaf);

  buildPlinth(root, rand);
  buildWalls(root, rand);
  const roofMat = buildRoof(root, trim);
  const signFace = buildSign(root);
  let signName = DEFAULT_SHOP_NAME;
  buildCounter(root, trim);
  const fire = buildHearth(root);
  buildShelves(root);
  buildInterior(root);
  buildExterior(root);
  const bulb = buildBulb(root);
  addOutline(root);

  // ---- cooking stations (own outline materials, added by the picker)
  const steams: Steam[] = [];
  const stationSteams = new Map<StationId, Steam[]>();
  let busy: { id: StationId; root: THREE.Object3D } | null = null;
  const station = (
    id: StationId,
    name: string,
    subtitle: string,
    malayalam: string,
    model: M.StationModel,
    pos: [number, number, number],
    ringRadius: number,
    labelHeight: number,
    steamSize = 0.22,
  ): Station => {
    model.root.position.set(...pos);
    model.root.name = `station:${id}`;
    model.root.userData.stationId = id;
    root.add(model.root);
    const own = model.steam.map((o) => new Steam(model.root, o, { size: steamSize }));
    steams.push(...own);
    stationSteams.set(id, own);
    return { id, name, subtitle, malayalam, root: model.root, ringRadius, labelHeight };
  };
  const stations: Station[] = [
    station('chaya', 'Chaya Station', 'Big kettle on the brass stove', 'ചായ', M.createChayaStation(), [-2.65, COUNTER_TOP, 1.42], 0.34, 0.95, 0.2),
    station('fryer', 'Snack Fryer', 'Cheenachatti for pazhampori & vada', 'പലഹാരം', M.createFryerStation(), [-2.78, HEARTH_TOP, 0.3], 0.44, 0.55, 0.28),
    station('tawa', 'Dosa Tawa', 'Hot iron tawa for crispy dosa', 'ദോശ', M.createTawaStation(), [-2.78, HEARTH_TOP, -0.55], 0.38, 0.45, 0.2),
    station('puttu', 'Puttu Steamer', 'Puttu kutti on the boil', 'പുട്ട്', M.createPuttuStation(), [-2.78, HEARTH_TOP, -1.45], 0.3, 1.0, 0.26),
  ];

  // ---- Chandrappan behind the counter
  const shopkeeper = M.createShopkeeper();
  shopkeeper.root.position.copy(SHOPKEEPER_POS);
  shopkeeper.root.rotation.y = 0.32;
  root.add(shopkeeper.root);
  addOutline(shopkeeper.root);

  // ---- upgrades appear with a little pop
  const upgrades = new Map<UpgradeId, { root: THREE.Group; fade: THREE.MeshToonMaterial[]; t: number }>();
  let fadeOpacity = 1;
  const applyFade = (m: THREE.MeshToonMaterial, opacity: number) => {
    const transparent = opacity < 0.999;
    if (m.transparent !== transparent) {
      m.transparent = transparent;
      m.depthWrite = !transparent;
      m.needsUpdate = true;
    }
    m.opacity = opacity;
  };

  return {
    root,
    stations,
    shopkeeper,
    trim,
    setRoofOpacity(opacity: number) {
      fadeOpacity = opacity;
      applyFade(roofMat, opacity);
      for (const u of upgrades.values()) for (const m of u.fade) applyFade(m, opacity);
    },
    blocksView(cam: THREE.Vector3, target: THREE.Vector3) {
      if (roofBlocksView(cam, target)) return true;
      return upgrades.has('roof') && sheetBlocks(cam, target, awningY, AWNING.width / 2, AWNING.z0, AWNING.z1);
    },
    setLook(look: ShopLook) {
      trim.color.set(look.trim);
      shopkeeper.shirt.color.set(look.shirt);
      shopkeeper.apron.color.set(look.apron);
      if (look.shopName !== signName) {
        signName = look.shopName;
        signFace.map?.dispose();
        signFace.map = signboardTexture(look.shopName);
        signFace.needsUpdate = true;
      }
    },
    addUpgrade(id: UpgradeId, animate = true) {
      if (upgrades.has(id)) return;
      const v = buildUpgrade(id, FLOOR, HEARTH_TOP);
      root.add(v.root);
      for (const m of v.fadeMaterials) applyFade(m, fadeOpacity);
      upgrades.set(id, { root: v.root, fade: v.fadeMaterials, t: animate ? 0 : 1 });
      v.root.scale.setScalar(animate ? 0.01 : 1);
    },
    clearUpgrades() {
      for (const u of upgrades.values()) root.remove(u.root);
      upgrades.clear();
    },
    setShopkeeperVisible(visible: boolean) {
      shopkeeper.root.visible = visible;
    },
    setStationBusy(id: StationId | null) {
      for (const [sid, list] of stationSteams) for (const st of list) st.intensity = sid === id ? 2.2 : 1;
      if (busy) busy.root.scale.setScalar(1);
      const s = id ? stations.find((x) => x.id === id) : undefined;
      busy = s ? { id: s.id, root: s.root } : null;
    },
    update(dt: number, t: number) {
      shopkeeper.update(t);
      for (const u of upgrades.values()) {
        if (u.t >= 1) continue;
        u.t = Math.min(1, u.t + dt / 0.9);
        const k = u.t - 1;
        u.root.scale.setScalar(Math.max(0.01, 1 + 2.7 * k * k * k + 1.7 * k * k)); // ease-out-back
      }
      if (busy) busy.root.scale.set(1 + Math.sin(t * 18) * 0.012, 1 + Math.sin(t * 18 + 1) * 0.02, 1 + Math.sin(t * 18) * 0.012);
      for (const s of steams) s.update(dt, t);
      const flicker = 0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 7.3) * 0.07;
      fire.material.color.setRGB(1, 0.45 * flicker + 0.1, 0.15 * flicker);
      fire.light.intensity = 2.6 * flicker;
      bulb.pivot.rotation.z = Math.sin(t * 0.9) * 0.025;
      bulb.pivot.rotation.x = Math.sin(t * 0.7 + 1) * 0.02;
    },
  };
}

// ======================================================================= base

function buildPlinth(root: THREE.Object3D, rand: () => number) {
  part(root, G.box(7.0, FLOOR, 4.95), toon(TONES.laterite), { pos: [0, FLOOR / 2, -0.225], outline: false });
  const blocks = [TONES.laterite, TONES.lateriteLight, TONES.lateriteDark, '#B0603C'].map((c) => toon(c));
  const pick = () => blocks[Math.floor(rand() * blocks.length)];
  const step = 0.54;
  for (let row = 0; row < 2; row++) {
    const y = 0.095 + row * 0.165;
    const off = row % 2 ? step / 2 : 0;
    for (let x = -3.5 - off; x < 3.5; x += step) {
      const a = Math.max(x, -3.5);
      const b = Math.min(x + step, 3.5);
      const w = Math.round((b - a - 0.025) * 100) / 100;
      if (w > 0.05) part(root, G.box(w, 0.14, 0.03), pick(), { pos: [(a + b) / 2, y, 2.255], shadow: false, outline: false });
    }
    for (const s of [-1, 1]) {
      for (let z = -2.7 - off; z < 2.25; z += step) {
        const a = Math.max(z, -2.7);
        const b = Math.min(z + step, 2.25);
        const w = Math.round((b - a - 0.025) * 100) / 100;
        if (w > 0.05) part(root, G.box(0.03, 0.14, w), pick(), { pos: [s * 3.505, y, (a + b) / 2], shadow: false, outline: false });
      }
    }
  }
  // polished red-oxide floor
  part(root, G.box(6.94, 0.012, 4.89), toon(TONES.redOxide), { pos: [0, FLOOR + 0.006, -0.225], shadow: false, outline: false });
  // entrance step
  part(root, G.box(0.9, 0.18, 0.42), toon(TONES.lateriteLight), { pos: [2.6, 0.09, 2.47] });
}

const PLANK_TONES = [PALETTE.wood, '#8F5434', '#7A4428', '#9A5D3A', '#86502F'];

function planks(
  root: THREE.Object3D,
  axis: 'x' | 'z',
  from: number,
  to: number,
  fixed: number,
  y0: number,
  y1: number,
  rand: () => number,
) {
  const n = Math.max(1, Math.round((to - from) / 0.32));
  const w = (to - from) / n;
  const h = Math.round((y1 - y0) * 1000) / 1000;
  const pw = Math.round((w - 0.022) * 1000) / 1000;
  for (let i = 0; i < n; i++) {
    const c = from + w * (i + 0.5);
    const mat = toon(PLANK_TONES[Math.floor(rand() * PLANK_TONES.length)]);
    const geo = axis === 'x' ? G.box(pw, h, 0.05) : G.box(0.05, h, pw);
    const pos: [number, number, number] = axis === 'x' ? [c, y0 + h / 2, fixed] : [fixed, y0 + h / 2, c];
    part(root, geo, mat, { pos, outline: false });
  }
}

function buildWalls(root: THREE.Object3D, rand: () => number) {
  const backing = toon(TONES.backing);
  const dark = toon(TONES.woodDark);
  const mid = toon(TONES.woodMid);

  // back wall – full height planks
  const topBack = roofY(WALL.zBack) - 0.02;
  part(root, G.box(6.4, topBack - FLOOR, 0.04), backing, { pos: [0, (topBack + FLOOR) / 2, WALL.zBack - 0.05], outline: false });
  planks(root, 'x', -WALL.x, WALL.x, WALL.zBack, FLOOR, topBack, rand);
  planks(root, 'x', -WALL.x, WALL.x, WALL.zBack - 0.1, FLOOR, topBack, rand);

  // side walls – plank half walls with open slatted tops for the view
  const halfTop = FLOOR + 1.15;
  for (const s of [-1, 1]) {
    const x = s * WALL.x;
    part(root, G.box(0.04, halfTop - FLOOR, 4.4), backing, { pos: [x, (halfTop + FLOOR) / 2, -0.2], outline: false });
    planks(root, 'z', WALL.zBack, WALL.zFront, x - s * 0.045, FLOOR, halfTop, rand);
    planks(root, 'z', WALL.zBack, WALL.zFront, x + s * 0.045, FLOOR, halfTop, rand);
    part(root, G.box(0.14, 0.08, 4.5), dark, { pos: [x, halfTop + 0.04, -0.2] });
    for (let z = -2.12; z < 1.9; z += 0.34) {
      const top = roofY(z) - 0.08;
      const h = Math.round((top - (halfTop + 0.08)) * 1000) / 1000;
      part(root, G.box(0.05, h, 0.06), mid, { pos: [x, halfTop + 0.08 + h / 2, z] });
    }
    part(root, G.box(0.12, 0.1, 4.62), dark, { pos: [x, roofY(-0.2) - 0.1, -0.2], rot: [SLOPE, 0, 0] });
  }

  // posts, front beam and eave brackets
  for (const s of [-1, 1]) {
    for (const z of [WALL.zBack, WALL.zFront]) {
      const top = roofY(z);
      part(root, G.box(0.16, top - FLOOR, 0.16), dark, { pos: [s * WALL.x, (top + FLOOR) / 2, z] });
    }
    limb(root, [s * WALL.x, roofY(2.0) - 0.62, 2.0], [s * WALL.x, roofY(2.82) - 0.1, 2.82], 0.04, dark);
  }
  part(root, G.box(6.6, 0.16, 0.14), dark, { pos: [0, roofY(WALL.zFront) - 0.12, WALL.zFront] });
}

/** Corrugated tin roof with painted rust-red sheets and a trim fascia. */
function buildRoof(root: THREE.Object3D, trim: THREE.MeshToonMaterial): THREE.MeshToonMaterial {
  const L = Math.hypot(ROOF.zFront - ROOF.zBack, ROOF.yBack - ROOF.yFront);
  const g = group(root, [0, (ROOF.yBack + ROOF.yFront) / 2 + 0.03, (ROOF.zBack + ROOF.zFront) / 2], [SLOPE, 0, 0], 'roof');

  const geo = new THREE.PlaneGeometry(ROOF.width, L, 380, 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const tones = ['#9C4A30', '#A9533A', '#8F4430', '#B05E3F'].map((c) => new THREE.Color(c));
  const rust = new THREE.Color('#6A3826');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    pos.setZ(i, Math.sin((x / 0.19) * Math.PI * 2) * 0.03);
    const sheet = Math.floor((x + ROOF.width / 2) / 0.95);
    c.copy(tones[sheet % tones.length]);
    if ((sheet * 7) % 3 === 1 && y < 0) c.lerp(rust, (0.45 * -y) / (L / 2));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  const roofMat = toonUnique('#ffffff', { vertexColors: true, side: THREE.DoubleSide });
  const sheet = new THREE.Mesh(geo, roofMat);
  sheet.castShadow = true;
  sheet.userData.noOutline = true;
  g.add(sheet);

  part(g, G.box(ROOF.width + 0.1, 0.2, 0.05), trim, { pos: [0, -0.07, L / 2 + 0.02], rot: [-SLOPE, 0, 0] });
  part(g, G.box(ROOF.width + 0.1, 0.14, 0.05), trim, { pos: [0, -0.05, -L / 2 - 0.02], rot: [-SLOPE, 0, 0] });
  for (const s of [-1, 1]) part(g, G.box(0.05, 0.14, L + 0.08), trim, { pos: [s * (ROOF.width / 2 + 0.03), -0.04, 0] });

  const dark = toon(TONES.woodDark);
  for (const x of [-3.4, -1.7, 0, 1.7, 3.4]) part(g, G.box(0.08, 0.1, L - 0.1), dark, { pos: [x, -0.15, 0] });
  for (const z of [-L / 2 + 0.3, -0.95, 0.95, L / 2 - 0.3]) part(g, G.box(ROOF.width - 0.1, 0.06, 0.08), dark, { pos: [0, -0.07, z] });
  return roofMat;
}

function buildSign(root: THREE.Object3D): THREE.MeshBasicMaterial {
  const face = new THREE.MeshBasicMaterial({ map: signboardTexture(DEFAULT_SHOP_NAME), color: '#F3EBDC' });
  const wood = toon(PALETTE.wood);
  const board = part(root, G.box(5.0, 0.95, 0.08), [wood, wood, wood, wood, face, wood], {
    pos: [0, 4.14, 2.93],
    rot: [-0.05, 0, 0],
    name: 'signboard',
  });
  board.userData.noOutline = false;
  for (const s of [-1, 1]) part(root, G.box(0.08, 1.0, 0.08), toon(TONES.woodDark), { pos: [s * 2.1, 4.08, 2.85] });
  part(root, G.box(5.12, 0.06, 0.14), toon(TONES.woodDark), { pos: [0, 4.63, 2.92] });
  return face;
}

// ==================================================================== counter

function buildCounter(root: THREE.Object3D, trim: THREE.MeshToonMaterial) {
  const cx = -0.6;
  const cz = 1.47;
  const len = 5.1;
  part(root, G.box(len + 0.05, 0.08, 0.74), toon(TONES.woodDark), { pos: [cx, FLOOR + 0.04, cz] });
  part(root, G.box(len - 0.04, 0.86, 0.7), trim, { pos: [cx, FLOOR + 0.51, cz] });
  for (let i = 1; i < 13; i++) {
    part(root, G.box(0.025, 0.74, 0.012), toon(PALETTE.charcoal), {
      pos: [cx - len / 2 + (i * len) / 13, FLOOR + 0.51, cz + 0.352],
      outline: false,
      shadow: false,
    });
  }
  for (const y of [FLOOR + 0.14, FLOOR + 0.9])
    part(root, G.box(len - 0.02, 0.05, 0.02), toon(PALETTE.gold), { pos: [cx, y, cz + 0.355], outline: false });
  part(root, G.box(len + 0.12, 0.08, 0.86), toon(TONES.woodLight), { pos: [cx, COUNTER_TOP - 0.04, cz] });

  // counter-top items
  const tray = M.createGlassTray();
  tray.position.set(-0.15, COUNTER_TOP, 1.24);
  root.add(tray);
  const plates = group(root, [-0.95, COUNTER_TOP, 1.2]);
  for (let i = 0; i < 4; i++) part(plates, G.cyl(0.16, 0.13, 0.015, 22), toon(TONES.steel), { pos: [0, 0.008 + i * 0.016, 0] });
  const jarA = M.createJar('#D99B46', PALETTE.terracotta, 0.12, 0.32);
  jarA.position.set(0.12, COUNTER_TOP, 1.42);
  const jarB = M.createJar('#C8733A', PALETTE.leaf, 0.12, 0.32, 0.55);
  jarB.position.set(0.45, COUNTER_TOP, 1.5);
  const jarC = M.createJar('#F2E3B8', PALETTE.gold, 0.09, 0.24);
  jarC.position.set(0.3, COUNTER_TOP, 1.25);
  const showcase = M.createDisplayCase();
  showcase.position.set(1.32, COUNTER_TOP, 1.45);
  root.add(jarA, jarB, jarC, showcase);
}

// ===================================================================== hearth

function buildHearth(root: THREE.Object3D) {
  const { x0, x1, z0, z1 } = HEARTH;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const depth = x1 - x0;
  const len = z1 - z0;
  const H = 0.93;
  part(root, G.box(depth, H, len), toon(TONES.hearth), { pos: [cx, FLOOR + H / 2, cz] });
  part(root, G.box(depth + 0.06, 0.07, len + 0.06), toon(TONES.stone), { pos: [cx, FLOOR + H + 0.035, cz] });
  const material = new THREE.MeshBasicMaterial({ color: TONES.fire });
  const hole = toon('#1E1A16');
  const lintel = toon(TONES.stone);
  const log = toon(TONES.woodDark);
  for (const z of [0.3, -0.55, -1.45]) {
    part(root, G.box(0.03, 0.36, 0.42), hole, { pos: [x1 + 0.005, FLOOR + 0.33, z], shadow: false, outline: false });
    part(root, G.box(0.02, 0.18, 0.32), material, { pos: [x1 + 0.012, FLOOR + 0.24, z], shadow: false });
    part(root, G.box(0.06, 0.07, 0.52), lintel, { pos: [x1 + 0.02, FLOOR + 0.54, z] });
    for (const dz of [-0.07, 0.07])
      part(root, G.cyl(0.035, 0.04, 0.42, 8), log, { pos: [x1 + 0.1, FLOOR + 0.2, z + dz], rot: [0, dz * 2, Math.PI / 2 - 0.15] });
    part(root, G.cyl(0.25, 0.25, 0.012, 24), toon('#2A2622'), { pos: [cx, HEARTH_TOP + 0.006, z], shadow: false, outline: false });
  }
  // batter bowl at the back end of the hearth
  const bowl = M.createSteelBowl(PALETTE.softWhite);
  bowl.position.set(cx, HEARTH_TOP, -1.98);
  root.add(bowl);
  // firewood bundle under the counter end
  const light = new THREE.PointLight(TONES.fire, 2.6, 3.6, 1.6);
  light.position.set(x1 + 0.55, FLOOR + 0.35, -0.55);
  root.add(light);
  return { material, light };
}

// ==================================================================== shelves

function buildShelves(root: THREE.Object3D) {
  const wood = toon(TONES.woodLight);
  const z = -2.2;
  const x0 = -2.25;
  const x1 = 3.1;
  const cx = (x0 + x1) / 2;
  const len = x1 - x0;
  const levels = [FLOOR + 1.4, FLOOR + 2.0];
  for (const y of levels) {
    part(root, G.box(len, 0.04, 0.34), wood, { pos: [cx, y, z] });
    for (const bx of [x0 + 0.15, cx, x1 - 0.15]) part(root, G.box(0.04, 0.16, 0.26), toon(TONES.woodDark), { pos: [bx, y - 0.1, z - 0.02] });
  }
  const put = (obj: THREE.Object3D, x: number, y: number, zz = z) => {
    obj.position.set(x, y + 0.02, zz);
    root.add(obj);
  };
  // lower shelf: ingredient jars, biscuit tin, milk powder, tumblers
  const jars: [string, string][] = [
    ['#F6F0E2', PALETTE.terracotta], // sugar
    ['#4A2E1E', PALETTE.leaf], // tea dust
    ['#5C3A24', PALETTE.gold], // coffee powder
    ['#E8D6A8', PALETTE.terracotta], // rava
    ['#EFE6D2', PALETTE.leaf], // puttu podi
  ];
  jars.forEach(([c, l], i) => put(M.createJar(c, l), -1.95 + i * 0.32, levels[0]));
  put(M.createTin(PALETTE.terracotta, PALETTE.gold), -0.1, levels[0]);
  const milk = new THREE.Group();
  part(milk, G.cyl(0.09, 0.09, 0.22, 16), toon(PALETTE.gold), { pos: [0, 0.11, 0] });
  part(milk, G.cyl(0.092, 0.092, 0.08, 16), toon(PALETTE.softWhite), { pos: [0, 0.11, 0], outline: false });
  put(milk, 0.35, levels[0]);
  put(M.createSteelTumblers(4), 0.7, levels[0]);
  put(M.createTin(PALETTE.leaf, PALETTE.cream, 0.22, 0.26, 0.18), 1.1, levels[0]);
  // upper shelf: goli soda bottles, candy jars, lantern
  for (let i = 0; i < 6; i++) put(M.createSodaBottle(), -1.95 + i * 0.16, levels[1]);
  put(M.createJar('#E2685A', PALETTE.gold, 0.09, 0.22), -0.7, levels[1]);
  put(M.createJar('#F0B848', PALETTE.terracotta, 0.09, 0.22), -0.42, levels[1]);
  put(M.createTin('#C8733A', PALETTE.cream, 0.3, 0.2, 0.2), 0.05, levels[1]);
  put(M.createLantern(), 0.55, levels[1]);
  // wall decor
  const cal = part(root, G.plane(0.42, 0.56), toonUnique('#ffffff', { map: calendarTexture() }), {
    pos: [1.6, FLOOR + 2.75, WALL.zBack + 0.035],
    outline: false,
  });
  cal.castShadow = false;
  const clock = M.createWallClock();
  clock.position.set(-0.9, FLOOR + 2.8, WALL.zBack + 0.05);
  root.add(clock);
}

// =================================================================== interior

function buildInterior(root: THREE.Object3D) {
  // prep table on the right
  const table = group(root, [2.3, FLOOR, -1.0]);
  const wood = toon(TONES.woodLight);
  part(table, G.box(1.3, 0.06, 0.7), wood, { pos: [0, 0.82, 0] });
  for (const x of [-0.58, 0.58]) for (const z of [-0.28, 0.28]) part(table, G.box(0.06, 0.79, 0.06), toon(PALETTE.wood), { pos: [x, 0.395, z] });
  const top = 0.85;
  const sack = M.createSack();
  sack.position.set(-0.4, top, -0.05);
  const can = M.createMilkCan();
  can.position.set(0.05, top, -0.1);
  const bowl = M.createSteelBowl('#E8D6A8');
  bowl.position.set(0.42, top, 0.12);
  table.add(sack, can, bowl);
  M.createCoconut(table, [0.42, top + 0.09, -0.18]);
  M.createCoconut(table, [0.28, top + 0.09, -0.24]);

  const basket = M.createBasket();
  basket.position.set(1.25, FLOOR, -1.95);
  const drum = new THREE.Group();
  part(drum, G.cyl(0.24, 0.24, 0.62, 20), toon(TONES.steel), { pos: [0, 0.31, 0] });
  for (const y of [0.12, 0.5]) part(drum, G.torus(0.243, 0.012, 4, 24), toon(TONES.steelDark), { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0], outline: false });
  part(drum, G.cyl(0.25, 0.25, 0.03, 20), toon(TONES.steelDark), { pos: [0, 0.635, 0] });
  M.createTeaGlass(drum, [0.08, 0.65, 0.05], 1, false);
  drum.position.set(0.45, FLOOR, -1.95);
  const rice = M.createSack('#D9C8A0');
  rice.position.set(-1.7, FLOOR, -1.95);
  root.add(basket, drum, rice);

  // banana bunch and snack packets hanging from the eave
  const bunch = M.createBananaBunch();
  bunch.position.set(-2.75, roofY(2.5) - 0.62, 2.5);
  const strip = M.createSnackStrip();
  strip.position.set(2.0, roofY(2.4) - 0.1, 2.4);
  root.add(bunch, strip);
}

// =================================================================== exterior

function buildExterior(root: THREE.Object3D) {
  const bench = M.createBench(1.8);
  bench.position.set(4.25, 0, 0.9);
  root.add(bench);
  const s1 = M.createStool();
  s1.position.set(-4.15, 0, 2.75);
  const s2 = M.createStool();
  s2.position.set(-4.7, 0, 1.65);
  root.add(s1, s2);
  M.createTeaGlass(bench, [0.05, 0.49, 0.5], 1, true);

  // stacked firewood along the left wall
  const log = toon(TONES.woodMid);
  const end = toon('#D4A877');
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 6 - r; i++) {
      const z = -1.9 + i * 0.22 + r * 0.11;
      const y = 0.09 + r * 0.17;
      part(root, G.cyl(0.085, 0.085, 0.9, 8), log, { pos: [-3.9, y, z], rot: [0, 0, Math.PI / 2] });
      part(root, G.circle(0.075, 8), end, { pos: [-3.44, y, z], rot: [0, Math.PI / 2, 0], outline: false });
    }
  }

  // bucket catching roof drips
  const bucket = group(root, [-3.55, 0, 3.05]);
  part(
    bucket,
    G.lathe('bucket', [
      [0, 0],
      [0.15, 0],
      [0.2, 0.32],
      [0.21, 0.33],
    ], 18),
    toon(TONES.steel, { side: THREE.DoubleSide }),
  );
  part(bucket, G.circle(0.19, 18), toon(PALETTE.rain), { pos: [0, 0.27, 0], rot: [-Math.PI / 2, 0, 0], outline: false });
  part(bucket, G.torus(0.2, 0.008, 4, 16, Math.PI), toon(PALETTE.charcoal), { pos: [0, 0.33, 0], outline: false });

  // chalkboard menu A-frame by the road
  const sign = group(root, [4.4, 0, 3.95], [0, -0.45, 0]);
  const board = new THREE.MeshBasicMaterial({ map: menuBoardTexture(), color: '#E6E0D2' });
  const wood = toon(PALETTE.wood);
  for (const s of [1, -1]) {
    const leaf = group(sign, [0, 0, s * 0.18], [s * -0.22, s === 1 ? 0 : Math.PI, 0]);
    part(leaf, G.box(0.66, 0.92, 0.04), [wood, wood, wood, wood, board, wood], { pos: [0, 0.52, 0] });
  }
}

// ======================================================================= bulb

function buildBulb(root: THREE.Object3D) {
  const x = -0.45;
  const z = 0.55;
  const top = roofY(z) - 0.08;
  const pivot = group(root, [x, top, z]);
  const drop = top - 3.32;
  part(pivot, G.cyl(0.008, 0.008, drop, 4), toon(PALETTE.charcoal), { pos: [0, -drop / 2, 0], outline: false });
  part(pivot, G.cyl(0.05, 0.2, 0.14, 20, true), toon(PALETTE.leaf, { side: THREE.DoubleSide }), { pos: [0, -drop, 0] });
  part(pivot, G.sphere(0.075, 14, 10), new THREE.MeshBasicMaterial({ color: TONES.bulb }), { pos: [0, -drop - 0.1, 0], shadow: false });
  const glow = glowSprite('#FFB860', 1.6, 0.55);
  glow.position.set(0, -drop - 0.1, 0);
  pivot.add(glow);
  const light = new THREE.PointLight('#FFB560', 7, 9, 1.3);
  light.position.set(0, -drop - 0.16, 0);
  pivot.add(light);
  return { pivot, light };
}
