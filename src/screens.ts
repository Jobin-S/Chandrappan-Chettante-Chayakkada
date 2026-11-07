import { DEFAULT_PROFILE, Profile } from './storage';
import { UPGRADES, UpgradeDef, UpgradeId } from './upgrades';

/** Full-screen flow screens: main menu, customization, help, settings, day results. */

export const SWATCHES = {
  trim: ['#245C3C', '#834A2C', '#DB6846', '#3E7FB1', '#D99B46', '#27271F'],
  shirt: ['#5E93B6', '#FFF1D5', '#428B55', '#E8B53E', '#B0567A', '#DB6846'],
  apron: ['#DB6846', '#245C3C', '#D99B46', '#834A2C', '#27271F', '#719EAC'],
} as const;

export interface ResultsView {
  day: number;
  completed: number;
  lost: number;
  earnings: number;
  reputation: number;
  maxReputation: number;
  money: number;
  nextQuota: number;
  owned: Set<UpgradeId>;
  /** False for multiplayer guests – only the host buys upgrades and starts the next day. */
  canAct?: boolean;
}

export interface ScreenHandlers {
  onStart(): void;
  onContinue(): void;
  onMulti(): void;
  onCreateRoom(name: string): void;
  onJoinRoom(code: string, name: string): void;
  onLobbyContinue(): void;
  onLeaveRoom(): void;
  onOpenShop(p: Profile): void;
  onBackToMenu(): void;
  onPreview(p: Profile): void;
  onSaveSettings(p: Profile): void;
  onResetData(): void;
  onBuy(id: UpgradeId): void;
  onNextDay(): void;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export class Screens {
  private root: HTMLElement;
  private profile: Profile = { ...DEFAULT_PROFILE };
  private results: ResultsView | null = null;

  constructor(parent: HTMLElement, private h: ScreenHandlers) {
    this.root = document.createElement('div');
    this.root.className = 'screens';
    parent.append(this.root);
    this.root.addEventListener('click', this.onClick);
    this.root.addEventListener('input', this.onInput);
  }

  hide() {
    this.root.innerHTML = '';
    this.root.className = 'screens';
  }

  showMenu(savedDay: number | null = null) {
    this.root.className = 'screens menu';
    this.root.innerHTML = `
      <div class="title-card">
        <div class="title-mal" lang="ml">ചന്ദ്രപ്പൻ ചേട്ടന്റെ ചായക്കട</div>
        <h1>Chandrappan Chettante Chayakkada</h1>
        <p class="subtitle">Munnar-il oru cheriya chayakkada, valiya swapnangal!</p>
        <div class="title-actions">
          ${savedDay ? `<button class="btn-primary big" data-go="continue">Continue · Day ${savedDay}</button>` : ''}
          <button class="btn-gold big" data-go="start">${savedDay ? 'New shop' : 'Thudangam!'}</button>
          <button class="btn-primary" data-go="multi">Play with friends 🎙</button>
          <div class="title-row">
            <button class="btn-ghost" data-go="howto">How to Play</button>
            <button class="btn-ghost" data-go="settings">Settings</button>
          </div>
        </div>
      </div>
      <div class="tagline">Mazhayum, chayayum, kurachu customer complaints-um!</div>`;
  }

  showCustomize(p: Profile) {
    this.profile = { ...p };
    this.root.className = 'screens customize';
    const row = (key: 'trim' | 'shirt' | 'apron', label: string) => `
      <div class="field">
        <div class="field-label">${label}</div>
        <div class="swatches">${SWATCHES[key]
          .map(
            (c) =>
              `<button class="swatch ${this.profile[key] === c ? 'on' : ''}" data-swatch="${key}" data-color="${c}" style="background:${c}" aria-label="${label} ${c}"></button>`,
          )
          .join('')}</div>
      </div>`;
    this.root.innerHTML = `
      <div class="side-card">
        <h2>Ningalude Kada</h2>
        <p class="muted">Make the shop yours. Changes show live on the shop.</p>
        <label class="field">
          <span class="field-label">Shop name</span>
          <input class="text-input" data-field="shopName" maxlength="40" value="${esc(this.profile.shopName)}" />
        </label>
        ${row('trim', 'Shop trim colour')}
        ${row('shirt', 'Chandrappan’s shirt')}
        ${row('apron', 'Apron colour')}
        <div class="side-actions">
          <button class="btn-ghost" data-go="back">Back</button>
          <button class="btn-gold big" data-go="open">Kada Thurakkam!</button>
        </div>
      </div>`;
  }

  showHowTo() {
    this.modal(`
      <h2>How to Play</h2>
      <ol class="howto">
        <li>You are <b>Chandrappan</b>, behind the counter. <b>Drag</b> to look around, <b>WASD</b> to walk, <b>1</b> counter / <b>2</b> kitchen.</li>
        <li>Customers come to the counter and say what they want.</li>
        <li>Click a <b>cooking station</b> (kettle, fryer, tawa, puttu steamer), pick the dish and click the steps <b>in order</b>.</li>
        <li><b>Collect</b> it, click the food on the counter, then click the customer.</li>
        <li>Right order = money. Wrong order = one more chance. Too slow = −1 ♥.</li>
        <li>Finish the day's customers, buy <b>upgrades</b>, and keep going until your hearts run out.</li>
      </ol>
      <p class="muted"><b>V</b> switches to the overview camera · <b>P</b> pause · <b>Esc</b> close panel</p>
      <button class="btn-primary" data-go="close">Got it!</button>`);
  }

  showSettings(p: Profile) {
    this.profile = { ...p };
    const toggle = (key: 'mode' | 'view', opts: [string, string][]) =>
      `<div class="seg">${opts
        .map(([v, label]) => `<button data-set="${key}" data-value="${v}" class="${this.profile[key] === v ? 'on' : ''}">${label}</button>`)
        .join('')}</div>`;
    this.modal(`
      <h2>Settings</h2>
      <div class="field"><div class="field-label">Cooking</div>${toggle('mode', [
        ['advanced', 'Advanced steps'],
        ['simple', 'Simple (2 steps)'],
      ])}</div>
      <div class="field"><div class="field-label">Camera while playing</div>${toggle('view', [
        ['fp', 'Chandrappan’s eyes'],
        ['overview', 'Overview'],
      ])}</div>
      <div class="modal-actions">
        <button class="btn-ghost small" data-go="reset">Reset saved data</button>
        <button class="btn-primary" data-go="save">Save</button>
      </div>`);
  }

  showResults(v: ResultsView) {
    this.results = v;
    this.root.className = 'screens results';
    const canAct = v.canAct !== false;
    const card = (u: UpgradeDef) => {
      const owned = v.owned.has(u.id);
      const afford = v.money >= u.cost && canAct;
      return `<div class="upgrade ${owned ? 'owned' : ''}">
        <div class="upgrade-name">${u.name}</div>
        <div class="upgrade-effect">${u.effect}</div>
        <button class="${owned ? 'btn-ghost' : 'btn-gold'}" data-buy="${u.id}" ${owned || !afford ? 'disabled' : ''}>
          ${owned ? 'Owned ✓' : `Buy ₹${u.cost}`}
        </button>
      </div>`;
    };
    this.root.innerHTML = `
      <div class="results-card">
        <div class="title-mal">Divasam ${v.day} kazhinju!</div>
        <h2>Day ${v.day} complete</h2>
        <dl class="stats">
          <dt>Orders completed</dt><dd>${v.completed}</dd>
          <dt>Customers lost</dt><dd>${v.lost}</dd>
          <dt>Earned today</dt><dd>₹${v.earnings}</dd>
          <dt>Reputation</dt><dd class="hearts-text">${'♥'.repeat(v.reputation)}<span>${'♥'.repeat(v.maxReputation - v.reputation)}</span></dd>
          <dt>Cash in the box</dt><dd>₹${v.money}</dd>
        </dl>
        <h3>Shop upgrades</h3>
        <div class="upgrades">${UPGRADES.map(card).join('')}</div>
        ${
          canAct
            ? `<button class="btn-gold big" data-go="next">Adutha Divasam! <small>(${v.nextQuota} customers)</small></button>`
            : `<p class="muted waiting-host">The host picks upgrades and opens the next day…</p>`
        }
      </div>`;
  }

  /** Re-render results after a purchase (money/owned changed). */
  refreshResults(v: Partial<ResultsView>) {
    if (this.results) this.showResults({ ...this.results, ...v });
  }

  private modal(inner: string) {
    const m = document.createElement('div');
    m.className = 'modal-wrap';
    m.innerHTML = `<div class="modal">${inner}</div>`;
    this.root.querySelector('.modal-wrap')?.remove();
    this.root.append(m);
  }

  private closeModal() {
    this.root.querySelector('.modal-wrap')?.remove();
  }

  private onInput = (e: Event) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset.field === 'shopName') {
      this.profile.shopName = t.value;
      this.h.onPreview({ ...this.profile, shopName: t.value.trim() || DEFAULT_PROFILE.shopName });
    }
  };

  private onClick = (e: MouseEvent) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.swatch) {
      const key = d.swatch as 'trim' | 'shirt' | 'apron';
      this.profile[key] = d.color!;
      b.parentElement!.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('on', s === b));
      this.h.onPreview({ ...this.profile, shopName: this.profile.shopName.trim() || DEFAULT_PROFILE.shopName });
      return;
    }
    if (d.set) {
      (this.profile as unknown as Record<string, string>)[d.set] = d.value!;
      b.parentElement!.querySelectorAll('button').forEach((s) => s.classList.toggle('on', s === b));
      return;
    }
    if (d.buy) return this.h.onBuy(d.buy as UpgradeId);
    switch (d.go) {
      case 'start':
        return this.h.onStart();
      case 'continue':
        return this.h.onContinue();
      case 'multi':
        return this.h.onMulti();
      case 'create':
        return this.h.onCreateRoom(this.nameValue());
      case 'join': {
        const code = (this.root.querySelector<HTMLInputElement>('[data-field="code"]')?.value ?? '').trim().toUpperCase();
        return this.h.onJoinRoom(code, this.nameValue());
      }
      case 'lobby-continue':
        return this.h.onLobbyContinue();
      case 'leave':
        return this.h.onLeaveRoom();
      case 'copy': {
        const link = b.dataset.link ?? '';
        void navigator.clipboard?.writeText(link).then(() => (b.textContent = 'Copied!'));
        return;
      }
      case 'howto':
        return this.showHowTo();
      case 'settings':
        return this.showSettings(this.profile);
      case 'close':
        return this.closeModal();
      case 'save':
        this.h.onSaveSettings({ ...this.profile });
        return this.closeModal();
      case 'reset':
        this.h.onResetData();
        return this.closeModal();
      case 'back':
        return this.h.onBackToMenu();
      case 'open':
        return this.h.onOpenShop({ ...this.profile, shopName: this.profile.shopName.trim() || DEFAULT_PROFILE.shopName });
      case 'next':
        return this.h.onNextDay();
    }
  };

  private nameValue(): string {
    return (this.root.querySelector<HTMLInputElement>('[data-field="playerName"]')?.value ?? '').trim().slice(0, 18);
  }

  /** Multiplayer: create a room or join one with a code. */
  showMulti(name: string, code = '', status = '', busy = false) {
    this.root.className = 'screens customize';
    this.root.innerHTML = `
      <div class="side-card">
        <h2>Play with friends</h2>
        <p class="muted">Up to 4 cooks share one chayakkada. Talk with your mic – voices get quieter the further apart you stand.</p>
        <label class="field">
          <span class="field-label">Your name</span>
          <input class="text-input" data-field="playerName" maxlength="18" placeholder="Ammu, Kuttan…" value="${esc(name)}" />
        </label>
        <div class="field">
          <button class="btn-gold big wide" data-go="create" ${busy ? 'disabled' : ''}>Create a room</button>
        </div>
        <div class="or">or join a friend</div>
        <div class="join-row">
          <input class="text-input code" data-field="code" maxlength="4" placeholder="CODE" value="${esc(code)}" />
          <button class="btn-primary" data-go="join" ${busy ? 'disabled' : ''}>Join</button>
        </div>
        <p class="status ${status.startsWith('!') ? 'bad' : ''}">${esc(status.replace(/^!/, ''))}</p>
        <p class="muted small">Tip: use headphones so your mic doesn't pick up the game.</p>
        <div class="side-actions"><button class="btn-ghost" data-go="back">Back</button></div>
      </div>`;
  }

  /** Host lobby: share the code, see who joined, then set up the shop. */
  showLobbyHost(code: string, players: string[], link: string, warn = '') {
    this.root.className = 'screens customize';
    this.root.innerHTML = `
      <div class="side-card">
        <h2>Room <span class="room-big">${esc(code)}</span></h2>
        <p class="muted">Tell your friends this code, or send them the link.</p>
        <button class="btn-ghost small" data-go="copy" data-link="${esc(link)}">Copy invite link</button>
        <ul class="lobby-players">${players.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
        ${warn ? `<p class="status bad">${esc(warn)}</p>` : ''}
        <div class="side-actions">
          <button class="btn-ghost" data-go="leave">Close room</button>
          <button class="btn-gold big" data-go="lobby-continue">Set up the shop</button>
        </div>
      </div>`;
  }

  /** Guest lobby: connected, waiting for the host. */
  showLobbyGuest(code: string, status: string) {
    this.root.className = 'screens customize';
    this.root.innerHTML = `
      <div class="side-card">
        <h2>Room <span class="room-big">${esc(code)}</span></h2>
        <p>${esc(status)}</p>
        <p class="muted">Press <b>T</b> to turn your mic on once you're in. Walk close to someone to hear them clearly.</p>
        <div class="side-actions"><button class="btn-ghost" data-go="leave">Leave room</button></div>
      </div>`;
  }

  /** Settings on the menu need the current profile. */
  setProfile(p: Profile) {
    this.profile = { ...p };
  }
}
