import * as THREE from 'three';
import { PALETTE, TONES } from './palette';
import { G, group, limb, part, toon } from './toon';
import { RECIPES, RecipeId } from './recipes';

/** Customer cast, procedural models and the per-customer state machine. */

// ===================================================================== cast

export type CustomerTypeId = 'ammavan' | 'student' | 'auto' | 'tourist' | 'office' | 'aunty' | 'chakka';

export interface Look {
  skin: string;
  shirt: string;
  fullSleeve?: boolean;
  lower: 'pants' | 'mundu' | 'saree';
  lowerColor: string;
  border?: string;
  hair: 'short' | 'neat' | 'spiky' | 'bald' | 'bun';
  hairColor: string;
  width?: number;
  height?: number;
  belly?: boolean;
  moustache?: string;
  beard?: string;
  glasses?: boolean;
  backpack?: string;
  umbrella?: string;
  hat?: 'cap' | 'bucket';
  hatColor?: string;
  tie?: string;
  jacket?: string;
  camera?: boolean;
  jackfruit?: boolean;
  bindi?: boolean;
  flowers?: boolean;
  lanyard?: boolean;
  shoes: string;
}

export interface CustomerType {
  id: CustomerTypeId;
  name: string;
  weight: number;
  patience: number;
  favourites: RecipeId[];
  look: Look;
  lines: { order: string[]; happy: string[]; wrong: string[]; angry: string[]; impatient: string[] };
}

export const CUSTOMER_TYPES: CustomerType[] = [
  {
    id: 'ammavan',
    name: 'Ammavan',
    weight: 1.1,
    patience: 60,
    favourites: ['chaya', 'kattan', 'parippuvada', 'puttu'],
    look: {
      skin: '#B97C52', shirt: '#EDE3CC', lower: 'mundu', lowerColor: PALETTE.softWhite, border: PALETTE.gold,
      hair: 'bald', hairColor: '#D8D4C8', belly: true, moustache: '#E6E2D6', glasses: true, umbrella: '#2F2F2A', shoes: '#5A311E',
    },
    lines: {
      order: ['Mone, oru {item}. Madhuram kurachu mathi!', 'Oru {item} ingu poratte. Pathram evide?', '{item} undo? Pandokke ithinu rendu roopa aayirunnu!'],
      happy: ['Ha, kollam. Pazhaya ruchi thanne!', 'Mmm… ithu kollam mone.'],
      wrong: ['Ithu njan paranja item allallo!', 'Eda, njan {item} alle paranjathu?'],
      angry: ['Ee kadayil ini varilla!', 'Ente samayam kalanju!'],
      impatient: ['Mone, ithu ethra neram?', 'Ente kaalam kazhiyum…'],
    },
  },
  {
    id: 'student',
    name: 'College student',
    weight: 1.2,
    patience: 45,
    favourites: ['pazhampori', 'chaya', 'parippuvada', 'coffee'],
    look: {
      skin: '#C68B5C', shirt: '#E8B53E', lower: 'pants', lowerColor: '#3E5C86', hair: 'spiky', hairColor: PALETTE.charcoal,
      width: 0.92, backpack: '#DB6846', shoes: '#F2F2EC', umbrella: '#3E7FB1',
    },
    lines: {
      order: ['Chetta, class thudangum munpe oru {item}!', 'Oru {item}, vegam! Attendance pokum!', 'Chetta, {item} undo? Pocket money theernnu, but still!'],
      happy: ['Adipoli! Ini ivide thanne varum!', 'Poli sanam chetta!'],
      wrong: ['Chetta, ithalla! {item} aanu paranjathu!'],
      angry: ['Class poyi… bye chetta!'],
      impatient: ['Chetta, bell adikkarayi!', 'Vegam chetta, plz!'],
    },
  },
  {
    id: 'auto',
    name: 'Auto driver',
    weight: 1.1,
    patience: 40,
    favourites: ['chaya', 'kattan', 'pazhampori'],
    look: {
      skin: '#A86E45', shirt: '#B8A06A', fullSleeve: false, lower: 'pants', lowerColor: '#A89060', hair: 'short', hairColor: PALETTE.charcoal,
      moustache: PALETTE.charcoal, belly: true, shoes: '#3B2A1E',
    },
    lines: {
      order: ['Oru strong {item} vegam tharane!', 'Chetta, {item}. Stand-il savari undu!', 'Oru {item}, meter odunnu!'],
      happy: ['Ithanu sadhanam! Adipoli!', 'Ushaar! Ini savari odaam.'],
      wrong: ['Ayyo, ithalla chetta! {item}!'],
      angry: ['Savari poyi, njan pokunnu!'],
      impatient: ['Chetta, meter odunnundu!', 'Vegam, vegam!'],
    },
  },
  {
    id: 'tourist',
    name: 'Tourist',
    weight: 1.0,
    patience: 65,
    favourites: ['puttu', 'dosa', 'pazhampori', 'chaya'],
    look: {
      skin: '#E2B48E', shirt: '#F2EFE6', jacket: '#3E7FB1', fullSleeve: true, lower: 'pants', lowerColor: '#8C7B5E', hair: 'short',
      hairColor: '#8A5A2E', hat: 'bucket', hatColor: '#C9B98A', backpack: '#428B55', camera: true, shoes: '#6B4A2E',
    },
    lines: {
      order: ['Ivide famous item entha? Okay, one {item} please!', 'Chetta, {item} try cheyyanam! Very famous, right?', 'One {item}, and can I take a photo?'],
      happy: ['Wow, super tasty! Adipoli, right?', 'Best {item} in Munnar!'],
      wrong: ['Hmm, I think I ordered {item}?'],
      angry: ['Too slow… my bus is leaving!'],
      impatient: ['Is it coming soon?', 'Ente bus… sorry, my bus!'],
    },
  },
  {
    id: 'office',
    name: 'Office worker',
    weight: 1.0,
    patience: 38,
    favourites: ['coffee', 'dosa', 'chaya'],
    look: {
      skin: '#BF8558', shirt: '#A9C7E0', fullSleeve: true, lower: 'pants', lowerColor: '#3A3D46', hair: 'neat', hairColor: PALETTE.charcoal,
      glasses: true, tie: PALETTE.terracotta, lanyard: true, shoes: '#2A2A26', umbrella: '#27271F',
    },
    lines: {
      order: ['Meeting undu chetta, oru {item}, vegam!', 'Oru {item}, quick! Boss vilikkunnu!', '{item} please. Five minutes-il call undu!'],
      happy: ['Thanks chetta, meeting-il njan hero!', 'Super. Correct time!'],
      wrong: ['Chetta, {item} aanu! Time illa!'],
      angry: ['Meeting thudangi. Njan pokunnu!'],
      impatient: ['Chetta, late aakum!', 'Ente meeting…!'],
    },
  },
  {
    id: 'aunty',
    name: 'Local aunty',
    weight: 1.0,
    patience: 55,
    favourites: ['puttu', 'parippuvada', 'chaya', 'dosa'],
    look: {
      skin: '#B57A4E', shirt: '#7A2E3A', lower: 'saree', lowerColor: '#245C3C', border: PALETTE.gold, hair: 'bun', hairColor: PALETTE.charcoal,
      bindi: true, flowers: true, width: 1.05, umbrella: '#DB6846', shoes: '#834A2C',
    },
    lines: {
      order: ['Mone, oru {item}. Nalla choodode venam.', '{item} undo? Kazhinja thavana thanuthu poyi!', 'Oru {item}. Ente makan Dubai-il aanu, ariyamo?'],
      happy: ['Ha, ithanu shariyaya {item}!', 'Nannayi mone. Ishtappettu.'],
      wrong: ['Ithu ente order alla mone!'],
      angry: ['Ithrem neram kaathirunnu… venda!'],
      impatient: ['Mone, marannu poyo?', 'Ithu entha ithra thamasam?'],
    },
  },
  {
    id: 'chakka',
    name: 'Chakka Chettan',
    weight: 0.45,
    patience: 50,
    favourites: ['chaya', 'pazhampori', 'puttu', 'dosa', 'coffee', 'kattan', 'parippuvada'],
    look: {
      skin: '#A86E45', shirt: '#E2685A', lower: 'mundu', lowerColor: '#E8C341', border: '#245C3C', hair: 'short', hairColor: PALETTE.charcoal,
      beard: PALETTE.charcoal, jackfruit: true, shoes: '#5A311E',
    },
    lines: {
      order: ['Oru {item}! Ee chakka vilkkan pattumo?', 'Chakka season aanu! Oru {item} tharu.', 'Chetta, {item}. Chakka free tharam!'],
      happy: ['Chakka-yude peril nanni!', 'Adipoli! Chakka ninakku!'],
      wrong: ['Ithu chakka polum alla! {item} aanu!'],
      angry: ['Chakka-yum njanum pokunnu!'],
      impatient: ['Chakka bhaaram undu chetta!', 'Ente kai vedanikkunnu!'],
    },
  },
];

// ==================================================================== model

export type Mood = 'neutral' | 'happy' | 'angry' | 'worried';

export interface CustomerModel {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  legs: THREE.Group[];
  arms: THREE.Group[];
  hand: THREE.Group;
  umbrella: THREE.Group | null;
  holdsWithBothArms: boolean;
  setMood(m: Mood): void;
}

const PI = Math.PI;

export function createCustomerModel(look: Look): CustomerModel {
  const root = new THREE.Group();
  const body = group(root);
  const w = look.width ?? 1;
  const skin = toon(look.skin);
  const shirt = toon(look.jacket ?? look.shirt);
  const lower = toon(look.lowerColor);
  const dark = toon(PALETTE.charcoal);
  const hairM = toon(look.hairColor);

  // legs (pivot at the hip so they can swing)
  const legs: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const pivot = group(body, [s * 0.1, 0.8, 0]);
    if (look.lower === 'pants') limb(pivot, [0, 0, 0], [0, -0.7, 0], 0.08, lower);
    part(pivot, G.box(0.12, 0.07, 0.24), toon(look.shoes), { pos: [0, -0.765, 0.04] });
    legs.push(pivot);
  }
  if (look.lower === 'mundu' || look.lower === 'saree') {
    const saree = look.lower === 'saree';
    part(body, G.cyl(0.24, saree ? 0.31 : 0.28, 0.72, 20), lower, { pos: [0, 0.45, 0] });
    if (look.border) part(body, G.cyl(saree ? 0.313 : 0.283, saree ? 0.316 : 0.286, 0.07, 20), toon(look.border), { pos: [0, 0.13, 0] });
    part(body, G.torus(0.235, 0.035, 6, 20), lower, { pos: [0, 0.81, 0], rot: [PI / 2, 0, 0] });
  } else {
    part(body, G.cyl(0.22, 0.2, 0.18, 16), lower, { pos: [0, 0.82, 0], scale: [w, 1, 0.85] });
  }

  // torso
  part(body, G.capsule(0.23, 0.3, 6, 16), shirt, { pos: [0, 1.15, 0], scale: [w, 1, 0.8] });
  if (look.belly) part(body, G.sphere(0.24, 18, 12), shirt, { pos: [0, 1.0, 0.07], scale: [w, 0.9, 0.85] });
  if (look.jacket) {
    part(body, G.box(0.1, 0.5, 0.02), toon(look.shirt), { pos: [0, 1.17, 0.185], outline: false });
    part(body, G.box(0.03, 0.5, 0.02), toon(PALETTE.charcoal), { pos: [0, 1.17, 0.19], outline: false });
  }
  if (look.tie) {
    part(body, G.box(0.06, 0.34, 0.02), toon(look.tie), { pos: [0, 1.2, 0.19], rot: [-0.1, 0, 0] });
    part(body, G.sphere(0.035, 8, 6), toon(look.tie), { pos: [0, 1.38, 0.18] });
  }
  if (look.lanyard) {
    part(body, G.torus(0.13, 0.008, 4, 20, PI), toon(PALETTE.leaf), { pos: [0, 1.3, 0.13], rot: [0.35, 0, PI], outline: false });
    part(body, G.box(0.08, 0.1, 0.01), toon(PALETTE.softWhite), { pos: [0.05, 1.12, 0.2] });
  }
  if (look.lower === 'saree') {
    // pallu draped across the chest and over the shoulder
    part(body, G.box(0.16, 0.62, 0.03), lower, { pos: [-0.03, 1.15, 0.19], rot: [-0.05, 0, 0.55] });
    part(body, G.box(0.17, 0.035, 0.035), toon(look.border ?? PALETTE.gold), { pos: [-0.2, 0.92, 0.2], rot: [0, 0, 0.55], outline: false });
    part(body, G.box(0.16, 0.6, 0.03), lower, { pos: [-0.17, 1.15, -0.18], rot: [0.05, 0, -0.1] });
  }
  if (look.backpack) {
    const bp = toon(look.backpack);
    part(body, G.box(0.36 * w, 0.42, 0.18), bp, { pos: [0, 1.15, -0.26] });
    part(body, G.box(0.26, 0.16, 0.06), bp, { pos: [0, 1.05, -0.37] });
    for (const s of [-1, 1]) limb(body, [s * 0.13, 1.4, -0.16], [s * 0.15, 1.05, 0.16], 0.022, toon(PALETTE.charcoal));
  }
  if (look.camera) {
    part(body, G.box(0.15, 0.09, 0.07), dark, { pos: [0.02, 1.12, 0.24] });
    part(body, G.cyl(0.03, 0.03, 0.05, 10), toon(TONES.steelDark), { pos: [0.02, 1.12, 0.29], rot: [PI / 2, 0, 0] });
  }

  // arms (pivot at the shoulder)
  const arms: THREE.Group[] = [];
  let hand = new THREE.Group();
  for (const s of [-1, 1]) {
    const pivot = group(body, [s * 0.27 * w, 1.37, 0]);
    part(pivot, G.sphere(0.085, 12, 10), shirt, {});
    limb(pivot, [0, 0, 0], [s * 0.04, -0.28, 0], 0.07, shirt);
    limb(pivot, [s * 0.04, -0.28, 0], [s * 0.05, -0.5, 0.06], 0.057, look.fullSleeve ? shirt : skin);
    part(pivot, G.sphere(0.064, 10, 8), skin, { pos: [s * 0.05, -0.53, 0.07] });
    if (s === 1) hand = group(pivot, [0.05, -0.6, 0.1]);
    arms.push(pivot);
  }

  if (look.jackfruit) {
    const fruit = part(body, G.ico(0.27, 1), toon('#8DA13A'), { pos: [0, 1.0, 0.36], scale: [1, 1.25, 1] });
    for (let i = 0; i < 18; i++) {
      const a = i * 2.4;
      const y = ((i % 6) / 6 - 0.45) * 0.5;
      part(fruit, G.sphere(0.03, 6, 4), toon('#6F8530'), { pos: [Math.cos(a) * 0.25, y, Math.sin(a) * 0.25], outline: false });
    }
    arms.forEach((a, i) => a.rotation.set(-0.95, 0, (i === 0 ? 1 : -1) * 0.35));
  }

  // head
  part(body, G.cyl(0.075, 0.085, 0.14, 10), skin, { pos: [0, 1.52, 0] });
  const head = group(body, [0, 1.74, 0.01]);
  part(head, G.sphere(0.23, 22, 16), skin, { scale: [1, 1, 0.95] });
  const brows: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    part(head, G.sphere(0.055, 10, 8), skin, { pos: [s * 0.225, 0, -0.01], scale: [0.55, 1, 0.8] });
    part(head, G.sphere(0.03, 10, 8), dark, { pos: [s * 0.082, 0.03, 0.2], scale: [1, 1.25, 0.6] });
    part(head, G.sphere(0.01, 6, 6), toon(PALETTE.softWhite), { pos: [s * 0.082 + 0.01, 0.045, 0.218], outline: false });
    brows.push(part(head, G.box(0.085, 0.022, 0.026), toon(look.hairColor === '#D8D4C8' ? '#9A958A' : PALETTE.charcoal), { pos: [s * 0.085, 0.105, 0.198] }));
    if (look.moustache) limb(head, [s * 0.01, -0.065, 0.223], [s * 0.11, -0.09, 0.19], 0.026, toon(look.moustache));
  }
  part(head, G.sphere(0.045, 10, 8), toon(TONES.skinDark), { pos: [0, -0.015, 0.228], scale: [1, 0.85, 0.85] });

  // mouth expressions
  const mouthMat = toon('#6E2A1F');
  const smile = part(head, G.torus(0.042, 0.011, 6, 12, PI), mouthMat, { pos: [0, -0.115, 0.205], rot: [0, 0, PI], outline: false });
  const frown = part(head, G.torus(0.04, 0.011, 6, 12, PI), mouthMat, { pos: [0, -0.15, 0.2], outline: false });
  const flat = part(head, G.box(0.07, 0.016, 0.02), mouthMat, { pos: [0, -0.125, 0.205], outline: false });

  if (look.beard) part(head, G.sphere(0.17, 14, 10), toon(look.beard), { pos: [0, -0.12, 0.08], scale: [1.05, 0.75, 0.9] });
  if (look.glasses) {
    const frame = toon(PALETTE.charcoal);
    for (const s of [-1, 1]) part(head, G.torus(0.048, 0.009, 4, 16), frame, { pos: [s * 0.085, 0.03, 0.215], outline: false });
    part(head, G.box(0.05, 0.01, 0.01), frame, { pos: [0, 0.035, 0.225], outline: false });
  }
  if (look.bindi) part(head, G.sphere(0.014, 6, 6), toon(PALETTE.terracotta), { pos: [0, 0.1, 0.225], outline: false });

  // hair
  if (look.hair === 'bald') {
    part(head, G.sphere(0.245, 20, 10, 0, PI * 0.4), hairM, { pos: [0, 0, -0.02], rot: [-1.5, 0, 0] });
  } else {
    const tilt = look.hair === 'bun' ? -0.25 : look.hair === 'neat' ? -0.18 : -0.3;
    part(head, G.sphere(0.245, 20, 10, 0, PI * 0.46), hairM, { pos: [0, 0.01, -0.01], rot: [tilt, 0, 0] });
    if (look.hair === 'spiky') {
      for (let i = 0; i < 6; i++) part(head, G.cone(0.05, 0.13, 6), hairM, { pos: [(i - 2.5) * 0.06, 0.22, 0.02 - Math.abs(i - 2.5) * 0.02], rot: [0.3, 0, (i - 2.5) * 0.15] });
    }
    if (look.hair === 'neat') part(head, G.box(0.12, 0.04, 0.12), hairM, { pos: [0.06, 0.2, 0.1], rot: [0.5, 0, 0.2] });
    if (look.hair === 'bun') {
      part(head, G.sphere(0.1, 12, 10), hairM, { pos: [0, 0.02, -0.25] });
      if (look.flowers) for (let i = 0; i < 7; i++) {
        const a = -0.9 + i * 0.3;
        part(head, G.sphere(0.022, 6, 6), toon(PALETTE.softWhite), { pos: [Math.sin(a) * 0.11, 0.1 + Math.cos(a) * 0.03, -0.25 - Math.cos(a) * 0.03], outline: false });
      }
    }
  }
  if (look.hat === 'cap') {
    part(head, G.sphere(0.25, 18, 10, 0, PI * 0.5), toon(look.hatColor ?? PALETTE.leaf), { pos: [0, 0.03, 0] });
    part(head, G.box(0.24, 0.02, 0.17), toon(look.hatColor ?? PALETTE.leaf), { pos: [0, 0.07, 0.25] });
  } else if (look.hat === 'bucket') {
    const hm = toon(look.hatColor ?? '#C9B98A');
    part(head, G.cyl(0.19, 0.24, 0.16, 18), hm, { pos: [0, 0.2, -0.01] });
    part(head, G.cyl(0.36, 0.36, 0.02, 22), hm, { pos: [0, 0.12, -0.01] });
  }

  // umbrella for walking in the rain
  let umbrella: THREE.Group | null = null;
  if (look.umbrella) {
    umbrella = group(body, [0.3, 0, 0.24]);
    part(umbrella, G.cyl(0.014, 0.014, 1.5, 6), toon(PALETTE.charcoal), { pos: [0, 1.65, 0] });
    part(umbrella, G.sphere(0.72, 18, 6, 0, PI * 0.32), toon(look.umbrella, { side: THREE.DoubleSide }), { pos: [0, 2.15, 0] });
    part(umbrella, G.sphere(0.03, 6, 6), toon(PALETTE.charcoal), { pos: [0, 2.88, 0] });
    part(umbrella, G.torus(0.05, 0.012, 4, 10, PI), toon(PALETTE.charcoal), { pos: [0.05, 0.92, 0], rot: [0, 0, PI] });
  }

  const s = look.height ?? 1;
  root.scale.setScalar(s);

  return {
    root,
    body,
    head,
    legs,
    arms,
    hand,
    umbrella,
    holdsWithBothArms: !!look.jackfruit,
    setMood(m: Mood) {
      smile.visible = m === 'happy';
      frown.visible = m === 'angry' || m === 'worried';
      flat.visible = m === 'neutral';
      brows.forEach((b, i) => {
        const side = i === 0 ? -1 : 1;
        b.rotation.z = m === 'angry' ? side * 0.4 : m === 'worried' ? -side * 0.35 : m === 'happy' ? -side * 0.12 : 0;
      });
    },
  };
}

// ============================================================ state machine

export type CustomerState = 'arriving' | 'waiting' | 'served' | 'leaving' | 'gone';

const WALK_SPEED = 3.1;
const ROAD_IN_Z = 6.3;
const ROAD_OUT_Z = 5.4;
/** Customers stand under the eave; outside it they open umbrellas. */
const SHELTER_Z = 3.05;

let nextId = 1;

export class Customer {
  readonly id = nextId++;
  readonly model: CustomerModel;
  state: CustomerState = 'arriving';
  patience: number;
  patienceMax: number;
  wrongCount = 0;
  paid = false;
  resolved = false;
  line = '';
  lineTimer = 0;
  private path: THREE.Vector3[] = [];
  private anim: { kind: 'happy' | 'angry'; t: number } | null = null;
  private walkPhase = Math.random() * 10;
  private impatientSaid = false;
  private facing = 0;
  private leaveDelay = 0;
  /** When set (first-person view), waiting customers turn to face this point. */
  faceTarget: THREE.Vector3 | null = null;

  constructor(
    readonly type: CustomerType,
    readonly order: RecipeId,
    readonly slot: number,
    readonly slotPos: THREE.Vector3,
    patienceMul: number,
    fromSide: number,
  ) {
    this.model = createCustomerModel(type.look);
    this.model.setMood('neutral');
    this.patienceMax = this.patience = type.patience * patienceMul;
    const start = new THREE.Vector3(fromSide * 17, 0, ROAD_IN_Z);
    this.model.root.position.copy(start);
    this.path = [new THREE.Vector3(slotPos.x, 0, ROAD_IN_Z), slotPos.clone()];
    this.facing = fromSide > 0 ? -PI / 2 : PI / 2;
  }

  get position(): THREE.Vector3 {
    return this.model.root.position;
  }

  get waiting(): boolean {
    return this.state === 'waiting';
  }

  say(text: string, seconds = 4) {
    this.line = text;
    this.lineTimer = seconds;
  }

  react(kind: 'happy' | 'angry') {
    this.anim = { kind, t: 0 };
    this.model.setMood(kind);
  }

  /** Walk back to the road and off-screen. */
  leave(happy: boolean) {
    this.state = happy ? 'served' : 'leaving';
    if (!happy) this.react('angry');
    const side = this.position.x < 0 ? -1 : 1;
    this.path = [new THREE.Vector3(this.position.x, 0, ROAD_OUT_Z), new THREE.Vector3(side * 18, 0, ROAD_OUT_Z)];
    this.leaveDelay = 1.1;
  }

  update(dt: number, t: number) {
    const m = this.model;
    if (this.lineTimer > 0) this.lineTimer -= dt;

    let walking = false;
    if (this.leaveDelay > 0) {
      this.leaveDelay -= dt;
    } else if (this.path.length) {
      const target = this.path[0];
      const pos = this.position;
      const to = target.clone().sub(pos);
      to.y = 0;
      const d = to.length();
      const step = WALK_SPEED * dt;
      if (d <= step) {
        pos.copy(target);
        this.path.shift();
      } else {
        pos.addScaledVector(to.normalize(), step);
        this.facing = Math.atan2(to.x, to.z);
        walking = true;
      }
      if (!this.path.length) {
        if (this.state === 'arriving') {
          this.state = 'waiting';
          this.say(this.pickLine('order'), 5);
        } else if (this.state === 'served' || this.state === 'leaving') {
          this.state = 'gone';
        }
      }
    }

    if (this.state === 'waiting' && !walking) {
      // face the counter, turned a little towards the street camera
      this.facing = this.faceTarget
        ? Math.atan2(this.faceTarget.x - this.position.x, this.faceTarget.z - this.position.z)
        : PI - 0.45;
      const frac = this.patience / this.patienceMax;
      if (frac < 0.3 && !this.impatientSaid) {
        this.impatientSaid = true;
        this.say(this.pickLine('impatient'), 3);
        m.setMood('worried');
      }
    }

    // turn smoothly
    const diff = Math.atan2(Math.sin(this.facing - m.root.rotation.y), Math.cos(this.facing - m.root.rotation.y));
    m.root.rotation.y += diff * Math.min(1, dt * 8);

    // limbs
    const swing = walking ? Math.sin(t * 9 + this.walkPhase) * 0.55 : 0;
    m.legs[0].rotation.x = swing;
    m.legs[1].rotation.x = -swing;
    if (!m.holdsWithBothArms) {
      m.arms[0].rotation.x = -swing * 0.7;
      const umbrellaOut = !!m.umbrella && this.position.z > SHELTER_Z;
      m.arms[1].rotation.x = umbrellaOut ? -0.75 : swing * 0.7;
      if (m.umbrella) m.umbrella.visible = umbrellaOut;
    }
    m.body.position.y = walking ? Math.abs(Math.sin(t * 9 + this.walkPhase)) * 0.045 : Math.sin(t * 2 + this.walkPhase) * 0.008;
    m.head.rotation.y = walking ? 0 : Math.sin(t * 0.6 + this.walkPhase) * 0.25;
    m.head.rotation.z = 0;

    // reactions
    if (this.anim) {
      this.anim.t += dt;
      const k = this.anim.t;
      if (this.anim.kind === 'happy') {
        m.body.position.y += Math.abs(Math.sin(k * 11)) * 0.16 * Math.max(0, 1 - k / 1.1);
      } else {
        m.head.rotation.y = Math.sin(k * 22) * 0.35 * Math.max(0, 1 - k / 0.9);
      }
      if (k > 1.2) {
        this.anim = null;
        if (this.state === 'waiting') m.setMood(this.patience / this.patienceMax < 0.3 ? 'worried' : 'neutral');
      }
    }
  }

  pickLine(kind: keyof CustomerType['lines'], itemName?: string): string {
    const list = this.type.lines[kind];
    const line = list[Math.floor(Math.random() * list.length)];
    return line.replace('{item}', itemName ?? RECIPES[this.order].name);
  }
}
