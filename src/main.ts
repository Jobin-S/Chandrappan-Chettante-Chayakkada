import * as THREE from 'three';
import './styles.css';
import { createStage } from './scene';
import { buildWorld } from './world';
import { FLOOR, REGULAR_SEATS, buildShop } from './shop';
import { Rain } from './effects';
import { CameraDirector, ViewMode } from './camera';
import { Picker } from './interactions';
import { createHud } from './ui';
import { Game, GameLink } from './game';
import { Screens } from './screens';
import { HostPanel } from './hostPanel';
import { AudioEngine } from './audio';
import { Traffic } from './traffic';
import { Regulars, Walkers } from './npcs';
import { Net, NetEvents } from './net';
import { Voice } from './voice';
import { Avatars } from './avatars';
import { Profile, clearProfile, clearRun, loadProfile, loadRun, saveProfile } from './storage';

/**
 * Flow: Main menu → Customize → Open shop → day (first person by default)
 * → Day results + upgrades → next day … → game over → try again / menu.
 * Multiplayer: Play with friends → create/join a room → the host sets up
 * the shop and everyone cooks together, talking with proximity voice.
 * Keys: H host panel, M mute, P pause, V camera, T microphone.
 */

const app = document.getElementById('app')!;
const hudRoot = document.getElementById('hud')!;

const stage = createStage(app);
const world = buildWorld(stage.scene);
const shop = buildShop(stage.scene);
const rain = new Rain(stage.scene);
const director = new CameraDirector(stage.camera, stage.renderer.domElement, FLOOR);
const audio = new AudioEngine();
const traffic = new Traffic(stage.scene);
const walkers = new Walkers(stage.scene);
const regulars = new Regulars(shop.root, REGULAR_SEATS);
const avatars = new Avatars(stage.scene);
const voice = new Voice(() => audio.context);

let profile: Profile = loadProfile();
shop.setLook(profile);
audio.setMuted(profile.muted);

let net: Net | null = null;
const micStates = new Map<string, boolean>();

let game: Game;
const hud = createHud(hudRoot, {
  onResetCamera: () => director.reset(),
  onTogglePause: () => togglePause(),
  onPutDown: () => game.putDown(),
  onPickItem: (uid) => game.pickItem(uid),
  onServe: (id) => game.serveId(id),
  onRestart: () => openShop(profile),
  onMainMenu: () => goMenu(),
  onToggleView: () => toggleView(),
  onLook: (w) => game.look(w),
  onToggleMute: () => toggleMute(),
  onToggleMic: () => void toggleMic(),
  onLeaveRoom: () => leaveRoom(),
});
hud.setMuted(profile.muted);

const picker = new Picker(stage.camera, stage.renderer.domElement, stage.scene, {
  onHover: (p, x, y) => game.hover(p, x, y),
  onClick: (p) => game.click(p),
});

game = new Game(stage.scene, stage.camera, stage.renderer.domElement, shop, picker, hud, director, rain, {
  onDayEnd: (v) => {
    // show the results beside the shop so bought upgrades visibly pop in
    director.setMode('customize');
    hud.setVisible(false);
    screens.showResults(v);
  },
  onGameOver: () => {},
  onEvent: (text, frac) => hud.setEvent(text, frac),
  sfx: (name) => audio.play(name),
  onHeavyRain: (on) => applyRain(on),
  onShopLook: (name, trim) => shop.setLook({ shopName: name, trim, shirt: profile.shirt, apron: profile.apron }),
  onDayStart: () => {
    screens.hide();
    hud.setVisible(true);
    playView();
  },
  onWaiting: () => {
    hud.setVisible(false);
    if (net) screens.showLobbyGuest(net.room, 'Connected! Waiting for the host to open the shop…');
    director.setMode('menu');
  },
});
game.setLocalLook(displayName(), profile.shirt, profile.apron);

const screens = new Screens(document.body, {
  onStart: () => {
    audio.start();
    screens.showCustomize(profile);
    director.setMode('customize');
  },
  onContinue: () => {
    const save = loadRun();
    if (!save) return goMenu();
    audio.start();
    screens.hide();
    hud.setVisible(true);
    game.continueRun(save, profile.shopName, profile.mode);
    playView();
  },
  onMulti: () => {
    audio.start();
    screens.showMulti(profile.playerName, new URLSearchParams(location.search).get('room') ?? '');
    director.setMode('customize');
  },
  onCreateRoom: (name) => void createRoom(name),
  onJoinRoom: (code, name) => void joinRoom(code, name),
  onLobbyContinue: () => {
    screens.showCustomize(profile);
    director.setMode('customize');
  },
  onLeaveRoom: () => leaveRoom(),
  onBackToMenu: () => (net?.isHost ? showHostLobby() : goMenu()),
  onPreview: (p) => shop.setLook(p),
  onOpenShop: (p) => openShop(p),
  onSaveSettings: (p) => {
    profile = { ...profile, mode: p.mode, view: p.view };
    saveProfile(profile);
  },
  onResetData: () => {
    clearProfile();
    clearRun();
    profile = loadProfile();
    shop.setLook(profile);
    goMenu();
  },
  onBuy: (id) => {
    if (game.buy(id)) screens.refreshResults({ money: game.money, owned: new Set(game.owned) });
  },
  onNextDay: () => {
    screens.hide();
    hud.setVisible(true);
    game.nextDay();
    playView();
  },
});

// the bus stops beside the shop: some passengers become customers, the rest stroll off
traffic.onBusStop = (door) => {
  audio.play('brake');
  if (game.isGuest) return; // the host decides who gets off
  const passengers = 1 + Math.floor(Math.random() * 3);
  const customers = game.busArrived(door, passengers);
  for (let i = customers; i < passengers; i++) walkers.spawn(door.clone().setX(door.x + (i - 1) * 0.4));
};
traffic.onHorn = () => audio.play('horn');
traffic.onBusSpawn = (dir, x) => {
  if (net?.isHost) net.broadcast({ t: 'bus', dir, x });
};

const host = new HostPanel(document.body, {
  spawnAmmavan: () => game.hostSpawn('ammavan'),
  rush: () => game.startRush(),
  toggleRain: () => {
    const on = !game.heavyRain;
    game.setHeavyRain(on);
    applyRain(on);
    return on;
  },
  funny: () => game.funnyLine(),
  give100: () => game.giveMoney(100),
  resetDay: () => game.resetDay(),
});

function applyRain(on: boolean) {
  rain.setHeavy(on);
  audio.setHeavyRain(on);
  host.setRain(on);
}

director.onModeChange = (m: ViewMode) => {
  shop.setShopkeeperVisible(m !== 'fp');
  hud.setViewMode(m === 'fp');
};

function displayName() {
  return profile.playerName || 'Chandrappan';
}

function playView() {
  director.setMode(profile.view === 'fp' ? 'fp' : 'overview');
}

function goMenu() {
  if (net && !net.isHost) return leaveRoom();
  game.toMenu();
  audio.setPaused(false);
  hud.setVisible(false);
  hud.setEvent(null);
  if (net?.isHost) return showHostLobby();
  screens.setProfile(profile);
  screens.showMenu(loadRun()?.day ?? null);
  director.setMode('menu');
}

function openShop(p: Profile) {
  profile = { ...profile, ...p };
  saveProfile(profile);
  shop.setLook(profile);
  audio.start();
  screens.hide();
  hud.setVisible(true);
  game.trim = profile.trim;
  game.setLocalLook(displayName(), profile.shirt, profile.apron);
  game.startRun(profile.shopName, profile.mode);
  playView();
}

function toggleView() {
  if (game.phase !== 'playing') return;
  profile.view = director.firstPerson ? 'overview' : 'fp';
  saveProfile(profile);
  playView();
}

function togglePause() {
  game.togglePause();
  audio.setPaused(game.paused);
}

function toggleMute() {
  profile.muted = !profile.muted;
  saveProfile(profile);
  audio.setMuted(profile.muted);
  hud.setMuted(profile.muted);
}

// =============================================================== multiplayer

const link: GameLink = {
  toHost: (m) => net?.send(net.hostId, m),
  toPlayer: (id, m) => net?.send(id, m),
  broadcast: (m, unreliable) => net?.broadcast(m, unreliable ? 'state' : 'rel'),
};

const netEvents: NetEvents = {
  onPeerOpen(id) {
    if (!net) return;
    // tell everyone our mic state; guests introduce themselves to the host
    net.send(id, { t: 'mic', on: voice.micOn });
    if (!net.isHost && id === net.hostId) {
      net.send(id, { t: 'hello', name: displayName(), shirt: profile.shirt, apron: profile.apron });
    }
    refreshRoom();
  },
  onPeerClose(id) {
    voice.detach(id);
    micStates.delete(id);
    if (net?.isHost) game.removePlayer(id);
    refreshRoom();
  },
  onMessage(from, msg) {
    if (!net) return;
    if (msg.t === 'mic') {
      micStates.set(from, !!msg.on);
      refreshRoom();
      return;
    }
    if (net.isHost && msg.t === 'hello') {
      const name = String(msg.name ?? 'Guest').slice(0, 18) || 'Guest';
      game.addPlayer(from, name, String(msg.shirt ?? '#5E93B6'), String(msg.apron ?? '#DB6846'));
      // introduce the newcomer to the other guests; they will dial each other for voice
      const others = [...game.players.values()].filter((p) => p.id !== from && p.id !== net!.id).map((p) => ({ id: p.id, name: p.name }));
      net.send(from, { t: 'welcome', peers: others });
      if (game.phase === 'menu') showHostLobby();
      refreshRoom();
      return;
    }
    if (!net.isHost && msg.t === 'welcome') {
      for (const p of (msg.peers as { id: string; name: string }[]) ?? []) void net.connectTo(p.id, p.name);
      return;
    }
    if (!net.isHost && msg.t === 'bus') {
      traffic.spawnBus(msg.dir === -1 ? -1 : 1, Number(msg.x));
      return;
    }
    game.onNetMessage(from, msg);
  },
  onTrack(id, stream) {
    voice.attach(id, stream);
  },
  onHostLost(reason) {
    leaveRoom(reason);
  },
};

async function createRoom(name: string) {
  if (net) return;
  audio.start(); // this click unlocks audio for voice chat
  profile.playerName = name;
  saveProfile(profile);
  screens.showMulti(name, '', 'Creating a room…', true);
  try {
    net = await Net.host(displayName(), netEvents);
  } catch (e) {
    screens.showMulti(name, '', `!${(e as Error).message}`);
    return;
  }
  game.setRole('host', net.id, link);
  game.setLocalLook(displayName(), profile.shirt, profile.apron);
  traffic.autoBus = true;
  showHostLobby();
  refreshRoom();
}

async function joinRoom(code: string, name: string) {
  if (net) return;
  audio.start(); // this click unlocks audio for voice chat
  profile.playerName = name;
  saveProfile(profile);
  if (!/^[A-Z0-9]{4}$/.test(code)) {
    screens.showMulti(name, code, '!Room codes have 4 letters.');
    return;
  }
  screens.showMulti(name, code, `Connecting to room ${code}…`, true);
  try {
    net = await Net.join(code, displayName(), netEvents);
  } catch (e) {
    net = null;
    screens.showMulti(name, code, `!${(e as Error).message}`);
    return;
  }
  game.setRole('guest', net.id, link);
  game.setLocalLook(displayName(), profile.shirt, profile.apron);
  traffic.autoBus = false;
  // the host connection opened before `net` was assigned: introduce ourselves now
  net.send(net.hostId, { t: 'hello', name: displayName(), shirt: profile.shirt, apron: profile.apron });
  net.send(net.hostId, { t: 'mic', on: voice.micOn });
  // spawn on a free spot inside the shop, facing the counter
  const spots: [number, number][] = [
    [1.2, -0.2],
    [2.2, 0.4],
    [-1.6, -0.6],
  ];
  const [x, z] = spots[Math.floor(Math.random() * spots.length)];
  director.placeAt(x, z, 0);
  screens.showLobbyGuest(code, 'Connected! Waiting for the host to open the shop…');
  refreshRoom();
}

function leaveRoom(reason = '') {
  const wasGuest = !!net && !net.isHost;
  voice.stopMic();
  voice.detachAll();
  net?.leave();
  net = null;
  micStates.clear();
  avatars.clear();
  game.setRole('solo', 'local', null);
  game.setLocalLook(displayName(), profile.shirt, profile.apron);
  traffic.autoBus = true;
  hud.setRoom(null);
  shop.setLook(profile);
  if (game.heavyRain && wasGuest) {
    game.heavyRain = false;
    applyRain(false);
  }
  goMenu();
  if (reason) hud.toast(reason, 'bad');
  history.replaceState(null, '', location.pathname);
}

function showHostLobby() {
  if (!net) return;
  const names = [`${displayName()} (you, host)`, ...[...game.players.values()].filter((p) => p.id !== net!.id).map((p) => p.name)];
  const url = `${location.origin}${location.pathname}?room=${net.room}`;
  screens.showLobbyHost(
    net.room,
    names,
    url,
    net.persistent || location.hostname === 'localhost' ? '' : 'Signaling has no shared store – add Upstash Redis in Vercel for reliable rooms.',
  );
  director.setMode('customize');
}

async function toggleMic() {
  if (!net) return;
  if (voice.micOn) {
    voice.stopMic();
    net.setMic(null);
  } else {
    try {
      audio.start();
      const track = await voice.startMic();
      net.setMic(track);
    } catch (e) {
      hud.toast((e as Error).message, 'bad');
    }
  }
  net.broadcast({ t: 'mic', on: voice.micOn });
  hud.setMic(voice.micOn, true);
  refreshRoom();
}

function refreshRoom() {
  if (!net) return hud.setRoom(null);
  const players: { name: string; me: boolean; host: boolean; speaking: boolean; mic: boolean }[] = [
    { name: displayName(), me: true, host: net.isHost, speaking: voice.speaking('me'), mic: voice.micOn },
  ];
  for (const p of game.remotePlayers()) {
    players.push({ name: p.name, me: false, host: p.id === net.hostId, speaking: voice.speaking(p.id), mic: micStates.get(p.id) ?? false });
  }
  hud.setRoom({ code: net.room, host: net.isHost, players });
  hud.setMic(voice.micOn, true);
}

// =================================================================== input

// UI click sound for every button
document.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('button')) audio.play('click');
});

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  const k = e.key.toLowerCase();
  if (k === 'r') director.reset();
  if (k === 'escape') game.escape();
  if (k === 'p') togglePause();
  if (k === 'v') toggleView();
  if (k === 'm') toggleMute();
  if (k === 't' && net) void toggleMic();
  if (k === 'h' && !game.isGuest) host.toggle();
  if (k === '1' && game.phase === 'playing') game.look('counter');
  if (k === '2' && game.phase === 'playing') game.look('kitchen');
});

// ==================================================================== loop

const clock = new THREE.Clock();
const ahead = new THREE.Vector3();
const tmp = new THREE.Vector3();
let roofOpacity = 1;
let storm = 0;
let simTime = 0;
let poseTimer = 0;
let roomTimer = 0;

let lastFrame = performance.now();

function frame() {
  lastFrame = performance.now();
  tick(Math.min(clock.getDelta(), 0.05));
  requestAnimationFrame(frame);
}

function toScreen(p: THREE.Vector3) {
  const v = p.clone().project(stage.camera);
  const r = stage.renderer.domElement.getBoundingClientRect();
  return { x: ((v.x + 1) / 2) * r.width + r.left, y: ((1 - v.y) / 2) * r.height + r.top, visible: v.z < 1 && Math.abs(v.x) < 1.1 };
}

/** One simulation + render step (also driven manually in dev tools). */
function tick(dt: number) {
  simTime += dt;
  const t = simTime;

  director.walkEnabled = game.phase === 'playing' && !game.paused;
  director.update(dt);
  game.setLocalPose(director.eye, director.yaw);
  // in overview, others (and you) see your shopkeeper where you last stood
  shop.shopkeeper.root.position.set(director.eye.x, director.eye.y - 1.95, director.eye.z);
  shop.shopkeeper.root.rotation.y = director.yaw;

  world.update(dt, t);
  shop.update(dt, t);
  rain.update(dt);
  traffic.update(dt);
  walkers.update(dt, t);
  regulars.update(dt, t);
  game.update(dt, t);
  picker.update(t);

  if (net) {
    // guests stream their pose to the host
    poseTimer -= dt;
    if (!net.isHost && poseTimer <= 0) {
      poseTimer = 0.08;
      const e = director.eye;
      net.send(net.hostId, { t: 'pose', x: +e.x.toFixed(3), y: +e.y.toFixed(3), z: +e.z.toFixed(3), yaw: +director.yaw.toFixed(3) }, 'state');
    }
    avatars.sync(game.remotePlayers());
    avatars.update(dt, t);
    const heads = avatars.heads();
    voice.update(stage.camera, heads);
    const listener = stage.camera.getWorldPosition(tmp).clone();
    hud.setNameTags(
      game.remotePlayers().map((p) => {
        const head = heads.get(p.id) ?? p.pos;
        const s = toScreen(head.clone().add(new THREE.Vector3(0, 0.45, 0)));
        return { id: p.id, name: p.name, x: s.x, y: s.y, visible: s.visible, speaking: voice.speaking(p.id), near: voice.audibility(p.id, listener, head) };
      }),
    );
    roomTimer -= dt;
    if (roomTimer <= 0) {
      roomTimer = 0.3;
      refreshRoom();
    }
  }

  // heavy rain: thicker mist and dimmer light, eased in and out
  storm = THREE.MathUtils.damp(storm, game.heavyRain ? 1 : 0, 1.2, dt);
  const fog = stage.scene.fog as THREE.Fog;
  fog.near = THREE.MathUtils.lerp(22, 10, storm);
  fog.far = THREE.MathUtils.lerp(110, 58, storm);
  stage.hemi.intensity = THREE.MathUtils.lerp(1.5, 1.1, storm);
  stage.sun.intensity = THREE.MathUtils.lerp(1.5, 0.8, storm);

  // fade the roof/awning whenever it hides what the camera is looking at
  const target =
    director.mode === 'overview'
      ? director.orbitTarget
      : stage.camera.getWorldDirection(ahead).multiplyScalar(8).add(stage.camera.position);
  roofOpacity = THREE.MathUtils.damp(roofOpacity, shop.blocksView(stage.camera.position, target) ? 0.22 : 1, 8, dt);
  shop.setRoofOpacity(roofOpacity);

  stage.renderer.render(stage.scene, stage.camera);
}

// Keep the shared shop running if the host's tab is in the background (rAF stops there).
window.setInterval(() => {
  if (net?.isHost && performance.now() - lastFrame > 250) {
    clock.getDelta();
    tick(0.05);
  }
}, 50);

goMenu();
requestAnimationFrame(frame);

// invite links: ?room=CODE opens the join screen
const invited = new URLSearchParams(location.search).get('room');
if (invited) screens.showMulti(profile.playerName, invited.toUpperCase());

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__chayakkada = {
    stage,
    director,
    picker,
    shop,
    game,
    screens,
    audio,
    host,
    traffic,
    walkers,
    voice,
    avatars,
    net: () => net,
    /** Advance the simulation by `seconds` (works while the tab is hidden). */
    step: (seconds: number) => {
      for (let i = 0; i < Math.round(seconds * 30); i++) tick(1 / 30);
    },
    /** Test voice without a microphone: send a tone as your "mic". */
    testTone: async (freq = 440) => {
      audio.start();
      const ctx = audio.context!;
      const osc = ctx.createOscillator();
      osc.frequency.value = freq;
      const dest = ctx.createMediaStreamDestination();
      osc.connect(dest);
      osc.start();
      const track = await voice.startMic(dest.stream);
      net?.setMic(track);
      net?.broadcast({ t: 'mic', on: true });
    },
  };
}
