import type { HudStats } from './types';
import { RECIPES, RecipeId } from './recipes';
import { foodIcon } from './icons';

/** HTML HUD: stats, controls, orders list, speech bubbles, held item, toasts and overlays. */

export interface OrderView {
  id: number;
  name: string;
  recipe: RecipeId;
  frac: number;
  wrong: boolean;
}

export interface BubbleView extends OrderView {
  x: number;
  y: number;
  visible: boolean;
  line: string | null;
  done: boolean;
}

export interface GameOverStats {
  days: number;
  completed: number;
  lost: number;
  earnings: number;
  level: number;
}

export interface Hud {
  setStats(s: HudStats): void;
  setTooltip(text: string | null, x?: number, y?: number): void;
  placeLabel(text: string | null, x?: number, y?: number, visible?: boolean): void;
  setOrders(list: OrderView[]): void;
  setBubbles(list: BubbleView[]): void;
  setHeld(recipe: RecipeId | null): void;
  setReady(items: { uid: number; recipe: RecipeId; held: boolean }[]): void;
  toast(text: string, kind?: 'info' | 'good' | 'bad' | 'gold'): void;
  floatText(text: string, x: number, y: number, kind?: 'gold' | 'bad'): void;
  setPaused(paused: boolean): void;
  showGameOver(stats: GameOverStats | null): void;
  setPanelOpen(open: boolean): void;
  setVisible(visible: boolean): void;
  setViewMode(firstPerson: boolean): void;
  setMuted(muted: boolean): void;
  setEvent(text: string | null, frac?: number): void;
  /** Container for the cooking panel. */
  layer: HTMLElement;
}

export interface HudActions {
  onResetCamera(): void;
  onTogglePause(): void;
  onPutDown(): void;
  onPickItem(uid: number): void;
  onServe(customerId: number): void;
  onRestart(): void;
  onMainMenu(): void;
  onToggleView(): void;
  onLook(where: 'counter' | 'kitchen'): void;
  onToggleMute(): void;
}

const barColor = (f: number) => (f > 0.5 ? 'var(--success)' : f > 0.25 ? 'var(--gold)' : 'var(--terracotta)');

export function createHud(root: HTMLElement, actions: HudActions): Hud {
  root.innerHTML = `
    <section class="hud-card hud-shop" aria-label="Shop">
      <div class="hud-shop-name" data-el="shopName"></div>
      <div class="hud-shop-meta"><span data-el="day"></span><span class="dot">•</span><span data-el="level"></span></div>
      <div class="day-progress"><div data-el="dayBar"></div></div>
      <div class="day-count" data-el="dayCount"></div>
    </section>

    <section class="hud-card hud-wallet" aria-label="Money and reputation">
      <div class="hud-money"><span class="coin">₹</span><span data-el="money">0</span></div>
      <div class="hud-divider"></div>
      <div class="hud-hearts" data-el="hearts" aria-label="Reputation"></div>
    </section>
    <div class="event-banner" data-el="event" hidden>
      <div class="event-text" data-el="eventText"></div>
      <div class="event-bar"><div data-el="eventBar"></div></div>
    </div>
    <div class="toasts" data-el="toasts" aria-live="polite"></div>

    <section class="hud-actions" aria-label="Controls">
      <button class="hud-btn" data-act="pause" title="Pause (P)">❚❚</button>
      <button class="hud-btn" data-act="mute" data-el="muteBtn" title="Mute (M)">♪</button>
      <button class="hud-btn wide" data-act="view" data-el="viewBtn" title="Switch camera (V)">Overview</button>
      <button class="hud-btn" data-act="reset" title="Reset camera (R)">⟲</button>
    </section>

    <section class="hud-card hud-orders" aria-label="Orders">
      <div class="hud-title">Orders</div>
      <div class="orders-list" data-el="orders"></div>
      <div class="hud-empty" data-el="ordersEmpty">No orders yet. Customers are on their way…</div>
    </section>

    <section class="hud-card hud-held" aria-label="Held item">
      <div class="hud-title">In hand</div>
      <div class="held-body" data-el="held"></div>
      <div class="ready" data-el="ready"></div>
    </section>

    <div class="bubbles" data-el="bubbles"></div>
    <div class="floaters" data-el="floaters"></div>
    <div class="panel-layer" data-el="panelLayer"></div>

    <div class="look-btns" data-el="lookBtns">
      <button class="hud-btn wide" data-act="look-counter" title="Look at the counter (1)">1 · Counter</button>
      <button class="hud-btn wide" data-act="look-kitchen" title="Look at the kitchen (2)">2 · Kitchen</button>
    </div>
    <div class="hud-hint" data-el="hint"></div>
    <div class="hud-tooltip" data-el="tooltip" hidden></div>
    <div class="hud-label" data-el="label" hidden></div>

    <div class="overlay" data-el="pause" hidden>
      <div class="overlay-card">
        <h2>Chaya break ☕</h2>
        <p>The shop is paused. Customers will wait.</p>
        <button class="btn-primary" data-act="resume">Resume</button>
      </div>
    </div>
    <div class="overlay" data-el="gameover" hidden>
      <div class="overlay-card">
        <h2 class="bad">Chandrappante Kada Pooti!</h2>
        <p>The customers have lost faith… for today.</p>
        <dl class="stats" data-el="goStats"></dl>
        <div class="modal-actions center">
          <button class="btn-ghost" data-act="menu">Main Menu</button>
          <button class="btn-primary" data-act="restart">Try Again</button>
        </div>
      </div>
    </div>
  `;

  const el = (name: string) => root.querySelector<HTMLElement>(`[data-el="${name}"]`)!;
  const tooltip = el('tooltip');
  const label = el('label');
  const ordersEl = el('orders');
  const bubblesEl = el('bubbles');
  const orderRows = new Map<number, HTMLElement>();
  const bubbleEls = new Map<number, HTMLElement>();
  let lastStats: HudStats | null = null;

  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (b && !(b as HTMLButtonElement).disabled) {
      const act = b.dataset.act;
      if (act === 'reset') actions.onResetCamera();
      if (act === 'pause' || act === 'resume') actions.onTogglePause();
      if (act === 'putdown') actions.onPutDown();
      if (act === 'restart') actions.onRestart();
      if (act === 'pick') actions.onPickItem(Number(b.dataset.uid));
      if (act === 'menu') actions.onMainMenu();
      if (act === 'view') actions.onToggleView();
      if (act === 'mute') actions.onToggleMute();
      if (act === 'look-counter') actions.onLook('counter');
      if (act === 'look-kitchen') actions.onLook('kitchen');
      return;
    }
    const bubble = (e.target as HTMLElement).closest<HTMLElement>('[data-serve]');
    if (bubble) actions.onServe(Number(bubble.dataset.serve));
  });

  const hud: Hud = {
    layer: el('panelLayer'),

    setStats(s) {
      el('shopName').textContent = s.shopName;
      el('day').textContent = `Day ${s.day}`;
      el('level').textContent = `Shop Lv ${s.level}`;
      el('dayCount').textContent = `${s.handled} / ${s.quota} customers today`;
      el('dayBar').style.width = `${Math.min(100, (s.handled / Math.max(1, s.quota)) * 100)}%`;
      const money = el('money');
      money.textContent = s.money.toLocaleString('en-IN');
      if (lastStats && s.money !== lastStats.money) {
        money.parentElement!.classList.remove('bump');
        void money.offsetWidth;
        money.parentElement!.classList.add('bump');
      }
      if (!lastStats || lastStats.reputation !== s.reputation || lastStats.maxReputation !== s.maxReputation) {
        const hearts = el('hearts');
        hearts.innerHTML = '';
        for (let i = 0; i < s.maxReputation; i++) {
          const h = document.createElement('span');
          h.className = i < s.reputation ? 'heart full' : 'heart';
          h.textContent = '♥';
          hearts.append(h);
        }
        if (lastStats && s.reputation < lastStats.reputation) hearts.classList.add('hurt');
        setTimeout(() => hearts.classList.remove('hurt'), 500);
      }
      lastStats = { ...s };
    },

    setTooltip(text, x = 0, y = 0) {
      tooltip.hidden = !text;
      if (text) {
        tooltip.textContent = text;
        tooltip.style.transform = `translate(${x + 16}px, ${y + 14}px)`;
      }
    },

    placeLabel(text, x = 0, y = 0, visible = true) {
      label.hidden = !text;
      if (!text) return;
      label.textContent = text;
      label.style.visibility = visible ? 'visible' : 'hidden';
      label.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
    },

    setOrders(list) {
      el('ordersEmpty').hidden = list.length > 0;
      const keep = new Set(list.map((o) => o.id));
      for (const [id, row] of orderRows) if (!keep.has(id)) (row.remove(), orderRows.delete(id));
      for (const o of list) {
        let row = orderRows.get(o.id);
        if (!row) {
          row = document.createElement('div');
          row.className = 'order-row';
          row.dataset.serve = String(o.id);
          row.innerHTML = `${foodIcon(o.recipe, 34)}<div class="order-info"><div class="order-item">${RECIPES[o.recipe].name}</div><div class="order-who">${o.name}</div><div class="pbar"><div></div></div></div>`;
          ordersEl.append(row);
          orderRows.set(o.id, row);
        }
        const bar = row.querySelector<HTMLElement>('.pbar > div')!;
        bar.style.width = `${Math.max(0, o.frac * 100)}%`;
        bar.style.background = barColor(o.frac);
        row.classList.toggle('wrong', o.wrong);
      }
    },

    setBubbles(list) {
      const keep = new Set(list.map((b) => b.id));
      for (const [id, b] of bubbleEls) if (!keep.has(id)) (b.remove(), bubbleEls.delete(id));
      for (const v of list) {
        let b = bubbleEls.get(v.id);
        if (!b) {
          b = document.createElement('div');
          b.className = 'bubble';
          b.dataset.serve = String(v.id);
          b.innerHTML = `<div class="bubble-line"></div><div class="bubble-order">${foodIcon(v.recipe, 30)}<span>${RECIPES[v.recipe].name}</span></div><div class="pbar"><div></div></div>`;
          bubblesEl.append(b);
          bubbleEls.set(v.id, b);
        }
        b.style.visibility = v.visible ? 'visible' : 'hidden';
        b.style.transform = `translate(-50%, -100%) translate(${v.x}px, ${v.y}px)`;
        const line = b.querySelector<HTMLElement>('.bubble-line')!;
        if (v.line) {
          if (line.textContent !== v.line) line.textContent = v.line;
          line.hidden = false;
        } else line.hidden = true;
        b.classList.toggle('done', v.done);
        b.classList.toggle('wrong', v.wrong);
        const bar = b.querySelector<HTMLElement>('.pbar > div')!;
        bar.style.width = `${Math.max(0, v.frac * 100)}%`;
        bar.style.background = barColor(v.frac);
      }
    },

    setHeld(recipe) {
      const held = el('held');
      held.innerHTML = recipe
        ? `<div class="held-item">${foodIcon(recipe, 44)}<div><div class="held-name">${RECIPES[recipe].name}</div><div class="held-tip">Click the customer who ordered it</div></div></div>
           <button class="btn-ghost small" data-act="putdown">Put down (Esc)</button>`
        : `<div class="held-tip">Empty. Click ready food on the counter to pick it up.</div>`;
      held.parentElement!.classList.toggle('active', !!recipe);
      // bubbles only become click targets while serving, so they never block the kitchen
      root.classList.toggle('holding', !!recipe);
    },

    setReady(items) {
      const key = items.map((i) => `${i.uid}${i.held ? 'h' : ''}`).join(',');
      const box = el('ready');
      if (box.dataset.key === key) return;
      box.dataset.key = key;
      box.innerHTML = items.length
        ? `<div class="hud-title">Ready on counter</div><div class="ready-row">${items
            .map(
              (i) =>
                `<button class="ready-btn ${i.held ? 'on' : ''}" data-act="pick" data-uid="${i.uid}" title="${i.held ? 'Put down' : 'Pick up'} ${RECIPES[i.recipe].name}">${foodIcon(i.recipe, 30)}<span>${RECIPES[i.recipe].name}</span></button>`,
            )
            .join('')}</div>`
        : '';
    },

    toast(text, kind = 'info') {
      const t = document.createElement('div');
      t.className = `toast ${kind}`;
      t.textContent = text;
      const box = el('toasts');
      box.prepend(t);
      while (box.children.length > 3) box.lastElementChild!.remove();
      setTimeout(() => t.classList.add('out'), 3800);
      setTimeout(() => t.remove(), 4200);
    },

    floatText(text, x, y, kind = 'gold') {
      const f = document.createElement('div');
      f.className = `floater ${kind}`;
      f.innerHTML = kind === 'gold' ? `<span class="coin">₹</span>${text}` : text;
      f.style.left = `${x}px`;
      f.style.top = `${y}px`;
      el('floaters').append(f);
      setTimeout(() => f.remove(), 1500);
    },

    setPaused(p) {
      el('pause').hidden = !p;
      root.querySelector('[data-act="pause"]')!.textContent = p ? '▶' : '❚❚';
    },

    showGameOver(stats) {
      el('gameover').hidden = !stats;
      if (!stats) return;
      el('goStats').innerHTML = `
        <dt>Days survived</dt><dd>${stats.days}</dd>
        <dt>Orders completed</dt><dd>${stats.completed}</dd>
        <dt>Customers lost</dt><dd>${stats.lost}</dd>
        <dt>Lifetime earnings</dt><dd>₹${stats.earnings}</dd>
        <dt>Final shop level</dt><dd>${stats.level}</dd>`;
    },

    setPanelOpen(open) {
      el('hint').hidden = open;
    },

    setVisible(visible) {
      root.classList.toggle('hud-hidden', !visible);
    },

    setMuted(m) {
      const b = el('muteBtn');
      b.textContent = m ? '♪̸' : '♪';
      b.classList.toggle('off', m);
      b.title = m ? 'Unmute (M)' : 'Mute (M)';
    },

    setEvent(text, frac = 0) {
      const box = el('event');
      box.hidden = !text;
      if (!text) return;
      el('eventText').textContent = text;
      el('eventBar').style.width = `${Math.round(frac * 100)}%`;
    },

    setViewMode(fp) {
      el('viewBtn').textContent = fp ? 'Overview' : 'Shop view';
      el('lookBtns').hidden = !fp;
      el('hint').innerHTML = fp
        ? 'Drag to look · <b>WASD</b> walk · Wheel zoom · <b>V</b> overview · <b>R</b> reset · Click a station to cook'
        : 'Left-drag rotate · Right-drag pan · Wheel zoom · <b>V</b> shopkeeper view · <b>R</b> reset';
    },
  };
  hud.setHeld(null);
  return hud;
}
