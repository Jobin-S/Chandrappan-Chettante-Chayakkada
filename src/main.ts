import * as THREE from 'three';
import './styles.css';
import { createStage } from './scene';
import { buildWorld } from './world';
import { FLOOR, buildShop } from './shop';
import { Rain } from './effects';
import { CameraDirector, ViewMode } from './camera';
import { Picker } from './interactions';
import { createHud } from './ui';
import { Game } from './game';
import { Screens } from './screens';
import { HostPanel } from './hostPanel';
import { AudioEngine } from './audio';
import { Profile, clearProfile, clearRun, loadProfile, loadRun, saveProfile } from './storage';

/**
 * Flow: Main menu → Customize → Open shop → day (first person by default)
 * → Day results + upgrades → next day … → game over → try again / menu.
 * H opens the host panel, M mutes, P pauses, V switches camera.
 */

const app = document.getElementById('app')!;
const hudRoot = document.getElementById('hud')!;

const stage = createStage(app);
const world = buildWorld(stage.scene);
const shop = buildShop(stage.scene);
const rain = new Rain(stage.scene);
const director = new CameraDirector(stage.camera, stage.renderer.domElement, FLOOR);
const audio = new AudioEngine();

let profile: Profile = loadProfile();
shop.setLook(profile);
audio.setMuted(profile.muted);

let game: Game;
const hud = createHud(hudRoot, {
  onResetCamera: () => director.reset(),
  onTogglePause: () => togglePause(),
  onPutDown: () => game.putDown(),
  onPickItem: (uid) => game.pickItem(uid),
  onServe: (id) => {
    const c = game.customers.find((x) => x.id === id);
    if (c) game.serve(c);
  },
  onRestart: () => openShop(profile),
  onMainMenu: () => goMenu(),
  onToggleView: () => toggleView(),
  onLook: (w) => game.look(w),
  onToggleMute: () => toggleMute(),
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
});

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
  onBackToMenu: () => goMenu(),
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

const host = new HostPanel(document.body, {
  spawnAmmavan: () => game.hostSpawn('ammavan'),
  rush: () => game.startRush(),
  toggleRain: () => {
    const on = !game.heavyRain;
    game.setHeavyRain(on);
    rain.setHeavy(on);
    audio.setHeavyRain(on);
    return on;
  },
  funny: () => game.funnyLine(),
  give100: () => game.giveMoney(100),
  resetDay: () => game.resetDay(),
});

director.onModeChange = (m: ViewMode) => {
  shop.setShopkeeperVisible(m !== 'fp');
  hud.setViewMode(m === 'fp');
};

function playView() {
  director.setMode(profile.view === 'fp' ? 'fp' : 'overview');
}

function goMenu() {
  game.toMenu();
  audio.setPaused(false);
  hud.setVisible(false);
  hud.setEvent(null);
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
  if (k === 'h') host.toggle();
  if (k === '1' && game.phase === 'playing') game.look('counter');
  if (k === '2' && game.phase === 'playing') game.look('kitchen');
});

const clock = new THREE.Clock();
const ahead = new THREE.Vector3();
let roofOpacity = 1;
let storm = 0;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  director.walkEnabled = game.phase === 'playing' && !game.paused;
  director.update(dt);
  world.update(dt, t);
  shop.update(dt, t);
  rain.update(dt);
  game.update(dt, t);
  picker.update(t);

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
  requestAnimationFrame(frame);
}

goMenu();
requestAnimationFrame(frame);

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__chayakkada = { stage, director, picker, shop, game, screens, audio, host };
}
