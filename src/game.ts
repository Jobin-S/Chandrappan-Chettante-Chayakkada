import * as THREE from 'three';
import { CookingSession } from './cooking';
import { CookMode, RECIPES, RecipeId } from './recipes';
import { CUSTOMER_TYPES, Customer, CustomerType } from './customers';
import { CounterItem, ServingCounter } from './food';
import { Picker, Pickable } from './interactions';
import { CookingPanel, PanelView } from './cookingPanel';
import { QUEUE_SLOTS, SERVE_SLOTS, Shop } from './shop';
import { UPGRADES, UpgradeId } from './upgrades';
import { CustomerPuppet } from './mirror';
import type { CameraDirector } from './camera';
import type { Rain } from './effects';
import type { GameOverStats, Hud } from './ui';
import type { Station, StationId } from './types';
import type { ResultsView } from './screens';
import type { Sfx } from './audio';
import type { CustSnap, GameEvent, Intent, ItemSnap, Phase, PlayerSnap, SessionSnap, Snapshot } from './protocol';
import { RunSave, clearRun, saveRun } from './storage';

export type { Phase } from './protocol';

/**
 * Central game state and rules: business days, spawning, cooking, serving,
 * money, reputation, upgrades, pause and game over.
 *
 * Multiplayer: in 'solo' and 'host' roles this class runs the shop. Every
 * player has their own cooking session and their own hands; guests send
 * intents which the host applies on their behalf. In the 'guest' role it
 * mirrors the host's snapshots and forwards the local player's intents.
 */

const MAX_REP = 5;
const STREAK_BONUS = 5;
/** Difficulty – tuned to be relaxed and forgiving. */
const EASY = {
  patienceMul: 1.6,
  cookSpeed: 1.3,
  firstSpawn: 3,
  spawnMin: 11,
  spawnRange: 5,
  spawnFloor: 7,
};
/** Co-op: customers come a little faster with more cooks. */
const MULTI_SPAWN = [1, 1, 0.8, 0.7, 0.62];
/** How close you must be to use a station or serve someone. */
const REACH_STATION = 3.8;
const REACH_SERVE = 4.8;
const SNAPSHOT_HZ = 12;

export type NetRole = 'solo' | 'host' | 'guest';

export const dayQuota = (day: number) => Math.min(12, 6 + (day - 1) * 2);

interface Flight {
  model: THREE.Object3D;
  from: THREE.Vector3;
  customer: Customer;
  t: number;
}

export interface Player {
  id: string;
  name: string;
  shirt: string;
  apron: string;
  session: CookingSession | null;
  held: CounterItem | null;
  /** Eye position and facing. */
  pos: THREE.Vector3;
  yaw: number;
}

export interface RemotePlayer {
  id: string;
  name: string;
  shirt: string;
  apron: string;
  pos: THREE.Vector3;
  yaw: number;
}

/** What the game needs from the network (implemented in main over Net). */
export interface GameLink {
  toHost(msg: Record<string, unknown>): void;
  toPlayer(id: string, msg: Record<string, unknown>): void;
  broadcast(msg: Record<string, unknown>, unreliable?: boolean): void;
}

export interface GameEvents {
  onDayEnd(v: ResultsView): void;
  onGameOver(): void;
  /** Big event banner (Customer Rush); null hides it. */
  onEvent(text: string | null, frac: number): void;
  sfx(name: Sfx): void;
  /** Guests: the host changed weather / shop look / phase. */
  onHeavyRain(on: boolean): void;
  onShopLook(name: string, trim: string): void;
  onDayStart(): void;
  onWaiting(): void;
}

const RUSH_SECONDS = 30;
const RUSH_BONUS = 3;
const RUSH_TEXT = 'Chayakkadayil innu nalla thirakku!';

export const FUNNY_LINES = [
  'Chetta, ivide WiFi undo? Password "chaya123" aano?',
  'Ee mazha ini eppo theerum, chetta?',
  'Ningalude chaya kudichal pinne vere chaya venda!',
  'Pazhampori-kku ithrem valuppam evide ninnu padichu?',
  'Chetta, ee kadakku Instagram page undo?',
  'Munnar-il ithrem nalla chaya vere evideyum kittilla!',
  'Mazha kandappo thanne chaya ormma vannu!',
  'Ente diet naale muthal aanu. Innu oru pazhampori koodi!',
];

/** Common shape for customers on the host (Customer) and guests (CustomerPuppet). */
interface CustomerView {
  id: number;
  name: string;
  order: RecipeId;
  frac: number;
  wrong: boolean;
  waiting: boolean;
  arriving: boolean;
  line: string | null;
  position: THREE.Vector3;
  scale: number;
}

export class Game {
  role: NetRole = 'solo';
  localId = 'local';
  players = new Map<string, Player>();
  private link: GameLink | null = null;

  phase: Phase = 'menu';
  shopName = '';
  trim = '#245C3C';
  money = 0;
  reputation = MAX_REP;
  day = 1;
  level = 1;
  streak = 0;
  completed = 0;
  lost = 0;
  earnings = 0;
  today = { completed: 0, lost: 0, earnings: 0, spawned: 0, handled: 0, bonus: 0 };
  owned = new Set<UpgradeId>();
  heavyRain = false;
  rush: { t: number } | null = null;
  private rushPlannedAt = -1;
  private announced = new Set<number>();
  private dayStart: RunSave | null = null;
  paused = false;
  mode: CookMode = 'simple';
  /** Portions per cook – bulk cooking for busy moments. */
  batch = 1;

  openStation: Station | null = null;
  customers: Customer[] = [];

  private spawnTimer = EASY.firstSpawn;
  private dayEndTimer = -1;
  private flights: Flight[] = [];
  private counter: ServingCounter;
  private panel: CookingPanel;
  private stationPick = new Map<string, Pickable>();
  private v = new THREE.Vector3();
  private snapTimer = 0;
  private snapDirty = false;
  private overStats: GameOverStats | null = null;
  private heldKey = '';

  // guest mirror state
  private puppets = new Map<number, CustomerPuppet>();
  private guestSession: CookingSession | null = null;
  private guestSessionKey = '';
  private guestHeld: number | null = null;
  private remoteSnaps: PlayerSnap[] = [];
  private lastSnap: Snapshot | null = null;
  private itemKeys = new Map<number, string>();

  constructor(
    private scene: THREE.Scene,
    private camera: THREE.Camera,
    private dom: HTMLElement,
    private shop: Shop,
    private picker: Picker,
    private hud: Hud,
    private director: CameraDirector,
    private rain: Rain,
    private events: GameEvents,
  ) {
    this.counter = new ServingCounter(scene, SERVE_SLOTS);
    for (const s of shop.stations) {
      const p: Pickable = { kind: 'station', key: `station:${s.id}`, root: s.root, ringRadius: s.ringRadius };
      this.stationPick.set(s.id, p);
      picker.add(p);
    }
    this.panel = new CookingPanel(hud.layer, {
      onChoose: (r) => this.intent('start', { r, m: this.mode, b: this.batch }),
      onAction: (a) => this.intent('act', { a }),
      onCollect: () => this.intent('collect', {}),
      onDiscard: () => this.intent('discard', {}),
      onClose: () => this.closePanel(),
      onMode: (m) => {
        this.mode = m;
        this.refreshPanel();
      },
      onBatch: (n) => {
        this.batch = n;
        this.refreshPanel();
      },
      onGoTo: (id) => {
        const st = this.shop.stations.find((s) => s.id === id);
        if (st) this.openPanel(st);
      },
    });
    this.players.set(this.localId, this.newPlayer(this.localId, 'You', '#5E93B6', '#DB6846'));
  }

  private newPlayer(id: string, name: string, shirt: string, apron: string): Player {
    return { id, name, shirt, apron, session: null, held: null, pos: new THREE.Vector3(-0.5, 2.3, -0.05), yaw: 0 };
  }

  // ------------------------------------------------------------ roles & net

  get isGuest() {
    return this.role === 'guest';
  }
  get isAuthority() {
    return this.role !== 'guest';
  }
  get multiplayer() {
    return this.role !== 'solo';
  }

  /** Switch between solo / host / guest. Keeps the local player's look. */
  setRole(role: NetRole, localId: string, link: GameLink | null) {
    const me = this.me;
    this.role = role;
    this.link = link;
    this.players.clear();
    this.localId = localId;
    this.players.set(localId, { ...me, id: localId, session: null, held: null });
    this.remoteSnaps = [];
    this.clearPuppets();
  }

  setLocalLook(name: string, shirt: string, apron: string) {
    const me = this.me;
    me.name = name;
    me.shirt = shirt;
    me.apron = apron;
  }

  get me(): Player {
    return this.players.get(this.localId)!;
  }

  /** Every frame: where the local player is (camera eye + facing). */
  setLocalPose(eye: THREE.Vector3, yaw: number) {
    this.me.pos.copy(eye);
    this.me.yaw = yaw;
  }

  /** Host: a guest said hello. */
  addPlayer(id: string, name: string, shirt: string, apron: string) {
    if (!this.isAuthority) return;
    this.players.set(id, this.newPlayer(id, name, shirt, apron));
    this.tellAll({ k: 'toast', text: `${name} joined the shop!`, kind: 'gold' });
    this.snapDirty = true;
  }

  /** Host: a guest left – free their hands and station. */
  removePlayer(id: string) {
    const p = this.players.get(id);
    if (!p || id === this.localId) return;
    if (p.held) p.held.held = false;
    this.players.delete(id);
    this.updateBusyStations();
    this.tellAll({ k: 'toast', text: `${p.name} left the shop.`, kind: 'info' });
    this.snapDirty = true;
  }

  /** Host: receive a guest's message. */
  onNetMessage(from: string, msg: Record<string, unknown>) {
    if (this.isAuthority) {
      const p = this.players.get(from);
      if (msg.t === 'pose' && p) {
        p.pos.set(Number(msg.x), Number(msg.y), Number(msg.z));
        p.yaw = Number(msg.yaw);
      } else if (msg.t === 'act' && p) {
        this.apply(from, msg.a as Intent, (msg.args ?? {}) as Record<string, unknown>);
      }
    } else {
      if (msg.t === 'snap') this.applySnapshot(msg as unknown as Snapshot);
      else if (msg.t === 'ev') this.handleEvent(msg.ev as GameEvent);
    }
  }

  /** Remote players to draw as avatars (everyone except me). */
  remotePlayers(): RemotePlayer[] {
    if (this.isAuthority)
      return [...this.players.values()].filter((p) => p.id !== this.localId).map((p) => ({ ...p, pos: p.pos.clone() }));
    return this.remoteSnaps.map((p) => ({ id: p.id, name: p.name, shirt: p.shirt, apron: p.apron, pos: new THREE.Vector3(p.x, p.y, p.z), yaw: p.yaw }));
  }

  // ------------------------------------------------------------- feedback

  private handleEvent(ev: GameEvent) {
    switch (ev.k) {
      case 'panel':
        if (this.panel.isOpen) this.panel.say(ev.text, ev.tone);
        break;
      case 'toast':
        this.hud.toast(ev.text, ev.kind);
        break;
      case 'sfx':
        this.events.sfx(ev.name as Sfx);
        break;
      case 'float': {
        const s = this.toScreen(this.v.set(ev.x, ev.y, ev.z));
        if (s.visible) this.hud.floatText(ev.text, s.x, s.y, ev.kind);
        break;
      }
      case 'look':
        this.director.lookAt(new THREE.Vector3(ev.x, ev.y, ev.z));
        break;
      case 'close':
        this.closePanel();
        break;
    }
  }

  /** Feedback for one player (local or remote). */
  private tell(pid: string, ev: GameEvent) {
    if (pid === this.localId) this.handleEvent(ev);
    else this.link?.toPlayer(pid, { t: 'ev', ev });
  }

  /** Feedback for everyone in the shop. */
  private tellAll(ev: GameEvent) {
    this.handleEvent(ev);
    if (this.role === 'host') this.link?.broadcast({ t: 'ev', ev });
  }

  private sfxAll(name: Sfx) {
    this.tellAll({ k: 'sfx', name });
  }

  // ------------------------------------------------------------------ input

  private get patienceBonus() {
    return this.owned.has('roof') ? 10 : 0;
  }
  private get cookSpeed() {
    return EASY.cookSpeed * (this.owned.has('stove') ? 1.25 : 1);
  }
  private get queueSize() {
    return this.owned.has('seating') ? 4 : 3;
  }
  /** Customers expected today (host spawns and rush add bonus ones). */
  get quota() {
    return dayQuota(this.day) + this.today.bonus;
  }
  private get playing() {
    return this.phase === 'playing' && !this.paused;
  }

  hover(p: Pickable | null, x: number, y: number) {
    this.hud.setTooltip(p && this.phase === 'playing' ? this.describe(p) : null, x, y);
  }

  click(p: Pickable | null) {
    if (!this.playing || !p) return;
    if (p.kind === 'station') {
      const st = this.shop.stations.find((s) => `station:${s.id}` === p.key);
      if (!st) return;
      if (!this.within(st.root.getWorldPosition(this.v), REACH_STATION)) {
        this.hud.toast(`Walk closer to the ${st.name}.`, 'info');
        return;
      }
      this.openPanel(st);
    } else if (p.kind === 'item') {
      const uid = Number(p.key.split(':')[1]);
      this.pickItem(uid);
    } else if (p.kind === 'customer') {
      this.serveId(Number(p.key.split(':')[1]));
    }
  }

  private within(p: THREE.Vector3, reach: number) {
    const me = this.me.pos;
    return Math.hypot(p.x - me.x, p.z - me.z) <= reach;
  }

  /** HUD shortcut / 3D click: pick up or put down a counter item. */
  pickItem(uid: number) {
    if (!this.playing) return;
    if (this.localHeld()?.uid === uid) this.intent('drop', {});
    else this.intent('pick', { uid });
  }

  putDown() {
    if (this.localHeld()) this.intent('drop', {});
  }

  serveId(id: number) {
    if (!this.playing) return;
    const view = this.views().find((c) => c.id === id);
    if (!view || !view.waiting) return;
    if (!this.within(view.position, REACH_SERVE)) {
      this.hud.toast(`Walk closer to serve the ${view.name}.`, 'info');
      return;
    }
    this.intent('serve', { id });
  }

  escape() {
    if (this.panel.isOpen) this.closePanel();
    else if (this.localHeld()) this.putDown();
  }

  togglePause() {
    if (this.phase !== 'playing' || this.isGuest) return;
    this.paused = !this.paused;
    this.picker.enabled = !this.paused;
    this.hud.setPaused(this.paused, true);
    this.snapDirty = true;
  }

  /** First person: 1 = look at the counter/customers, 2 = look at the kitchen. */
  look(where: 'counter' | 'kitchen') {
    if (where === 'counter') this.director.lookAt(new THREE.Vector3(0.6, 1.75, 2.9));
    else this.director.lookAt(new THREE.Vector3(-2.7, 1.15, 0.4));
  }

  /** Send an intent to the host, or apply it locally when we are the authority. */
  private intent(name: Intent, args: Record<string, unknown>) {
    if (!this.playing) return;
    if (this.isGuest) this.link?.toHost({ t: 'act', a: name, args });
    else {
      this.apply(this.localId, name, args);
      this.refreshPanel();
    }
  }

  private localSession(): CookingSession | null {
    return this.isGuest ? this.guestSession : this.me.session;
  }

  private localHeld(): CounterItem | null {
    if (!this.isGuest) return this.me.held;
    return this.counter.list().find((i) => i.uid === this.guestHeld) ?? null;
  }

  private views(): CustomerView[] {
    if (this.isGuest) {
      return [...this.puppets.values()].map((p) => ({
        id: p.id,
        name: p.type.name,
        order: p.snap.o,
        frac: p.snap.f,
        wrong: p.snap.w,
        waiting: p.waiting,
        arriving: p.snap.st === 'arriving',
        line: p.snap.ln,
        position: p.position,
        scale: p.model.root.scale.y,
      }));
    }
    return this.customers.map((c) => ({
      id: c.id,
      name: c.type.name,
      order: c.order,
      frac: c.patience / c.patienceMax,
      wrong: c.wrongCount > 0,
      waiting: c.waiting,
      arriving: c.state === 'arriving',
      line: c.lineTimer > 0 ? c.line : null,
      position: c.position,
      scale: c.model.root.scale.y,
    }));
  }

  private describe(p: Pickable): string {
    const held = this.localHeld();
    if (p.kind === 'station') {
      const st = this.shop.stations.find((s) => `station:${s.id}` === p.key)!;
      const s = this.localSession();
      const other = this.stationUser(st.id);
      if (s?.station === st.id) return `${st.name} — cooking ${s.recipe.name}`;
      if (other) return `${st.name} — ${other} is cooking here`;
      return `${st.name} — click to cook`;
    }
    if (p.kind === 'item') {
      const item = this.counter.list().find((i) => `item:${i.uid}` === p.key);
      if (!item) return '';
      return held === item ? 'Click to put it down' : `${RECIPES[item.recipe].name} — click to pick up`;
    }
    const c = this.views().find((x) => `cust:${x.id}` === p.key);
    if (!c) return '';
    if (!c.waiting) return c.name;
    return held ? `Serve ${RECIPES[held.recipe].name} to ${c.name}` : `${c.name} wants ${RECIPES[c.order].name}`;
  }

  /** Name of another player cooking at this station, if any. */
  private stationUser(id: StationId): string | null {
    if (this.isGuest) return this.remoteSnaps.find((p) => p.s && RECIPES[p.s.r].station === id)?.name ?? null;
    for (const p of this.players.values()) if (p.id !== this.localId && p.session?.station === id) return p.name;
    return null;
  }

  // ---------------------------------------------------------------- cooking

  private panelView(st: Station): PanelView {
    const wanted: Partial<Record<RecipeId, number>> = {};
    for (const c of this.views()) if (c.waiting) wanted[c.order] = (wanted[c.order] ?? 0) + 1;
    const s = this.localSession();
    const busyAt =
      s && s.station !== st.id ? { id: s.station, name: this.shop.stations.find((x) => x.id === s.station)!.name } : null;
    const other = this.stationUser(st.id);
    return {
      station: st,
      mode: this.mode,
      session: s && s.station === st.id ? s : null,
      busyAt,
      lockedBy: !s && other ? other : null,
      wanted,
      counterFull: this.counter.full,
      batch: this.batch,
    };
  }

  private openPanel(st: Station) {
    if (this.openStation) this.picker.mark(`station:${this.openStation.id}`, null);
    this.openStation = st;
    const p = this.stationPick.get(st.id)!;
    this.picker.focus(p);
    this.picker.mark(p.key, 'selected');
    this.panel.open(this.panelView(st), this.localSession()?.station === st.id ? 'Welcome back! Keep cooking.' : '');
    this.hud.setPanelOpen(true);
    // first person: turn so the station sits above the panel
    this.director.lookAt(st.root.getWorldPosition(new THREE.Vector3()), -0.38);
  }

  closePanel() {
    if (this.openStation) this.picker.mark(`station:${this.openStation.id}`, null);
    this.openStation = null;
    this.picker.focus(null);
    this.panel.close();
    this.hud.setPanelOpen(false);
  }

  private refreshPanel() {
    if (this.openStation && this.panel.isOpen) this.panel.render(this.panelView(this.openStation));
  }

  // ------------------------------------------------- authoritative actions

  private apply(pid: string, name: Intent, a: Record<string, unknown>) {
    const p = this.players.get(pid);
    if (!p || !this.playing) return;
    switch (name) {
      case 'start':
        return this.applyStart(p, a.r as RecipeId, a.m as CookMode, Number(a.b) || 1);
      case 'act':
        return this.applyAct(p, String(a.a));
      case 'collect':
        return this.applyCollect(p);
      case 'discard':
        return this.applyDiscard(p);
      case 'pick': {
        const item = this.counter.list().find((i) => i.uid === Number(a.uid));
        if (item) this.pickUp(p, item);
        return;
      }
      case 'drop':
        return this.drop(p);
      case 'serve': {
        const c = this.customers.find((x) => x.id === Number(a.id));
        if (c) this.serve(p, c);
        return;
      }
    }
  }

  private applyStart(p: Player, id: RecipeId, mode: CookMode, batch: number) {
    if (p.session) return;
    const r = RECIPES[id];
    if (!r) return;
    for (const o of this.players.values()) {
      if (o !== p && o.session?.station === r.station) {
        this.tell(p.id, { k: 'panel', text: `${o.name} is cooking at this station. Try another one!`, tone: 'bad' });
        return;
      }
    }
    p.session = new CookingSession(r, mode === 'advanced' ? 'advanced' : 'simple', this.cookSpeed, [1, 3, 5].includes(batch) ? batch : 1);
    this.updateBusyStations();
    this.tell(p.id, { k: 'sfx', name: 'ignite' });
    this.tell(p.id, {
      k: 'panel',
      text: mode === 'simple' ? `Let's make ${r.name}! Prepare, then ${r.cookVerb.toLowerCase()}.` : `Let's make ${r.name}! Click the steps in order.`,
      tone: 'info',
    });
    this.snapDirty = true;
  }

  private applyAct(p: Player, action: string) {
    const s = p.session;
    if (!s) return;
    const res = s.act(action);
    const sfx: Sfx = !res.ok ? 'error' : s.timer ? (s.station === 'fryer' || s.station === 'tawa' ? 'sizzle' : 'boil') : action === 'pour' ? 'pour' : 'step';
    this.tell(p.id, { k: 'sfx', name: sfx });
    this.tell(p.id, { k: 'panel', text: res.message, tone: res.ok ? (s.done ? 'good' : 'info') : 'bad' });
    this.snapDirty = true;
  }

  private applyCollect(p: Player) {
    const s = p.session;
    if (!s || !s.done) return;
    if (this.counter.full) {
      this.tell(p.id, { k: 'panel', text: 'The counter is full! Serve someone first.', tone: 'bad' });
      return;
    }
    const item = this.counter.place(s.recipe.id, s.batch)!;
    this.picker.add({ kind: 'item', key: `item:${item.uid}`, root: item.model });
    this.tell(p.id, { k: 'sfx', name: s.recipe.station === 'chaya' ? 'pour' : 'clink' });
    p.session = null;
    this.updateBusyStations();
    // easy mode: it goes straight into the cook's hand
    if (!p.held) this.pickUp(p, item);
    const who = this.customers.find((c) => c.waiting && c.order === s.recipe.id);
    const name = `${s.recipe.name}${s.batch > 1 ? ` ×${s.batch}` : ''}`;
    if (p.held === item) {
      this.tell(p.id, { k: 'close' });
      this.tell(p.id, { k: 'toast', text: `${name} in hand! Now click ${who ? `the ${who.type.name}` : 'the customer'}.`, kind: 'good' });
      if (who) this.tell(p.id, { k: 'look', x: who.position.x, y: 1.6, z: who.position.z });
    } else this.tell(p.id, { k: 'panel', text: `${name} is on the counter.`, tone: 'good' });
    this.snapDirty = true;
  }

  private applyDiscard(p: Player) {
    if (!p.session) return;
    const name = p.session.recipe.name;
    p.session = null;
    this.updateBusyStations();
    this.tell(p.id, { k: 'panel', text: `${name} discarded. Start again?`, tone: 'info' });
    this.snapDirty = true;
  }

  private updateBusyStations() {
    const ids: StationId[] = [];
    if (this.isGuest) {
      if (this.guestSession) ids.push(this.guestSession.station);
      for (const p of this.remoteSnaps) if (p.s) ids.push(RECIPES[p.s.r].station);
    } else for (const p of this.players.values()) if (p.session) ids.push(p.session.station);
    this.shop.setStationsBusy(ids);
  }

  // ---------------------------------------------------------------- serving

  private pickUp(p: Player, item: CounterItem) {
    for (const o of this.players.values()) {
      if (o !== p && o.held === item) {
        this.tell(p.id, { k: 'toast', text: `${o.name} is holding that.`, kind: 'info' });
        return;
      }
    }
    if (p.held) this.drop(p);
    p.held = item;
    item.held = true;
    this.snapDirty = true;
  }

  private drop(p: Player) {
    if (!p.held) return;
    const item = p.held;
    p.held = null;
    item.held = [...this.players.values()].some((o) => o.held === item);
    this.snapDirty = true;
  }

  private serve(p: Player, c: Customer) {
    if (!this.playing || !c.waiting || c.resolved) return;
    if (!p.held) {
      // easy mode: their dish is already waiting on the counter – hand it over
      const free = this.counter.list().filter((i) => i.recipe === c.order && ![...this.players.values()].some((o) => o.held === i));
      if (!free.length) {
        this.tell(p.id, { k: 'toast', text: `${c.type.name} wants ${RECIPES[c.order].name}. Cook it first!`, kind: 'info' });
        return;
      }
      this.pickUp(p, free[0]);
    }
    const item = p.held!;
    if (item.recipe === c.order) {
      // one portion leaves the batch and flies into the customer's hand
      p.held = null;
      item.held = false;
      const { portion, emptied } = this.counter.takeOne(item);
      this.picker.remove(`item:${item.uid}`);
      if (!emptied) {
        this.picker.add({ kind: 'item', key: `item:${item.uid}`, root: item.model });
        this.pickUp(p, item); // keep holding the rest of the batch
      }
      this.flights.push({ model: portion, from: portion.position.clone(), customer: c, t: 0 });
      c.resolved = true;
      c.carry = c.order;
      if (!c.paid) {
        c.paid = true;
        const price = RECIPES[c.order].price;
        this.money += price;
        this.earnings += price;
        this.completed++;
        this.today.completed++;
        this.today.earnings += price;
        this.streak++;
        this.floatAll(c, `+${price}`, 'gold');
        this.sfxAll('clink');
        this.sfxAll('coin');
        this.sfxAll('success');
        if (this.multiplayer) this.tellAll({ k: 'toast', text: `${p.name} served ${RECIPES[c.order].name} (+₹${price})`, kind: 'good' });
        if (this.streak % STREAK_BONUS === 0 && this.reputation < MAX_REP) {
          this.reputation++;
          this.tellAll({ k: 'toast', text: `${STREAK_BONUS} happy customers in a row! Reputation +1 ♥`, kind: 'gold' });
        }
      }
      c.react('happy');
      c.say(c.pickLine('happy'), 3);
      c.leave(true);
    } else {
      // wrong dish: the customer refuses and it stays in your hand
      c.wrongCount++;
      this.sfxAll('bad');
      if (c.wrongCount === 1) {
        c.react('angry');
        c.say(c.pickLine('wrong'), 3.5);
        this.tell(p.id, { k: 'toast', text: `Wrong order! ${c.type.name} wanted ${RECIPES[c.order].name}. One more chance.`, kind: 'bad' });
      } else {
        this.fail(c, 'Wrong order again!');
      }
    }
    this.snapDirty = true;
  }

  private fail(c: Customer, why: string) {
    if (c.resolved) return;
    c.resolved = true;
    this.reputation = Math.max(0, this.reputation - 1);
    this.streak = 0;
    this.lost++;
    this.today.lost++;
    c.say(c.pickLine('angry'), 3);
    c.leave(false);
    this.floatAll(c, '−1 ♥', 'bad');
    this.sfxAll('bad');
    this.tellAll({ k: 'toast', text: `${why} ${c.type.name} left unhappy. −1 ♥`, kind: 'bad' });
    this.snapDirty = true;
    if (this.reputation <= 0) this.gameOver();
  }

  private floatAll(c: Customer, text: string, kind: 'gold' | 'bad') {
    this.tellAll({ k: 'float', text, kind, x: c.position.x, y: 2.0, z: c.position.z });
  }

  // --------------------------------------------------------------- spawning

  private freeSlot(): number {
    const taken = new Set(this.customers.filter((c) => c.state === 'arriving' || c.state === 'waiting').map((c) => c.slot));
    const free = QUEUE_SLOTS.slice(0, this.queueSize)
      .map((_, i) => i)
      .filter((i) => !taken.has(i));
    return free.length ? free[Math.floor(Math.random() * free.length)] : -1;
  }

  private pickType(): CustomerType {
    const total = CUSTOMER_TYPES.reduce((s, t) => s + t.weight, 0);
    let r = Math.random() * total;
    for (const t of CUSTOMER_TYPES) if ((r -= t.weight) <= 0) return t;
    return CUSTOMER_TYPES[0];
  }

  /**
   * The bus stopped next door: up to `count` passengers come over as
   * customers (if the day still needs them). Returns how many came.
   */
  busArrived(door: THREE.Vector3, count: number): number {
    if (!this.playing || this.isGuest) return 0;
    let n = 0;
    for (let i = 0; i < count && this.today.spawned < this.quota; i++) {
      const c = this.spawn(undefined, door.clone().add(new THREE.Vector3((i - 1) * 0.45, 0, 0)));
      if (!c) break;
      n++;
    }
    if (n) this.tellAll({ k: 'toast', text: n > 1 ? `${n} new customers off the bus!` : 'A customer hops off the bus!', kind: 'info' });
    return n;
  }

  spawn(type?: CustomerType, start?: THREE.Vector3): Customer | null {
    if (this.isGuest) return null;
    const slot = this.freeSlot();
    if (slot < 0) return null;
    const t = type ?? this.pickType();
    const order = t.favourites[Math.floor(Math.random() * t.favourites.length)];
    const pos = QUEUE_SLOTS[slot];
    const side = pos.x + (Math.random() - 0.5) * 3 < 0 ? -1 : 1;
    const mul = EASY.patienceMul + this.patienceBonus / t.patience;
    const c = new Customer(t, order, slot, pos, mul, side, start);
    this.scene.add(c.model.root);
    this.customers.push(c);
    this.picker.add({ kind: 'customer', key: `cust:${c.id}`, root: c.model.root });
    this.today.spawned++;
    this.pushStats();
    return c;
  }

  // ------------------------------------------------------------ host + events

  /** Host: bring a specific customer now (adds to today's count). */
  hostSpawn(typeId: string): boolean {
    if (this.phase !== 'playing' || this.isGuest) return false;
    const t = CUSTOMER_TYPES.find((x) => x.id === typeId);
    if (!t) return false;
    if (this.freeSlot() < 0) {
      this.hud.toast('The queue is full! Serve someone first.', 'info');
      return false;
    }
    this.today.bonus++;
    this.spawn(t);
    this.tellAll({ k: 'toast', text: `${t.name} is coming!`, kind: 'info' });
    return true;
  }

  startRush() {
    if (this.phase !== 'playing' || this.rush || this.isGuest) return;
    this.rush = { t: RUSH_SECONDS };
    this.today.bonus += RUSH_BONUS;
    this.spawnTimer = Math.min(this.spawnTimer, 1);
    this.sfxAll('rush');
    this.tellAll({ k: 'toast', text: `${RUSH_TEXT} Customer Rush!`, kind: 'gold' });
    this.pushStats();
  }

  setHeavyRain(on: boolean) {
    if (this.isGuest) return;
    this.heavyRain = on;
    this.tellAll({ k: 'toast', text: on ? 'Heavy rain! Customers will come a little slower.' : 'The rain is easing off.', kind: 'info' });
    this.snapDirty = true;
  }

  funnyLine() {
    if (this.phase !== 'playing' || this.isGuest) return;
    const line = FUNNY_LINES[Math.floor(Math.random() * FUNNY_LINES.length)];
    const waiting = this.customers.filter((c) => c.waiting);
    if (waiting.length) waiting[Math.floor(Math.random() * waiting.length)].say(line, 5);
    else this.tellAll({ k: 'toast', text: `Chandrappan: "Chandrappeettaa, business polikkunnu!"`, kind: 'gold' });
  }

  giveMoney(n: number) {
    if (this.isGuest) return;
    this.money += n;
    this.sfxAll('coin');
    this.tellAll({ k: 'toast', text: `Host gift: +₹${n}`, kind: 'gold' });
    this.pushStats();
    if (this.phase === 'dayEnd') this.events.onDayEnd(this.resultsView());
  }

  /** Host: replay the current day from its start (money, hearts, customers). */
  resetDay() {
    if (this.phase !== 'playing' || !this.dayStart || this.isGuest) return;
    const snap = this.dayStart;
    this.clearDayObjects();
    Object.assign(this, {
      money: snap.money,
      reputation: snap.reputation,
      streak: snap.streak,
      completed: snap.completed,
      lost: snap.lost,
      earnings: snap.earnings,
    });
    this.today = { completed: 0, lost: 0, earnings: 0, spawned: 0, handled: 0, bonus: 0 };
    this.rush = null;
    this.planRush();
    this.spawnTimer = 2;
    this.tellAll({ k: 'toast', text: `Day ${this.day} restarted.`, kind: 'info' });
    this.pushStats();
  }

  private planRush() {
    // from day 2, one surprise rush partway through the day (60% chance)
    this.rushPlannedAt = this.day >= 2 && Math.random() < 0.6 ? Math.floor(this.quota * (0.3 + Math.random() * 0.3)) : -1;
  }

  private snapshotDay() {
    this.dayStart = {
      day: this.day,
      money: this.money,
      reputation: this.reputation,
      streak: this.streak,
      completed: this.completed,
      lost: this.lost,
      earnings: this.earnings,
      owned: [...this.owned],
    };
    if (!this.multiplayer) saveRun(this.dayStart);
  }

  // ------------------------------------------------------------------- days

  /** Open the shop: from the menu (fresh run) or for the next day. */
  startRun(shopName: string, mode: CookMode) {
    this.restartState();
    this.shopName = shopName;
    this.mode = mode;
    this.phase = 'playing';
    this.picker.enabled = true;
    this.planRush();
    this.snapshotDay();
    this.pushStats();
    this.tellAll({ k: 'toast', text: `Day 1 — ${dayQuota(1)} customers today. Kada thurannu!`, kind: 'gold' });
  }

  /** Continue a saved run at the start of its day. */
  continueRun(save: RunSave, shopName: string, mode: CookMode) {
    this.restartState();
    this.shopName = shopName;
    this.mode = mode;
    Object.assign(this, {
      day: save.day,
      money: save.money,
      reputation: save.reputation,
      streak: save.streak,
      completed: save.completed,
      lost: save.lost,
      earnings: save.earnings,
    });
    for (const id of save.owned as UpgradeId[]) {
      if (!UPGRADES.some((u) => u.id === id)) continue;
      this.owned.add(id);
      this.shop.addUpgrade(id, false);
      if (id === 'roof') this.rain.shelter.z1 = 4.25;
    }
    this.phase = 'playing';
    this.picker.enabled = true;
    this.planRush();
    this.snapshotDay();
    this.pushStats();
    this.tellAll({ k: 'toast', text: `Welcome back! Day ${this.day} — ${this.quota} customers today.`, kind: 'gold' });
  }

  nextDay() {
    if (this.phase !== 'dayEnd' || this.isGuest) return;
    this.day++;
    this.today = { completed: 0, lost: 0, earnings: 0, spawned: 0, handled: 0, bonus: 0 };
    this.spawnTimer = 2;
    this.phase = 'playing';
    this.picker.enabled = true;
    this.planRush();
    this.snapshotDay();
    this.pushStats();
    this.tellAll({ k: 'toast', text: `Day ${this.day} — ${dayQuota(this.day)} customers today!`, kind: 'gold' });
  }

  buy(id: UpgradeId): boolean {
    const u = UPGRADES.find((x) => x.id === id);
    if (!u || this.owned.has(id) || this.money < u.cost || this.phase !== 'dayEnd' || this.isGuest) return false;
    this.money -= u.cost;
    this.owned.add(id);
    this.level = 1 + this.owned.size;
    this.shop.addUpgrade(id, true);
    this.sfxAll('upgrade');
    if (id === 'roof') this.rain.shelter.z1 = 4.25;
    this.tellAll({ k: 'toast', text: `${u.name} bought! Shop level ${this.level}.`, kind: 'gold' });
    this.pushStats();
    return true;
  }

  private endDay() {
    this.phase = 'dayEnd';
    this.rush = null;
    this.events.onEvent(null, 0);
    this.closePanel();
    for (const p of this.players.values()) {
      p.held = null;
      p.session = null;
    }
    this.clearCounter();
    this.updateBusyStations();
    this.picker.enabled = false;
    this.hud.setTooltip(null);
    this.events.onDayEnd(this.resultsView());
  }

  resultsView(): ResultsView {
    return {
      day: this.day,
      completed: this.today.completed,
      lost: this.today.lost,
      earnings: this.today.earnings,
      reputation: this.reputation,
      maxReputation: MAX_REP,
      money: this.money,
      nextQuota: dayQuota(this.day + 1),
      owned: new Set(this.owned),
      canAct: !this.isGuest,
    };
  }

  // ------------------------------------------------------------------- loop

  update(dt: number, t: number) {
    this.counter.update(dt, t);
    if (this.isGuest) this.updateGuest(dt, t);
    else this.updateAuthority(dt, t);
    this.syncLocalMarks();
    if (this.panel.isOpen) this.panel.tick();
    this.updateHud();
  }

  private updateAuthority(dt: number, t: number) {
    // customers face the nearest cook (or the first-person camera in solo)
    for (const c of this.customers) {
      if (!this.multiplayer) c.faceTarget = this.director.firstPerson ? this.director.eye : null;
      else {
        let best: THREE.Vector3 | null = null;
        let bd = Infinity;
        for (const p of this.players.values()) {
          const d = p.pos.distanceToSquared(c.position);
          if (d < bd) (bd = d), (best = p.pos);
        }
        c.faceTarget = best;
      }
    }

    if (this.playing) {
      for (const p of this.players.values()) {
        if (p.session?.update(dt)) {
          const s = p.session;
          this.tell(p.id, { k: 'panel', text: s.done ? `${s.recipe.name} is ready! Collect it.` : 'Done! Next step…', tone: s.done ? 'good' : 'info' });
          if (p.id === this.localId) this.refreshPanel();
          this.snapDirty = true;
        }
      }

      if (this.rushPlannedAt >= 0 && this.today.spawned >= this.rushPlannedAt) {
        this.rushPlannedAt = -1;
        this.startRush();
      }
      if (this.rush) {
        this.rush.t -= dt;
        this.events.onEvent(RUSH_TEXT, Math.max(0, this.rush.t / RUSH_SECONDS));
        if (this.rush.t <= 0) {
          this.rush = null;
          this.events.onEvent(null, 0);
        }
      }
      if (this.today.spawned < this.quota) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
          const c = this.spawn();
          let gap = Math.max(EASY.spawnFloor, EASY.spawnMin - this.day * 0.5) + Math.random() * EASY.spawnRange;
          gap *= MULTI_SPAWN[Math.min(4, this.players.size)];
          if (this.rush) gap = 2.5 + Math.random() * 1.5;
          else if (this.heavyRain) gap *= 1.4;
          this.spawnTimer = c ? gap : 2;
        }
      }
      for (const c of this.customers) {
        if (c.waiting && !this.announced.has(c.id)) {
          this.announced.add(c.id);
          this.sfxAll('bell');
        }
      }

      for (const c of this.customers) {
        if (c.waiting && !c.resolved) {
          c.patience -= dt;
          if (c.patience <= 0) this.fail(c, 'Too slow!');
        }
        c.update(dt, t);
      }
      this.updateFlights(dt);

      for (const c of this.customers.filter((x) => x.state === 'gone')) {
        this.scene.remove(c.model.root);
        this.picker.remove(`cust:${c.id}`);
        this.today.handled++;
        this.pushStats();
      }
      this.customers = this.customers.filter((x) => x.state !== 'gone');

      // the day ends once every customer of the day has been served or has left
      if (this.phase === 'playing' && this.today.spawned >= this.quota && this.customers.length === 0) {
        if (this.dayEndTimer < 0) this.dayEndTimer = 1.2;
        this.dayEndTimer -= dt;
        if (this.dayEndTimer <= 0) {
          this.dayEndTimer = -1;
          this.endDay();
        }
      }
    }

    // keep the guests in sync
    if (this.role === 'host') {
      this.snapTimer -= dt;
      if (this.snapTimer <= 0 || this.snapDirty) {
        this.snapTimer = 1 / SNAPSHOT_HZ;
        this.snapDirty = false;
        this.link?.broadcast(this.snapshot() as unknown as Record<string, unknown>, true);
      }
    }
  }

  private updateFlights(dt: number) {
    for (const f of this.flights) {
      f.t = Math.min(1, f.t + dt / 0.45);
      const to = f.customer.model.hand.getWorldPosition(this.v);
      f.model.position.lerpVectors(f.from, to, f.t);
      f.model.position.y += Math.sin(f.t * Math.PI) * 0.6;
      if (f.t >= 1) {
        f.customer.model.hand.add(f.model);
        f.model.position.set(0, -0.05, 0.05);
        f.model.rotation.set(0, 0, 0);
        f.model.scale.setScalar(0.9);
      }
    }
    this.flights = this.flights.filter((f) => f.t < 1);
  }

  /** Selected/target outlines and the "in hand" card for the local player. */
  private syncLocalMarks() {
    const held = this.localHeld();
    for (const it of this.counter.list()) this.picker.mark(`item:${it.uid}`, held === it ? 'selected' : null);
    for (const c of this.views()) this.picker.mark(`cust:${c.id}`, held && c.waiting && c.order === held.recipe ? 'target' : null);
    const key = held ? `${held.uid}:${this.counter.count(held)}` : '';
    if (key !== this.heldKey) {
      this.heldKey = key;
      this.hud.setHeld(held ? held.recipe : null, held ? this.counter.count(held) : 1);
    }
  }

  private toScreen(p: THREE.Vector3): { x: number; y: number; visible: boolean } {
    const v = p.clone().project(this.camera);
    const r = this.dom.getBoundingClientRect();
    return { x: ((v.x + 1) / 2) * r.width + r.left, y: ((1 - v.y) / 2) * r.height + r.top, visible: v.z < 1 && Math.abs(v.x) < 1.2 };
  }

  private updateHud() {
    const show = this.phase === 'playing';
    const held = this.localHeld();
    this.hud.setReady(
      show ? this.counter.list().map((i) => ({ uid: i.uid, recipe: i.recipe, held: i === held, count: this.counter.count(i) })) : [],
    );
    const views = this.views();
    this.hud.setOrders(
      show ? views.filter((c) => c.waiting).map((c) => ({ id: c.id, name: c.name, recipe: c.order, frac: c.frac, wrong: c.wrong })) : [],
    );
    this.hud.setBubbles(
      views
        .filter((c) => !c.arriving || c.line)
        .map((c) => {
          const s = this.toScreen(this.v.copy(c.position).setY(2.25 * c.scale));
          return {
            id: c.id,
            name: c.name,
            recipe: c.order,
            frac: c.frac,
            wrong: c.wrong,
            x: s.x,
            y: s.y,
            visible: s.visible && (c.waiting || !!c.line),
            line: c.line,
            done: !c.waiting,
          };
        }),
    );
    if (this.openStation) {
      const s = this.toScreen(this.openStation.root.getWorldPosition(this.v).add(new THREE.Vector3(0, this.openStation.labelHeight, 0)));
      this.hud.placeLabel(this.openStation.name, s.x, s.y, s.visible);
    } else this.hud.placeLabel(null);
  }

  pushStats() {
    if (this.isAuthority) this.level = 1 + this.owned.size;
    this.hud.setStats({
      shopName: this.shopName,
      money: this.money,
      reputation: this.reputation,
      maxReputation: MAX_REP,
      day: this.day,
      level: this.level,
      handled: this.today.handled,
      quota: this.quota,
    });
    this.snapDirty = true;
  }

  // -------------------------------------------------------------- snapshots

  private sessionSnap(s: CookingSession | null): SessionSnap | null {
    if (!s) return null;
    return { r: s.recipe.id, m: s.mode, b: s.batch, i: s.index, a: [...s.added], tm: s.timer ? [s.timer.elapsed, s.timer.duration] : null };
  }

  snapshot(): Snapshot {
    return {
      t: 'snap',
      ph: this.phase,
      pa: this.paused,
      name: this.shopName,
      trim: this.trim,
      money: this.money,
      rep: this.reputation,
      day: this.day,
      lvl: this.level,
      handled: this.today.handled,
      quota: this.quota,
      owned: [...this.owned],
      heavy: this.heavyRain,
      rush: this.rush ? this.rush.t / RUSH_SECONDS : -1,
      cs: this.customers.map(
        (c): CustSnap => ({
          id: c.id,
          ty: c.type.id,
          o: c.order,
          x: +c.position.x.toFixed(3),
          z: +c.position.z.toFixed(3),
          ry: +c.model.root.rotation.y.toFixed(3),
          st: c.state,
          mood: c.mood,
          react: c.reacts,
          ln: c.lineTimer > 0 ? c.line : null,
          f: +(c.patience / c.patienceMax).toFixed(3),
          w: c.wrongCount > 0,
          c: c.carry,
        }),
      ),
      it: this.counter.list().map(
        (i): ItemSnap => ({
          uid: i.uid,
          r: i.recipe,
          n: this.counter.count(i),
          sl: i.slot,
          hb: [...this.players.values()].find((p) => p.held === i)?.id ?? null,
        }),
      ),
      pl: [...this.players.values()].map(
        (p): PlayerSnap => ({
          id: p.id,
          name: p.name,
          shirt: p.shirt,
          apron: p.apron,
          x: +p.pos.x.toFixed(3),
          y: +p.pos.y.toFixed(3),
          z: +p.pos.z.toFixed(3),
          yaw: +p.yaw.toFixed(3),
          s: this.sessionSnap(p.session),
          h: p.held?.uid ?? null,
        }),
      ),
      res:
        this.phase === 'dayEnd'
          ? {
              day: this.day,
              completed: this.today.completed,
              lost: this.today.lost,
              earnings: this.today.earnings,
              reputation: this.reputation,
              maxReputation: MAX_REP,
              money: this.money,
              nextQuota: dayQuota(this.day + 1),
            }
          : undefined,
      over: this.phase === 'over' ? (this.overStats ?? undefined) : undefined,
    };
  }

  /** Guests: mirror the host's shop. */
  private applySnapshot(s: Snapshot) {
    const prev = this.lastSnap;
    this.lastSnap = s;
    const prevPhase = this.phase;
    this.phase = s.ph;
    this.paused = s.pa;
    this.money = s.money;
    this.reputation = s.rep;
    this.day = s.day;
    this.level = s.lvl;
    this.today.handled = s.handled;
    this.today.bonus = s.quota - dayQuota(s.day);
    if (s.name !== this.shopName || s.trim !== this.trim) {
      this.shopName = s.name;
      this.trim = s.trim;
      this.events.onShopLook(s.name, s.trim);
    }

    // upgrades
    const owned = new Set(s.owned);
    if ([...this.owned].some((id) => !owned.has(id))) {
      this.shop.clearUpgrades();
      this.owned.clear();
      this.rain.shelter.z1 = 3.1;
    }
    for (const id of owned) {
      if (this.owned.has(id)) continue;
      this.owned.add(id);
      this.shop.addUpgrade(id, prevPhase === 'dayEnd' || s.ph === 'dayEnd');
      if (id === 'roof') this.rain.shelter.z1 = 4.25;
    }
    if (s.heavy !== this.heavyRain) {
      this.heavyRain = s.heavy;
      this.events.onHeavyRain(s.heavy);
    }
    this.events.onEvent(s.rush >= 0 ? RUSH_TEXT : null, Math.max(0, s.rush));

    // customers
    const seen = new Set<number>();
    for (const cs of s.cs) {
      seen.add(cs.id);
      let p = this.puppets.get(cs.id);
      if (!p) {
        p = new CustomerPuppet(cs);
        this.puppets.set(cs.id, p);
        this.scene.add(p.model.root);
        this.picker.add({ kind: 'customer', key: `cust:${cs.id}`, root: p.model.root });
      } else p.apply(cs);
    }
    for (const [id, p] of this.puppets) {
      if (seen.has(id)) continue;
      this.scene.remove(p.model.root);
      this.picker.remove(`cust:${id}`);
      this.puppets.delete(id);
    }

    // counter
    const items = new Set<number>();
    for (const is of s.it) {
      items.add(is.uid);
      let item = this.counter.list().find((i) => i.uid === is.uid);
      const key = `${is.r}:${is.sl}`;
      if (!item || this.itemKeys.get(is.uid) !== key) {
        item = this.counter.placeAt(is.sl, is.r, is.n, is.uid);
        this.itemKeys.set(is.uid, key);
        this.picker.remove(`item:${is.uid}`);
        this.picker.add({ kind: 'item', key: `item:${is.uid}`, root: item.model });
      } else if (this.counter.count(item) !== is.n) {
        this.counter.setCount(item, is.n);
        this.picker.remove(`item:${is.uid}`);
        this.picker.add({ kind: 'item', key: `item:${is.uid}`, root: item.model });
      }
      item.held = !!is.hb;
    }
    for (const item of this.counter.list()) {
      if (items.has(item.uid)) continue;
      this.picker.remove(`item:${item.uid}`);
      this.counter.remove(item);
      this.itemKeys.delete(item.uid);
    }

    // players
    const me = s.pl.find((p) => p.id === this.localId);
    this.remoteSnaps = s.pl.filter((p) => p.id !== this.localId);
    this.guestHeld = me?.h ?? null;
    const sk = JSON.stringify(me?.s ? { ...me.s, tm: !!me.s.tm } : null);
    if (sk !== this.guestSessionKey) {
      this.guestSessionKey = sk;
      this.guestSession = me?.s ? this.rebuildSession(me.s) : null;
      this.refreshPanel();
    } else if (this.guestSession && me?.s?.tm) {
      this.guestSession.timer = { elapsed: me.s.tm[0], duration: me.s.tm[1] };
    }
    this.updateBusyStations();

    // phases
    this.picker.enabled = s.ph === 'playing' && !s.pa;
    if (!prev || prev.pa !== s.pa) this.hud.setPaused(s.pa, false);
    if (prevPhase !== s.ph || !prev) {
      if (s.ph === 'dayEnd') this.closePanel();
      if (s.ph === 'playing') {
        this.hud.showGameOver(null);
        this.events.onDayStart();
      } else if (s.ph === 'over' && s.over) {
        this.closePanel();
        this.hud.showGameOver(s.over, false);
      } else if (s.ph === 'menu') {
        this.closePanel();
        this.events.onWaiting();
      }
    }
    if (s.ph === 'dayEnd' && s.res && (prevPhase !== 'dayEnd' || prev?.money !== s.money || prev?.owned.length !== s.owned.length)) {
      this.events.onDayEnd({ ...s.res, owned: new Set(s.owned), canAct: false });
    }
    this.pushStats();
  }

  private rebuildSession(ss: SessionSnap): CookingSession {
    const sess = new CookingSession(RECIPES[ss.r], ss.m, 1, ss.b);
    sess.index = ss.i;
    sess.added = [...ss.a];
    sess.timer = ss.tm ? { elapsed: ss.tm[0], duration: ss.tm[1] } : null;
    return sess;
  }

  private updateGuest(dt: number, t: number) {
    for (const p of this.puppets.values()) p.update(dt, t);
    // advance the cooking timer between snapshots so the bar fills smoothly
    const tm = this.guestSession?.timer;
    if (tm && this.playing) tm.elapsed = Math.min(tm.duration, tm.elapsed + dt);
  }

  private clearPuppets() {
    for (const [id, p] of this.puppets) {
      this.scene.remove(p.model.root);
      this.picker.remove(`cust:${id}`);
    }
    this.puppets.clear();
    for (const it of this.counter.list()) this.picker.remove(`item:${it.uid}`);
    this.counter.clear();
    this.itemKeys.clear();
    this.guestSession = null;
    this.guestSessionKey = '';
    this.guestHeld = null;
    this.lastSnap = null;
  }

  // ------------------------------------------------------- game over/restart

  private gameOver() {
    this.phase = 'over';
    if (!this.multiplayer) clearRun();
    this.rush = null;
    this.events.onEvent(null, 0);
    this.closePanel();
    for (const p of this.players.values()) p.held = null;
    this.picker.enabled = false;
    this.hud.setTooltip(null);
    this.overStats = { days: this.day, completed: this.completed, lost: this.lost, earnings: this.earnings, level: this.level };
    this.hud.showGameOver(this.overStats, true);
    this.events.onGameOver();
    this.snapDirty = true;
  }

  private clearCounter() {
    for (const it of this.counter.list()) this.picker.remove(`item:${it.uid}`);
    this.counter.clear();
    for (const p of this.players.values()) p.held = null;
  }

  /** Remove customers, food and the active cooking sessions. */
  private clearDayObjects() {
    for (const c of this.customers) {
      this.scene.remove(c.model.root);
      this.picker.remove(`cust:${c.id}`);
    }
    this.customers = [];
    this.announced.clear();
    this.clearCounter();
    this.flights = [];
    for (const p of this.players.values()) p.session = null;
    this.updateBusyStations();
    this.closePanel();
    this.events.onEvent(null, 0);
  }

  /** Clean slate: no customers, food, upgrades or money. */
  restartState() {
    this.clearDayObjects();
    this.clearPuppets();
    this.rush = null;
    this.shop.clearUpgrades();
    this.rain.shelter.z1 = 3.1;
    this.closePanel();
    this.owned.clear();
    Object.assign(this, { money: 0, reputation: MAX_REP, day: 1, level: 1, streak: 0, completed: 0, lost: 0, earnings: 0 });
    this.today = { completed: 0, lost: 0, earnings: 0, spawned: 0, handled: 0, bonus: 0 };
    this.paused = false;
    this.overStats = null;
    this.spawnTimer = EASY.firstSpawn;
    this.dayEndTimer = -1;
    this.hud.setPaused(false, true);
    this.hud.showGameOver(null);
    this.pushStats();
  }

  toMenu() {
    this.restartState();
    this.phase = 'menu';
    this.picker.enabled = false;
    this.snapDirty = true;
  }
}
