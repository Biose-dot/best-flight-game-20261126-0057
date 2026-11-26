// Bootstrap: build the world, wire keyboard + mouse, run the frame loop, and
// flip the title / pause / crash / complete overlays with the game state.
// ?seed= picks the archipelago; ?shot=title|play|land|end stages a screenshot.
import { Terrain } from './terrain.js';
import { Sky } from './sky.js';
import { World, SCREEN_TITLE, SCREEN_PLAY, SCREEN_OVER, SCREEN_END } from './world.js';
import { Hud } from './hud.js';
import { Renderer } from './render.js';
import { stageShot } from './shots.js';

const THREE = window.THREE;
const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed') || 7) >>> 0;
const shotName = params.get('shot') || '';

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');

// The scene graph is built in dependency order: sky dome first (it needs the
// scene), then terrain (the heightfield everything collides with), then the
// world that flies the plane through it.
const renderer = new Renderer(canvas, null);
const scene = renderer.scene;
const sky = new Sky(scene, seed);
const terrain = new Terrain(scene, seed);
const world = new World(scene, terrain, sky, seed);
renderer.world = world;
const hud = new Hud();
world.hud = hud;

const overlays = {
  title: document.getElementById('overlay-title'),
  pause: document.getElementById('overlay-pause'),
  over: document.getElementById('overlay-over'),
  end: document.getElementById('overlay-end'),
};

function showOverlay(name) {
  for (const key of Object.keys(overlays)) overlays[key].classList.toggle('hidden', key !== name);
  if (!name) for (const key of Object.keys(overlays)) overlays[key].classList.add('hidden');
}

// --- Input: keyboard flies, mouse clicks buttons and can steer as a stick. ---
const keys = new Set();
let mouseSteer = false;
let mouseX = 0; // -1..1 across the canvas
let mouseY = 0; // -1..1 down the canvas
let paused = false;
let flapQueued = false;
let gearQueued = false;

window.addEventListener('keydown', (event) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) event.preventDefault();
  if (event.repeat) return;
  keys.add(event.key.toLowerCase());
  if (event.key === 'f' || event.key === 'F') flapQueued = true;
  if (event.key === 'g' || event.key === 'G') gearQueued = true;
  if (event.key === 'm' || event.key === 'M') world.sound.setMuted(!world.sound.muted);
  if (event.key === 'c' || event.key === 'C') world.cameraMode = (world.cameraMode + 1) % 3;
  if (event.key === 'p' || event.key === 'P' || event.key === 'Escape') togglePause();
  if (event.key === 'r' || event.key === 'R') restart();
});
window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
canvas.addEventListener('pointerdown', (event) => {
  mouseSteer = true;
  mouseX = (event.clientX / window.innerWidth) * 2 - 1;
  mouseY = (event.clientY / window.innerHeight) * 2 - 1;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (!mouseSteer) return;
  mouseX = (event.clientX / window.innerWidth) * 2 - 1;
  mouseY = (event.clientY / window.innerHeight) * 2 - 1;
});
canvas.addEventListener('pointerup', () => { mouseSteer = false; });
canvas.addEventListener('pointercancel', () => { mouseSteer = false; });

function readInput() {
  let pitch = 0;
  let roll = 0;
  let rudder = 0;
  let throttleDelta = 0;
  if (keys.has('arrowup')) pitch += 1;
  if (keys.has('arrowdown')) pitch -= 1;
  if (keys.has('arrowleft')) roll += 1;
  if (keys.has('arrowright')) roll -= 1;
  if (keys.has('a')) rudder += 1;
  if (keys.has('d')) rudder -= 1;
  if (keys.has('w')) throttleDelta += 1;
  if (keys.has('s')) throttleDelta -= 1;
  if (mouseSteer) {
    pitch += -mouseY * 0.9;
    roll += -mouseX * 0.9;
  }
  const input = {
    pitch: Math.max(-1, Math.min(1, pitch)),
    roll: Math.max(-1, Math.min(1, roll)),
    rudder: Math.max(-1, Math.min(1, rudder)),
    throttleDelta,
    flapPressed: flapQueued,
    gearPressed: gearQueued,
  };
  flapQueued = false;
  gearQueued = false;
  return input;
}

function togglePause() {
  if (world.screen !== SCREEN_PLAY) return;
  paused = !paused;
  showOverlay(paused ? 'pause' : null);
  if (!paused) hud.showGame(true);
}

function restart() {
  paused = false;
  world.startRoute();
  hud.showGame(true);
  showOverlay(null);
  statusEl.textContent = 'Route restarted. Three islands are waiting for their post.';
}

function bindButton(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', () => { world.sound.ensure(); world.sound.click(); fn(); });
}
bindButton('btn-fly', () => {
  world.sound.ensure();
  world.startRoute();
  hud.showGame(true);
  showOverlay(null);
  statusEl.textContent = 'Flying the Aurora Mail Run. Thread the glowing rings, then land on the strip.';
});
bindButton('btn-how', () => {
  const el = document.getElementById('how-text');
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
});
bindButton('btn-resume', togglePause);
bindButton('btn-restart1', restart);
bindButton('btn-retry', restart);
bindButton('btn-again', restart);

// --- Screenshot staging: ?shot= puts the game in a fixed, real state. ---
let shotStaged = null;
if (shotName) {
  shotStaged = stageShot(shotName, world);
  if (shotStaged.screen === SCREEN_PLAY) {
    hud.showGame(true);
    showOverlay(null);
  } else if (shotStaged.screen === SCREEN_END) {
    hud.showGame(false);
    showOverlay('end');
    fillEndCard();
  } else {
    showOverlay('title');
  }
}

function fillEndCard() {
  document.getElementById('end-score').textContent =
    `Score ${world.score.toLocaleString('en-US')} pts  ·  time ${Math.floor(world.elapsed / 60)}:${String(Math.floor(world.elapsed % 60)).padStart(2, '0')}  ·  time bonus +${world.timeBonus || 0}`;
  const stars = world.score >= 4500 ? '★★★' : world.score >= 3500 ? '★★☆' : '★☆☆';
  document.getElementById('end-stars').textContent = stars;
}

function fillOverCard() {
  document.getElementById('over-title').textContent = world.overTitle || 'CRASHED';
  document.getElementById('over-text').textContent = world.overReason || '';
  document.getElementById('over-score').textContent =
    `Score ${world.score.toLocaleString('en-US')} pts  ·  parcels ${world.deliveries}/3  ·  ${Math.floor(world.elapsed / 60)}:${String(Math.floor(world.elapsed % 60)).padStart(2, '0')}`;
}

// --- Frame loop. ---
let last = performance.now();
let framesRendered = 0;
let lastScreen = world.screen;

function frame(now) {
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  if (!paused) {
    if (world.screen === SCREEN_PLAY) world.step(dt, readInput());
    else world.step(dt, { pitch: 0, roll: 0, rudder: 0, throttleDelta: 0, flapPressed: false, gearPressed: false });
    if (world.screen === SCREEN_PLAY) hud.update(dt, world.viewState());
  }
  if (world.screen !== lastScreen) {
    lastScreen = world.screen;
    if (world.screen === SCREEN_OVER) {
      hud.showGame(false);
      fillOverCard();
      showOverlay('over');
      statusEl.textContent = `${world.overTitle}. ${world.overReason}`;
    } else if (world.screen === SCREEN_END) {
      hud.showGame(false);
      fillEndCard();
      showOverlay('end');
      statusEl.textContent = `Route complete! Score ${world.score}. All three islands got their post.`;
    } else if (world.screen === SCREEN_TITLE) {
      hud.showGame(false);
      showOverlay('title');
    }
  }
  renderer.render();
  framesRendered += 1;
  if (shotName && framesRendered === 40) window.__shotReady = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// For the test driver: the live world, and a readiness flag for screenshots.
window.__world = world;
window.__shotReady = !shotName;
