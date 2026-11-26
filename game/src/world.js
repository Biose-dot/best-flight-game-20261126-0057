// The game itself: state machine (title → flying → landed → over / complete),
// the three-leg mail route, wind and gusts, landing and crash detection,
// scoring, the chase camera, and the per-frame glue between plane, rings,
// terrain, sky, HUD and sound.
import { LEGS, STRIPS, SCORE, PLANE, FUEL, WIND } from './config.js';
import { FlightModel } from './plane.js';
import { MailRings } from './rings.js';
import { SoundBank } from './audio.js';

const THREE = window.THREE;

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_OVER = 'over';
export const SCREEN_END = 'end';

export class World {
  constructor(scene, terrain, sky, seed) {
    this.scene = scene;
    this.terrain = terrain;
    this.sky = sky;
    this.seed = seed;
    this.plane = new FlightModel();
    this.rings = new MailRings(scene);
    this.sound = new SoundBank();
    this.screen = SCREEN_TITLE;
    this.elapsed = 0;
    this.score = 0;
    this.legIndex = 0;
    this.deliveries = 0;
    this.ringsCleared = 0;
    this.fuel = FUEL.capacity;
    this.overReason = '';
    this.overTitle = '';
    this.cameraMode = 0; // 0 chase, 1 close chase, 2 high
    this.wind = new THREE.Vector3();
    this.windDirDeg = WIND.baseDir;
    this.camPos = new THREE.Vector3(0, 30, 80);
    this.camLook = new THREE.Vector3(0, 10, 0);
    this.time = 0;
    this.gustPhase = 0;
    this.landingQuality = 0;
    this.onLeg = false; // true once the wheels leave the home strip
    this.resetFlight();
  }

  resetFlight() {
    this.plane.reset();
    const strip = STRIPS[LEGS[0].from];
    const rad = (strip.heading * Math.PI) / 180;
    this.plane.pos.set(strip.x, this.terrain.heightAt(strip.x, strip.z) + 1.4, strip.z);
    this.plane.heading = rad;
    this.legIndex = 0;
    this.deliveries = 0;
    this.ringsCleared = 0;
    this.score = 0;
    this.fuel = FUEL.capacity;
    this.elapsed = 0;
    this.onLeg = false;
    this.overReason = '';
    this.rings.loadLeg(0);
  }

  startRoute() {
    this.resetFlight();
    this.screen = SCREEN_PLAY;
    this.sound.ensure();
  }

  // Wind: a steady north-westerly plus slow gusts that push the plane sideways.
  updateWind(dt) {
    this.gustPhase += dt;
    const gust = Math.sin((this.gustPhase / WIND.gustPeriod) * Math.PI * 2) * WIND.gustAmp
      + Math.sin(this.gustPhase * 0.9) * 1.5;
    const speed = Math.max(0, WIND.baseSpeed + gust);
    const rad = ((WIND.baseDir + 180) * Math.PI) / 180; // blowing TOWARD the south-east
    this.wind.set(Math.sin(rad) * speed, 0, -Math.cos(rad) * speed);
    this.windDirDeg = WIND.baseDir;
  }

  stripFor(key) {
    return STRIPS[key];
  }

  // Is the plane over a strip, low and slow enough to count as on it?
  stripUnderPlane() {
    for (const key of Object.keys(STRIPS)) {
      const s = STRIPS[key];
      const rad = (s.heading * Math.PI) / 180;
      const along = (this.plane.pos.x - s.x) * Math.sin(rad) + (this.plane.pos.z - s.z) * Math.cos(rad);
      const across = (this.plane.pos.x - s.x) * Math.cos(rad) - (this.plane.pos.z - s.z) * Math.sin(rad);
      if (Math.abs(along) < s.length / 2 && Math.abs(across) < s.width / 2 + 6) return key;
    }
    return null;
  }

  step(dt, input) {
    this.time += dt;
    this.updateWind(dt);
    this.sky.update(dt, this.time);
    this.terrain.update(dt, this.time);
    this.rings.update(dt, this.time);
    if (this.screen !== SCREEN_PLAY) return;

    this.elapsed += dt;
    const groundH = this.terrain.heightAt(this.plane.pos.x, this.plane.pos.z);

    // Fuel burn follows the throttle; empty tanks mean a glider.
    const burn = FUEL.burnIdle + (FUEL.burnFull - FUEL.burnIdle) * this.plane.throttle;
    this.fuel = Math.max(0, this.fuel - burn * dt);
    if (this.fuel <= 0) input.throttleDelta = Math.min(input.throttleDelta, 0);
    if (this.fuel <= 0 && this.plane.throttle <= 0.01) this.plane.throttle = 0;

    // Flaps and gear keys, applied on the frame the key is pressed.
    if (input.flapPressed) {
      this.plane.flaps = (this.plane.flaps + 1) % 3;
      this.sound.click();
    }
    if (input.gearPressed) {
      this.plane.gearDown = !this.plane.gearDown;
      this.sound.click();
    }

    const wasAirborne = this.plane.airborne;
    const vsBefore = this.plane.verticalSpeed;
    this.plane.step(dt, input, this.wind, groundH);
    const p = this.plane;
    const stripKey = this.stripUnderPlane();

    // Touchdown: the moment the wheels meet the ground decides everything.
    if (wasAirborne && !p.airborne) {
      const hitWater = groundH < 1;
      const hard = Math.abs(vsBefore) > 7 || p.speed > 55;
      if (hitWater) return this.crash('Ditched in the sea', 'The Kestrel is in the drink. The mail is soggy, but the pilot is fine.');
      if (hard && Math.abs(vsBefore) > 7) {
        return this.crash('Crashed into the hillside', 'She came down too hard on the ridge. The mail is scattered across the heather.');
      }
      if (hard) return this.crash('Too fast to land', 'Ninety knots over rough ground is not a landing, it is a crash with style.');
      if (!p.gearDown) return this.crash('Belly landing', 'Gear up on rough ground — the Kestrel slid to a stop in a shower of sparks.');
      if (!stripKey) return this.crash('Rough field landing', 'The ground came up faster than the runway did.');
      this.sound.thud();
    }

    // A leg is live whenever the Kestrel is in the air: taking off starts it,
    // and so does starting airborne (a staged scene, or a resume). Landing
    // early on the target strip clears it again, in the landing branch below.
    if (!wasAirborne && p.airborne) {
      this.sound.blip(520, 0, 0.15, 'sine', 0.12);
    }
    if (p.airborne) this.onLeg = true;

    // Rings: only while airborne on the current leg.
    if (p.airborne && this.rings.checkPass(p.pos)) {
      this.score += SCORE.ring;
      this.ringsCleared += 1;
      this.sound.ringChime();
      this.hudToast(`Ring stamped! +${SCORE.ring}`);
    }

    // Landing: on a strip, gear down, gentle sink, slow enough.
    const agl = p.pos.y - groundH - 1.4;
    if (!p.airborne && stripKey && this.onLeg) {
      const leg = LEGS[this.legIndex];
      const vs = Math.abs(p.verticalSpeed);
      if (stripKey === leg.to && this.rings.ringsLeft() === 0) {
        // A delivery!
        const soft = Math.max(0, 1 - vs / 6) * Math.max(0, 1 - (p.speed - 18) / 45);
        this.landingQuality = soft;
        const bonus = Math.round(SCORE.softLanding * soft);
        this.score += SCORE.delivery + bonus;
        this.deliveries += 1;
        this.fuel = FUEL.capacity;
        this.sound.deliveryJingle();
        this.sound.thud();
        this.hudToast(`Parcel delivered! +${SCORE.delivery}${bonus ? `  ·  soft landing +${bonus}` : ''}`, 3);
        this.advanceLeg();
      } else if (stripKey === leg.to) {
        this.hudToast('Fly the rings first — the route is not stamped yet!', 2.5);
        this.onLeg = false; // taxiing counts as a fresh start of the leg
        this.resetLegRings();
      }
    }

    // Warnings while airborne; the touchdown block above handles ground contact.
    if (p.airborne) {
      if (p.stalled && agl < 25) {
        this.hudWarn('STALL — NOSE DOWN');
      } else if (agl < 18 && p.verticalSpeed < -6) {
        this.hudWarn('PULL UP');
      } else if (this.fuel < FUEL.reserveWarn) {
        this.hudWarn('LOW FUEL');
      } else {
        this.hudWarn(null);
      }
    } else {
      this.hudWarn(null);
      // Rolling off the end of a strip into the sea or scrub.
      if (stripKey === null && p.speed > 12 && groundH < 1) {
        return this.crash('Ran off into the sea', 'The takeoff roll ran out of island.');
      }
    }
    if (this.fuel <= 0 && !p.airborne && p.speed < 2) {
      return this.crash('Out of fuel', 'The tanks ran dry on the ground. The mail waits for a rescue boat.');
    }
    if (this.fuel <= 0 && p.airborne && p.speed < PLANE.stallSpeed && agl < 30) {
      this.hudWarn('OUT OF FUEL — GLIDE!');
    }

    this.sound.updateEngine(p.throttle, p.speed, p.airborne);
    this.updateCamera(dt);
  }

  hudToast(text, seconds) {
    if (this.hud) this.hud.toast(text, seconds);
  }

  hudWarn(text) {
    if (this.hud) this.hud.warn(text);
  }

  resetLegRings() {
    this.rings.loadLeg(this.legIndex);
    this.ringsCleared = 0;
  }

  advanceLeg() {
    this.onLeg = false;
    this.ringsCleared = 0;
    if (this.legIndex >= LEGS.length - 1) {
      this.completeRoute();
      return;
    }
    this.legIndex += 1;
    this.rings.loadLeg(this.legIndex);
    // Taxi to the next strip's start is skipped: the plane is already on it.
    const strip = STRIPS[LEGS[this.legIndex].from];
    const rad = (strip.heading * Math.PI) / 180;
    this.plane.pos.set(strip.x, this.terrain.heightAt(strip.x, strip.z) + 1.4, strip.z);
    this.plane.heading = rad;
    this.plane.pitch = 0;
    this.plane.roll = 0;
    this.plane.speed = 0;
    this.plane.airborne = false;
    this.plane.throttle = 0;
  }

  completeRoute() {
    const timeBonus = Math.max(0, Math.round((SCORE.parSeconds - this.elapsed) * SCORE.timeBonusPerSecond));
    this.score += timeBonus;
    this.timeBonus = timeBonus;
    this.screen = SCREEN_END;
    this.sound.stopEngine();
    this.sound.deliveryJingle();
  }

  crash(title, text) {
    this.screen = SCREEN_OVER;
    this.overTitle = title;
    this.overReason = text;
    this.sound.stopEngine();
    this.sound.thud();
  }

  updateCamera(dt) {
    const p = this.plane;
    const fwd = p.forwardVector();
    const back = 17 + p.speed * 0.06;
    const up = this.cameraMode === 2 ? 16 : 4.6;
    const desired = new THREE.Vector3(
      p.pos.x - fwd.x * back,
      Math.max(p.pos.y + up, this.terrain.heightAt(p.pos.x - fwd.x * back, p.pos.z - fwd.z * back) + 3),
      p.pos.z - fwd.z * back,
    );
    const look = new THREE.Vector3(p.pos.x + fwd.x * 26, p.pos.y + fwd.y * 20 + 1, p.pos.z + fwd.z * 26);
    const k = Math.min(1, dt * 4.5);
    this.camPos.lerp(desired, k);
    this.camLook.lerp(look, Math.min(1, dt * 6));
  }

  // The view the HUD and the camera read every frame.
  viewState() {
    const leg = LEGS[this.legIndex];
    const ring = this.rings.currentRing();
    const targetStrip = STRIPS[leg.to];
    const waypoint = ring
      ? { x: ring.x, z: ring.z, label: `Ring ${this.rings.ringIndex + 1}/${leg.rings.length}` }
      : { x: targetStrip.x, z: targetStrip.z, label: `Land: ${targetStrip.name}` };
    return {
      score: this.score,
      legIndex: this.legIndex,
      deliveries: this.deliveries,
      ringsCleared: this.ringsCleared,
      elapsed: this.elapsed,
      fuel: this.fuel,
      throttle: this.plane.throttle,
      flaps: this.plane.flaps,
      gearDown: this.plane.gearDown,
      altitude: Math.max(0, this.plane.pos.y - this.terrain.heightAt(this.plane.pos.x, this.plane.pos.z)),
      verticalSpeed: this.plane.verticalSpeed,
      heading: this.plane.heading,
      speed: this.plane.speed,
      pitch: this.plane.pitch,
      roll: this.plane.roll,
      pos: this.plane.pos,
      windDir: this.windDirDeg,
      windSpeedKt: Math.round(Math.hypot(this.wind.x, this.wind.z) * 1.94384),
      waypoint,
      remainingRings: this.rings.meshes
        .filter((m, i) => i >= this.rings.ringIndex)
        .map((m) => ({ x: m.position.x, z: m.position.z })),
    };
  }
}
