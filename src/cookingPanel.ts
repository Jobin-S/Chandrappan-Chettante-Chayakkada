import { CookMode, RECIPES, RecipeId, actionsFor, recipesAt } from './recipes';
import { BATCH_SIZES, CookingSession } from './cooking';
import type { Station } from './types';
import { foodIcon } from './icons';

/** The station panel over the lower part of the screen: pick a dish, then cook it step by step. */

export interface PanelHandlers {
  onChoose(recipe: RecipeId): void;
  onAction(action: string): void;
  onCollect(): void;
  onDiscard(): void;
  onClose(): void;
  onMode(mode: CookMode): void;
  onGoTo(stationId: string): void;
  onBatch(n: number): void;
}

export interface PanelView {
  station: Station;
  mode: CookMode;
  /** The active session if it belongs to this station. */
  session: CookingSession | null;
  /** Set when Chandrappan is busy at another station. */
  busyAt: { id: string; name: string } | null;
  wanted: Partial<Record<RecipeId, number>>;
  counterFull: boolean;
  /** Portions per cook (bulk cooking). */
  batch: number;
  /** Another player is cooking at this station. */
  lockedBy?: string | null;
}

export class CookingPanel {
  readonly el: HTMLElement;
  private view: PanelView | null = null;
  private message = '';
  private messageKind: 'info' | 'good' | 'bad' = 'info';

  constructor(parent: HTMLElement, private h: PanelHandlers) {
    this.el = document.createElement('section');
    this.el.className = 'cook-panel';
    this.el.hidden = true;
    this.el.setAttribute('aria-label', 'Cooking station');
    parent.append(this.el);
    this.el.addEventListener('click', this.onClick);
  }

  get isOpen() {
    return !this.el.hidden;
  }

  get stationId() {
    return this.view?.station.id ?? null;
  }

  open(view: PanelView, message = '') {
    this.message = message;
    this.messageKind = 'info';
    this.el.hidden = false;
    this.render(view);
  }

  close() {
    this.el.hidden = true;
    this.view = null;
  }

  say(text: string, kind: 'info' | 'good' | 'bad' = 'info') {
    this.message = text;
    this.messageKind = kind;
    const msg = this.el.querySelector<HTMLElement>('.cook-msg');
    if (!msg) return;
    msg.textContent = text;
    msg.className = `cook-msg ${kind}`;
    if (kind === 'bad') {
      msg.classList.remove('shake');
      void msg.offsetWidth;
      msg.classList.add('shake');
    }
  }

  render(view: PanelView) {
    this.view = view;
    const { station, session } = view;
    const head = `
      <header class="cook-head">
        <div>
          <div class="cook-mal" lang="ml">${station.malayalam}</div>
          <div class="cook-title">${station.name}</div>
        </div>
        <div class="mode-toggle" role="group" aria-label="Preparation mode">
          ${(['simple', 'advanced'] as CookMode[])
            .map(
              (m) =>
                `<button data-mode="${m}" class="${view.mode === m ? 'on' : ''}" ${session ? 'disabled' : ''}>${m === 'simple' ? 'Simple' : 'Advanced'}</button>`,
            )
            .join('')}
        </div>
        <button class="cook-close" data-close title="Close (Esc)">✕</button>
      </header>`;

    let body = '';
    if (view.busyAt) {
      body = `
        <div class="cook-busy">
          <p>Chandrappan is busy at the <b>${view.busyAt.name}</b>. Only one dish at a time!</p>
          <button class="btn-primary" data-goto="${view.busyAt.id}">Go to ${view.busyAt.name}</button>
        </div>`;
    } else if (!session && view.lockedBy) {
      body = `
        <div class="cook-busy">
          <p><b>${view.lockedBy}</b> is cooking at this station. Pick another one, or wait for them to finish!</p>
        </div>`;
    } else if (!session) {
      const cards = recipesAt(station.id)
        .map((r) => {
          const n = view.wanted[r.id] ?? 0;
          return `<button class="recipe-card" data-recipe="${r.id}">
            ${n ? `<span class="badge">${n} waiting</span>` : ''}
            ${foodIcon(r.id, 52)}
            <span class="recipe-name">${r.name}</span>
            <span class="recipe-price">₹${r.price}</span>
          </button>`;
        })
        .join('');
      const batch = `<div class="batch-row"><span class="batch-label">Batch</span><div class="seg small">${BATCH_SIZES.map(
        (n) => `<button data-batch="${n}" class="${view.batch === n ? 'on' : ''}">×${n}</button>`,
      ).join('')}</div><span class="batch-hint">${
        view.batch > 1 ? `Makes ${view.batch} portions — serve several customers in one go.` : 'Cook one at a time, or a batch for busy moments.'
      }</span></div>`;
      body = `${batch}<div class="recipe-grid">${cards}</div>
        <div class="cook-msg ${this.messageKind}">${this.message || 'What shall we make?'}</div>`;
    } else {
      const r = session.recipe;
      const steps = session.steps
        .map((s, i) => {
          const cls = i < session.index ? 'done' : i === session.index ? 'current' : '';
          return `<li class="${cls}">${i < session.index ? '✓ ' : ''}${session.label(s.action)}${s.duration ? ' ⏱' : ''}</li>`;
        })
        .join('');
      const actions = actionsFor(station.id, session.mode)
        .map(
          (a) =>
            `<button class="action-btn" data-action="${a.id}" ${session.done || session.timer ? 'disabled' : ''}>
              <span class="dot" style="background:${a.color}"></span>${session.label(a.id)}
            </button>`,
        )
        .join('');
      const chips = session.added
        .map((id) => `<span class="chip">${session.label(id)}</span>`)
        .join('');
      body = `
        <div class="cook-body">
          <div class="cook-dish">
            ${foodIcon(r.id, 64)}
            <div>
              <div class="dish-name">${r.name}${session.batch > 1 ? ` <span class="batch-badge">×${session.batch}</span>` : ''} <span class="dish-price">₹${r.price}</span></div>
              <div class="dish-step">${session.done ? 'Ready to collect!' : `Step ${session.index + 1} of ${session.steps.length}`}</div>
            </div>
          </div>
          <ol class="cook-steps">${steps}</ol>
        </div>
        <div class="cook-pot">${chips || '<span class="pot-empty">Empty pot</span>'}</div>
        <div class="cook-progress" ${session.timer ? '' : 'hidden'}><div class="cook-bar"></div></div>
        <div class="cook-msg ${this.messageKind}">${this.message}</div>
        <div class="action-grid">${actions}</div>
        <footer class="cook-foot">
          <button class="btn-ghost" data-discard>Discard</button>
          <button class="btn-gold" data-collect ${session.done ? '' : 'disabled'}>${
            session.done && view.counterFull ? 'Counter full!' : `Collect ${r.name}${session.batch > 1 ? ` ×${session.batch}` : ''}`
          }</button>
        </footer>`;
    }
    this.el.innerHTML = head + body;
    this.tick();
  }

  /** Per-frame: progress bar for timed steps. */
  tick() {
    const s = this.view?.session;
    const bar = this.el.querySelector<HTMLElement>('.cook-bar');
    if (s && bar) bar.style.width = `${Math.round(s.progress * 100)}%`;
  }

  private onClick = (e: MouseEvent) => {
    const t = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!t || t.disabled) return;
    const d = t.dataset;
    if (d.mode) this.h.onMode(d.mode as CookMode);
    else if (d.recipe) this.h.onChoose(d.recipe as RecipeId);
    else if (d.action) this.h.onAction(d.action);
    else if ('collect' in d) this.h.onCollect();
    else if ('discard' in d) this.h.onDiscard();
    else if ('close' in d) this.h.onClose();
    else if (d.goto) this.h.onGoTo(d.goto);
    else if (d.batch) this.h.onBatch(Number(d.batch));
  };
}

export const recipeName = (id: RecipeId) => RECIPES[id].name;
