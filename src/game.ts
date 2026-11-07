import * as THREE from 'three';
import { CookingSession } from './cooking';
import { CookMode, RECIPES, RecipeId } from './recipes';
import { CUSTOMER_TYPES, Customer, CustomerType } from './customers';
import { CounterItem, ServingCounter } from './food';
import { Picker, Pickable } from './interactions';
import { CookingPanel, PanelView } from './cookingPanel';
import { QUEUE_SLOTS, SERVE_SLOTS, Shop } from './shop';
import { UPGRADES, UpgradeId } from './upgrades';
import type { CameraDirector } from './camera';
import type { Rain } from './effects';
import type { Hud } from './ui';
import type { Station } from './types';
import type { ResultsView } from './screens';
import type { Sfx } from './audio';
import { RunSave, clearRun, saveRun } from './storage';

/**
 * Central game state and rules: business days, spawning, cooking, serving,
 * money, reputation, upgrades, pause and game over. One cooking process at
 * a time; money is paid exactly once per order; served food leaves the hand.
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

export type Phase = 'menu' | 'playing' | 'dayEnd' | 'over';

export const dayQuota = (day: number) => Math.min(12, 6 + (day - 1) * 2);

interface Flight {
  model: THREE.Object3D;
  from: THREE.Vector3;
  customer: Customer;
  t: number;
}

export interface GameEvents {
  onDayEnd(v: ResultsView): void;
  onGameOver(): void;
  /** Big event banner (Customer Rush); null hides it. */
  onEvent(text: string | null, frac: number): void;
  sfx(name: Sfx): void;
}

const RUSH_SECONDS = 30;
const RUSH_BONUS = 3;

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

export class Game {
  phase: Phase = 'menu';
  shopName = '';
  money = 0;
  reputation = MAX_REP;
  day = 1;
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

  session: CookingSession | null = null;
  openStation: Station | null = null;
  held: CounterItem | null = null;
  customers: Customer[] = [];

  private spawnTimer = EASY.firstSpawn;
  private dayEndTimer = -1;
  private flights: Flight[] = [];
  private counter: ServingCounter;
  private panel: CookingPanel;
  private stationPick = new Map<string, Pickable>();
  private v = new THREE.Vector3();

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
      onChoose: (r) => this.startCooking(r),
      onAction: (a) => this.cookAction(a),
      onCollect: () => this.collect(),
      onDiscard: () => this.discard(),
      onClose: () => this.closePanel(),
      onMode: (m) => {
        this.mode = m;
        this.refreshPanel();
      },
      onGoTo: (id) => {
        const st = this.shop.stations.find((s) => s.id === id);
        if (st) this.openPanel(st);
      },
    });
  }

  get level() {
    return 1 + this.owned.size;
  }
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

  // ------------------------------------------------------------------ input

  hover(p: Pickable | null, x: number, y: number) {
    this.hud.setTooltip(p && this.phase === 'playing' ? this.describe(p) : null, x, y);
  }

  click(p: Pickable | null) {
    if (!this.playing || !p) return;
    if (p.kind === 'station') {
      const st = this.shop.stations.find((s) => `station:${s.id}` === p.key);
      if (st) this.openPanel(st);
    } else if (p.kind === 'item') {
      const item = this.counter.list().find((i) => `item:${i.uid}` === p.key);
      if (item) this.pickItem(item.uid);
    } else if (p.kind === 'customer') {
      const c = this.customers.find((x) => `cust:${x.id}` === p.key);
      if (c) this.serve(c);
    }
  }

  /** HUD shortcut / 3D click: pick up or put down a counter item. */
  pickItem(uid: number) {
    if (!this.playing) return;
    const item = this.counter.list().find((i) => i.uid === uid);
    if (!item) return;
    if (this.held === item) this.putDown();
    else this.pickUp(item);
  }

  escape() {
    if (this.panel.isOpen) this.closePanel();
    else if (this.held) this.putDown();
  }

  togglePause() {
    if (this.phase !== 'playing') return;
    this.paused = !this.paused;
    this.picker.enabled = !this.paused;
    this.hud.setPaused(this.paused);
  }

  /** First person: 1 = look at the counter/customers, 2 = look at the kitchen. */
  look(where: 'counter' | 'kitchen') {
    if (where === 'counter') this.director.lookAt(new THREE.Vector3(0.6, 1.75, 2.9));
    else this.director.lookAt(new THREE.Vector3(-2.7, 1.15, 0.4));
  }

  private describe(p: Pickable): string {
    if (p.kind === 'station') {
      const st = this.shop.stations.find((s) => `station:${s.id}` === p.key)!;
      return this.session?.station === st.id ? `${st.name} — cooking ${this.session.recipe.name}` : `${st.name} — click to cook`;
    }
    if (p.kind === 'item') {
      const item = this.counter.list().find((i) => `item:${i.uid}` === p.key);
      if (!item) return '';
      return this.held === item ? 'Click to put it down' : `${RECIPES[item.recipe].name} — click to pick up`;
    }
    const c = this.customers.find((x) => `cust:${x.id}` === p.key);
    if (!c) return '';
    if (!c.waiting) return c.type.name;
    return this.held
      ? `Serve ${RECIPES[this.held.recipe].name} to ${c.type.name}`
      : `${c.type.name} wants ${RECIPES[c.order].name}`;
  }

  // ---------------------------------------------------------------- cooking

  private panelView(st: Station): PanelView {
    const wanted: Partial<Record<RecipeId, number>> = {};
    for (const c of this.customers) if (c.waiting) wanted[c.order] = (wanted[c.order] ?? 0) + 1;
    const busyAt =
      this.session && this.session.station !== st.id
        ? { id: this.session.station, name: this.shop.stations.find((s) => s.id === this.session!.station)!.name }
        : null;
    return {
      station: st,
      mode: this.mode,
      session: this.session && this.session.station === st.id ? this.session : null,
      busyAt,
      wanted,
      counterFull: this.counter.full,
    };
  }

  private openPanel(st: Station) {
    if (this.openStation) this.picker.mark(`station:${this.openStation.id}`, null);
    this.openStation = st;
    const p = this.stationPick.get(st.id)!;
    this.picker.focus(p);
    this.picker.mark(p.key, 'selected');
    this.panel.open(this.panelView(st), this.session?.station === st.id ? 'Welcome back! Keep cooking.' : '');
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

  private startCooking(id: RecipeId) {
    if (this.session || !this.openStation || !this.playing) return;
    const r = RECIPES[id];
    if (r.station !== this.openStation.id) return;
    this.session = new CookingSession(r, this.mode, this.cookSpeed);
    this.shop.setStationBusy(r.station);
    this.events.sfx('ignite');
    this.refreshPanel();
    this.panel.say(this.mode === 'simple' ? `Let's make ${r.name}! Prepare, then ${r.cookVerb.toLowerCase()}.` : `Let's make ${r.name}! Click the steps in order.`);
  }

  private cookAction(action: string) {
    const s = this.session;
    if (!s || !this.playing || this.openStation?.id !== s.station) return;
    const res = s.act(action);
    if (!res.ok) this.events.sfx('error');
    else if (s.timer) this.events.sfx(s.station === 'fryer' || s.station === 'tawa' ? 'sizzle' : 'boil');
    else this.events.sfx(action === 'pour' ? 'pour' : 'step');
    this.refreshPanel();
    this.panel.say(res.message, res.ok ? (s.done ? 'good' : 'info') : 'bad');
  }

  private collect() {
    const s = this.session;
    if (!s || !s.done) return;
    if (this.counter.full) {
      this.panel.say('The counter is full! Serve someone first.', 'bad');
      return;
    }
    const item = this.counter.place(s.recipe.id)!;
    this.picker.add({ kind: 'item', key: `item:${item.uid}`, root: item.model });
    this.events.sfx(s.recipe.station === 'chaya' ? 'pour' : 'clink');
    this.session = null;
    this.shop.setStationBusy(null);
    // easy mode: it goes straight into Chandrappan's hand
    if (!this.held) this.pickUp(item);
    this.refreshPanel();
    const who = this.customers.find((c) => c.waiting && c.order === s.recipe.id);
    this.panel.say(
      this.held === item
        ? `${s.recipe.name} in hand! Now click ${who ? `the ${who.type.name}` : 'the customer'}.`
        : `${s.recipe.name} is on the counter.`,
      'good',
    );
    if (this.held === item) {
      this.closePanel();
      if (who) this.director.lookAt(who.position.clone().setY(1.6));
    }
  }

  private discard() {
    if (!this.session) return;
    const name = this.session.recipe.name;
    this.session = null;
    this.shop.setStationBusy(null);
    this.refreshPanel();
    this.panel.say(`${name} discarded. Start again?`, 'info');
  }

  // ---------------------------------------------------------------- serving

  private pickUp(item: CounterItem) {
    if (this.held) this.putDown();
    this.held = item;
    item.held = true;
    this.picker.mark(`item:${item.uid}`, 'selected');
    this.hud.setHeld(item.recipe);
    this.markTargets();
  }

  putDown() {
    if (!this.held) return;
    this.held.held = false;
    this.picker.mark(`item:${this.held.uid}`, null);
    this.held = null;
    this.hud.setHeld(null);
    this.markTargets();
  }

  /** Only the customers who want the held dish glow. */
  private markTargets() {
    for (const c of this.customers)
      this.picker.mark(`cust:${c.id}`, this.held && c.waiting && c.order === this.held.recipe ? 'target' : null);
  }

  serve(c: Customer) {
    if (!this.playing || !c.waiting || c.resolved) return;
    if (!this.held) {
      // easy mode: their dish is already waiting on the counter – hand it over
      const ready = this.counter.list().find((i) => i.recipe === c.order);
      if (!ready) {
        this.hud.toast(`${c.type.name} wants ${RECIPES[c.order].name}. Cook it first!`, 'info');
        return;
      }
      this.pickUp(ready);
    }
    const item = this.held!;
    this.held = null;
    item.held = false;
    this.picker.mark(`item:${item.uid}`, null);
    this.hud.setHeld(null);

    if (item.recipe === c.order) {
      this.counter.take(item);
      this.picker.remove(`item:${item.uid}`);
      this.flights.push({ model: item.model, from: item.model.position.clone(), customer: c, t: 0 });
      c.resolved = true;
      if (!c.paid) {
        c.paid = true;
        const price = RECIPES[c.order].price;
        this.money += price;
        this.earnings += price;
        this.completed++;
        this.today.completed++;
        this.today.earnings += price;
        this.streak++;
        this.popAt(c, `+${price}`, 'gold');
        this.events.sfx('clink');
        this.events.sfx('coin');
        this.events.sfx('success');
        if (this.streak % STREAK_BONUS === 0 && this.reputation < MAX_REP) {
          this.reputation++;
          this.hud.toast(`${STREAK_BONUS} happy customers in a row! Reputation +1 ♥`, 'gold');
        }
      }
      c.react('happy');
      c.say(c.pickLine('happy'), 3);
      c.leave(true);
      this.picker.mark(`cust:${c.id}`, null);
      this.pushStats();
    } else {
      c.wrongCount++;
      this.events.sfx('bad');
      if (c.wrongCount === 1) {
        c.react('angry');
        c.say(c.pickLine('wrong'), 3.5);
        this.hud.toast(`Wrong order! ${c.type.name} wanted ${RECIPES[c.order].name}. One more chance.`, 'bad');
      } else {
        this.fail(c, 'Wrong order again!');
      }
    }
    this.markTargets();
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
    this.picker.mark(`cust:${c.id}`, null);
    this.popAt(c, '−1 ♥', 'bad');
    this.events.sfx('bad');
    this.hud.toast(`${why} ${c.type.name} left unhappy. −1 ♥`, 'bad');
    this.pushStats();
    if (this.reputation <= 0) this.gameOver();
  }

  private popAt(c: Customer, text: string, kind: 'gold' | 'bad') {
    const s = this.toScreen(this.v.copy(c.position).setY(2.0));
    if (s.visible) this.hud.floatText(text, s.x, s.y, kind);
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

  spawn(type?: CustomerType): Customer | null {
    const slot = this.freeSlot();
    if (slot < 0) return null;
    const t = type ?? this.pickType();
    const order = t.favourites[Math.floor(Math.random() * t.favourites.length)];
    const pos = QUEUE_SLOTS[slot];
    const side = pos.x + (Math.random() - 0.5) * 3 < 0 ? -1 : 1;
    const mul = EASY.patienceMul + this.patienceBonus / t.patience;
    const c = new Customer(t, order, slot, pos, mul, side);
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
    if (this.phase !== 'playing') return false;
    const t = CUSTOMER_TYPES.find((x) => x.id === typeId);
    if (!t) return false;
    if (this.freeSlot() < 0) {
      this.hud.toast('The queue is full! Serve someone first.', 'info');
      return false;
    }
    this.today.bonus++;
    this.spawn(t);
    this.hud.toast(`${t.name} is coming!`, 'info');
    return true;
  }

  startRush() {
    if (this.phase !== 'playing' || this.rush) return;
    this.rush = { t: RUSH_SECONDS };
    this.today.bonus += RUSH_BONUS;
    this.spawnTimer = Math.min(this.spawnTimer, 1);
    this.events.sfx('rush');
    this.hud.toast('Chayakkadayil innu nalla thirakku! Customer Rush!', 'gold');
    this.pushStats();
  }

  setHeavyRain(on: boolean) {
    this.heavyRain = on;
    this.hud.toast(on ? 'Heavy rain! Customers will come a little slower.' : 'The rain is easing off.', 'info');
  }

  funnyLine() {
    if (this.phase !== 'playing') return;
    const line = FUNNY_LINES[Math.floor(Math.random() * FUNNY_LINES.length)];
    const waiting = this.customers.filter((c) => c.waiting);
    if (waiting.length) waiting[Math.floor(Math.random() * waiting.length)].say(line, 5);
    else this.hud.toast(`Chandrappan: "Chandrappeettaa, business polikkunnu!"`, 'gold');
  }

  giveMoney(n: number) {
    this.money += n;
    this.events.sfx('coin');
    this.hud.toast(`Host gift: +₹${n}`, 'gold');
    this.pushStats();
    if (this.phase === 'dayEnd') this.events.onDayEnd(this.resultsView());
  }

  /** Host: replay the current day from its start (money, hearts, customers). */
  resetDay() {
    if (this.phase !== 'playing' || !this.dayStart) return;
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
    this.hud.toast(`Day ${this.day} restarted.`, 'info');
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
    saveRun(this.dayStart);
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
    this.hud.toast(`Day 1 — ${dayQuota(1)} customers today. Kada thurannu!`, 'gold');
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
    this.hud.toast(`Welcome back! Day ${this.day} — ${this.quota} customers today.`, 'gold');
  }

  nextDay() {
    if (this.phase !== 'dayEnd') return;
    this.day++;
    this.today = { completed: 0, lost: 0, earnings: 0, spawned: 0, handled: 0, bonus: 0 };
    this.spawnTimer = 2;
    this.phase = 'playing';
    this.picker.enabled = true;
    this.planRush();
    this.snapshotDay();
    this.pushStats();
    this.hud.toast(`Day ${this.day} — ${dayQuota(this.day)} customers today!`, 'gold');
  }

  buy(id: UpgradeId): boolean {
    const u = UPGRADES.find((x) => x.id === id);
    if (!u || this.owned.has(id) || this.money < u.cost || this.phase !== 'dayEnd') return false;
    this.money -= u.cost;
    this.owned.add(id);
    this.shop.addUpgrade(id, true);
    this.events.sfx('upgrade');
    if (id === 'roof') this.rain.shelter.z1 = 4.25;
    this.hud.toast(`${u.name} bought! Shop level ${this.level}.`, 'gold');
    this.pushStats();
    return true;
  }

  private endDay() {
    this.phase = 'dayEnd';
    this.rush = null;
    this.events.onEvent(null, 0);
    this.closePanel();
    this.putDown();
    this.clearCounter();
    this.session = null;
    this.shop.setStationBusy(null);
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
    };
  }

  // ------------------------------------------------------------------- loop

  update(dt: number, t: number) {
    this.counter.update(dt, t);
    const face = this.director.firstPerson ? this.director.eye : null;
    for (const c of this.customers) c.faceTarget = face;

    if (this.playing) {
      if (this.session?.update(dt)) {
        this.refreshPanel();
        const s = this.session;
        this.panel.say(s.done ? `${s.recipe.name} is ready! Collect it.` : `Done! Next step…`, s.done ? 'good' : 'info');
      }

      if (this.rushPlannedAt >= 0 && this.today.spawned >= this.rushPlannedAt) {
        this.rushPlannedAt = -1;
        this.startRush();
      }
      if (this.rush) {
        this.rush.t -= dt;
        this.events.onEvent('Chayakkadayil innu nalla thirakku!', Math.max(0, this.rush.t / RUSH_SECONDS));
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
          if (this.rush) gap = 2.5 + Math.random() * 1.5;
          else if (this.heavyRain) gap *= 1.4;
          this.spawnTimer = c ? gap : 2;
        }
      }
      for (const c of this.customers) {
        if (c.waiting && !this.announced.has(c.id)) {
          this.announced.add(c.id);
          this.events.sfx('bell');
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

    if (this.panel.isOpen) this.panel.tick();
    this.updateHud();
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

  private toScreen(p: THREE.Vector3): { x: number; y: number; visible: boolean } {
    const v = p.clone().project(this.camera);
    const r = this.dom.getBoundingClientRect();
    return { x: ((v.x + 1) / 2) * r.width + r.left, y: ((1 - v.y) / 2) * r.height + r.top, visible: v.z < 1 && Math.abs(v.x) < 1.2 };
  }

  private updateHud() {
    const show = this.phase === 'playing';
    this.hud.setReady(show ? this.counter.list().map((i) => ({ uid: i.uid, recipe: i.recipe, held: i === this.held })) : []);
    this.hud.setOrders(
      show
        ? this.customers
            .filter((c) => c.waiting)
            .map((c) => ({ id: c.id, name: c.type.name, recipe: c.order, frac: c.patience / c.patienceMax, wrong: c.wrongCount > 0 }))
        : [],
    );
    this.hud.setBubbles(
      this.customers
        .filter((c) => c.state !== 'arriving' || c.lineTimer > 0)
        .map((c) => {
          const s = this.toScreen(this.v.copy(c.position).setY(2.25 * c.model.root.scale.y));
          const talking = c.lineTimer > 0;
          return {
            id: c.id,
            name: c.type.name,
            recipe: c.order,
            frac: c.patience / c.patienceMax,
            wrong: c.wrongCount > 0,
            x: s.x,
            y: s.y,
            visible: s.visible && (c.waiting || talking),
            line: talking ? c.line : null,
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
  }

  // ------------------------------------------------------- game over/restart

  private gameOver() {
    this.phase = 'over';
    clearRun();
    this.rush = null;
    this.events.onEvent(null, 0);
    this.closePanel();
    this.putDown();
    this.picker.enabled = false;
    this.hud.setTooltip(null);
    this.hud.showGameOver({ days: this.day, completed: this.completed, lost: this.lost, earnings: this.earnings, level: this.level });
    this.events.onGameOver();
  }

  private clearCounter() {
    for (const it of this.counter.list()) this.picker.remove(`item:${it.uid}`);
    this.counter.clear();
    this.held = null;
    this.hud.setHeld(null);
  }

  /** Remove customers, food and the active cooking session. */
  private clearDayObjects() {
    for (const c of this.customers) {
      this.scene.remove(c.model.root);
      this.picker.remove(`cust:${c.id}`);
    }
    this.customers = [];
    this.announced.clear();
    this.clearCounter();
    this.flights = [];
    this.session = null;
    this.shop.setStationBusy(null);
    this.closePanel();
    this.events.onEvent(null, 0);
  }

  /** Clean slate: no customers, food, upgrades or money. */
  restartState() {
    this.clearDayObjects();
    this.rush = null;
    this.shop.clearUpgrades();
    this.rain.shelter.z1 = 3.1;
    this.closePanel();
    this.owned.clear();
    Object.assign(this, { money: 0, reputation: MAX_REP, day: 1, streak: 0, completed: 0, lost: 0, earnings: 0 });
    this.today = { completed: 0, lost: 0, earnings: 0, spawned: 0, handled: 0, bonus: 0 };
    this.paused = false;
    this.spawnTimer = EASY.firstSpawn;
    this.dayEndTimer = -1;
    this.hud.setPaused(false);
    this.hud.showGameOver(null);
    this.pushStats();
  }

  toMenu() {
    this.restartState();
    this.phase = 'menu';
    this.picker.enabled = false;
  }
}
