/** Small host-only control panel for the livestream (toggle with H). */

export interface HostHandlers {
  spawnAmmavan(): void;
  rush(): void;
  toggleRain(): boolean;
  funny(): void;
  give100(): void;
  resetDay(): void;
}

export class HostPanel {
  readonly el: HTMLElement;
  private confirmTimer = 0;

  constructor(parent: HTMLElement, private h: HostHandlers) {
    this.el = document.createElement('section');
    this.el.className = 'host-panel';
    this.el.hidden = true;
    this.el.setAttribute('aria-label', 'Host controls');
    this.el.innerHTML = `
      <header><span>Host controls</span><kbd>H</kbd></header>
      <button data-host="ammavan">Spawn Ammavan</button>
      <button data-host="rush">Start Customer Rush</button>
      <button data-host="rain">Heavy Rain: <b data-el="rain">Off</b></button>
      <button data-host="funny">Funny dialogue</button>
      <button data-host="money">Give ₹100</button>
      <button data-host="reset" class="danger">Reset current day</button>`;
    parent.append(this.el);
    this.el.addEventListener('click', this.onClick);
  }

  get open() {
    return !this.el.hidden;
  }

  toggle(force?: boolean) {
    this.el.hidden = force === undefined ? !this.el.hidden : !force;
  }

  setRain(on: boolean) {
    this.el.querySelector('[data-el="rain"]')!.textContent = on ? 'On' : 'Off';
  }

  private onClick = (e: MouseEvent) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-host]');
    if (!b) return;
    switch (b.dataset.host) {
      case 'ammavan':
        return this.h.spawnAmmavan();
      case 'rush':
        return this.h.rush();
      case 'rain':
        return this.setRain(this.h.toggleRain());
      case 'funny':
        return this.h.funny();
      case 'money':
        return this.h.give100();
      case 'reset':
        // two clicks within 3 seconds = confirmation
        if (b.classList.contains('confirm')) {
          window.clearTimeout(this.confirmTimer);
          b.classList.remove('confirm');
          b.textContent = 'Reset current day';
          return this.h.resetDay();
        }
        b.classList.add('confirm');
        b.textContent = 'Click again to confirm';
        this.confirmTimer = window.setTimeout(() => {
          b.classList.remove('confirm');
          b.textContent = 'Reset current day';
        }, 3000);
        return;
    }
  };
}
