// The screenshot scenes behind ?shot=title|play|land|end. Each one plays the real
// rules forward from a fresh world — the play and land scenes are steered by a
// small autopilot that aims at the next ring or the strip — so the frame is what
// a short game really looks like, and the same seed always gives the same frame.
import { SCREEN_TITLE, SCREEN_PLAY, SCREEN_OVER, SCREEN_END } from './world.js';
import { STRIPS } from './config.js';

const STEP = 1 / 60;

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Steer the plane toward the current ring (or the strip when the rings are done).
function autopilot(world) {
  const p = world.plane;
  const leg = world.rings.currentRing();
  const strip = STRIPS[world.rings.legIndex === 0 ? 'pine' : world.rings.legIndex === 1 ? 'light' : 'gull'];
  const target = leg || { x: strip.x, y: world.terrain.heightAt(strip.x, strip.z) + 25, z: strip.z };
  const dx = target.x - p.pos.x;
  const dz = target.z - p.pos.z;
  const desiredHeading = Math.atan2(dx, -dz);
  const headingErr = wrapAngle(desiredHeading - p.heading);
  const altErr = target.y - p.pos.y;
  const dist = Math.sqrt(dx * dx + dz * dz);
  return {
    pitch: Math.max(-1, Math.min(1, altErr * 0.012 + (dist < 120 ? -0.15 : 0))),
    roll: Math.max(-1, Math.min(1, -headingErr * 1.4)),
    rudder: 0,
    throttleDelta: p.throttle < 0.78 ? 1 : p.throttle > 0.85 ? -1 : 0,
    flapPressed: false,
    gearPressed: false,
  };
}

function flyFor(world, seconds) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (world.screen !== SCREEN_PLAY) break;
    world.step(STEP, autopilot(world));
  }
}

// Final approach: hold the strip's heading and ride a gentle glide slope down
// to the threshold, gear down and flaps full, at landing speed. The nose aims
// at a point on the centreline past the far threshold, so wind drift is
// corrected instead of carried onto the grass beside the strip.
function landFor(world, seconds) {
  const strip = STRIPS.pine;
  const rad = (strip.heading * Math.PI) / 180;
  const stripH = world.terrain.heightAt(strip.x, strip.z);
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (world.screen !== SCREEN_PLAY) break;
    const p = world.plane;
    // Track the centreline: aim at a point on it 120 m ahead, so a lateral
    // offset becomes a heading correction and wind drift is flown out.
    const along = (p.pos.x - strip.x) * Math.sin(rad) + (p.pos.z - strip.z) * Math.cos(rad);
    const across = (p.pos.x - strip.x) * Math.cos(rad) - (p.pos.z - strip.z) * Math.sin(rad);
    const desiredHeading = rad + Math.atan2(-across, 60);
    const distToThreshold = along - strip.length / 2;
    // The glide ends AT the ground: the floor is the strip itself, so the
    // plane actually touches down instead of skimming over it forever.
    const desiredAlt = stripH + 1.5 + Math.max(0, distToThreshold) * 0.10;
    const headingErr = wrapAngle(desiredHeading - p.heading);
    world.step(STEP, {
      pitch: Math.max(-1, Math.min(1, (desiredAlt - p.pos.y) * 0.03)),
      roll: Math.max(-1, Math.min(1, -headingErr * 2.2)),
      rudder: 0,
      throttleDelta: p.throttle < 0.38 ? 1 : p.throttle > 0.44 ? -1 : 0,
      flapPressed: false,
      gearPressed: false,
    });
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * Any name other than play/land/end is the title scene.
 */
export function stageShot(name, world) {
  world.resetFlight();
  if (name === 'play') {
    world.startRoute();
    flyFor(world, 16);
    return { screen: SCREEN_PLAY };
  }
  if (name === 'land') {
    world.startRoute();
    // Skip ahead: stamp leg 1's rings, then put the Kestrel on final for Pine.
    world.rings.ringIndex = world.rings.meshes.length;
    world.rings.updateGlow();
    const strip = STRIPS.pine;
    const rad = (strip.heading * Math.PI) / 180;
    const p = world.plane;
    p.pos.set(
      strip.x - Math.sin(rad) * 320,
      world.terrain.heightAt(strip.x, strip.z) + 55,
      strip.z + Math.cos(rad) * 320,
    );
    p.heading = rad;
    p.pitch = -0.06;
    p.roll = 0;
    p.speed = 36;
    p.throttle = 0.4;
    p.flaps = 2;
    p.gearDown = true;
    p.airborne = true;
    landFor(world, 3.6);
    return { screen: SCREEN_PLAY };
  }
  if (name === 'end') {
    world.startRoute();
    world.deliveries = 3;
    world.score = 4860;
    world.elapsed = 512;
    world.timeBonus = 832;
    world.legIndex = 2;
    world.screen = SCREEN_END;
    world.time = 9;
    const strip = STRIPS.gull;
    const p = world.plane;
    p.pos.set(strip.x, world.terrain.heightAt(strip.x, strip.z) + 1.4, strip.z);
    p.heading = (strip.heading * Math.PI) / 180;
    p.speed = 0;
    p.airborne = false;
    return { screen: SCREEN_END };
  }
  // Title: the Kestrel parked on the home strip at golden hour, engine off.
  // The orbit angle puts the sunset behind the plane's side profile.
  world.screen = SCREEN_TITLE;
  world.time = 9;
  return { screen: SCREEN_TITLE, over: false };
}
