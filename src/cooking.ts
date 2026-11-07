import { CookMode, Recipe, Step, actionLabel, stepsFor } from './recipes';

/**
 * One stateful cooking process. Actions must be clicked in recipe order;
 * timed steps run a timer that must finish before the next action.
 */

export const BATCH_SIZES = [1, 3, 5] as const;
const BATCH_TIME: Record<number, number> = { 1: 1, 3: 1.4, 5: 1.8 };

export interface ActResult {
  ok: boolean;
  message: string;
}

export class CookingSession {
  readonly steps: Step[];
  index = 0;
  timer: { elapsed: number; duration: number } | null = null;
  /** Action ids that have been completed, in order (drives the pot chips). */
  added: string[] = [];

  constructor(
    readonly recipe: Recipe,
    readonly mode: CookMode,
    private speed = 1,
    /** How many portions this batch makes (bulk cooking). */
    readonly batch = 1,
  ) {
    this.steps = stepsFor(recipe, mode);
    // bigger batches take a little longer, but far less than cooking them one by one
    this.speed = speed / (BATCH_TIME[batch] ?? 1);
  }

  get station() {
    return this.recipe.station;
  }

  get done(): boolean {
    return this.index >= this.steps.length;
  }

  get current(): Step | undefined {
    return this.steps[this.index];
  }

  get progress(): number {
    return this.timer ? Math.min(1, this.timer.elapsed / this.timer.duration) : 0;
  }

  label(actionId: string): string {
    return actionLabel(this.recipe.station, this.mode, actionId, this.recipe);
  }

  act(actionId: string): ActResult {
    const step = this.current;
    if (!step) return { ok: false, message: `${this.recipe.name} is ready. Collect it!` };
    if (this.timer) return { ok: false, message: `Wait! “${this.label(step.action)}” is still in progress…` };

    if (actionId !== step.action) {
      const tried = this.label(actionId);
      const next = this.label(step.action);
      const laterIndex = this.steps.findIndex((s, i) => i > this.index && s.action === actionId);
      const doneBefore = this.steps.findIndex((s, i) => i < this.index && s.action === actionId);
      if (laterIndex >= 0) return { ok: false, message: `Too early for “${tried}”. ${step.why} Next: ${next}.` };
      if (doneBefore >= 0) return { ok: false, message: `Already done “${tried}”. Next: ${next}.` };
      return { ok: false, message: `“${tried}” doesn't go into ${this.recipe.name}! Next: ${next}.` };
    }

    if (step.duration) {
      this.timer = { elapsed: 0, duration: step.duration / this.speed };
      return { ok: true, message: `${this.label(step.action)}…` };
    }
    this.complete();
    return { ok: true, message: this.done ? `${this.recipe.name} is ready!` : `${this.label(actionId)} ✓` };
  }

  /** Advances the timer; returns true when a timed step just finished. */
  update(dt: number): boolean {
    if (!this.timer) return false;
    this.timer.elapsed += dt;
    if (this.timer.elapsed < this.timer.duration) return false;
    this.timer = null;
    this.complete();
    return true;
  }

  private complete() {
    this.added.push(this.steps[this.index].action);
    this.index++;
  }
}
