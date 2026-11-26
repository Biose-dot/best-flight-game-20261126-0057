// The Kestrel: a rugged little high-wing mail plane, built from primitives and
// painted cream-and-red with a "SKYPOST" tail. The flight model is arcade with
// real bones: throttle sets target speed, pitch trades speed for altitude,
// bank turns the nose, and below stall speed she sinks and wallows.
import { PLANE } from './config.js';

const THREE = window.THREE;

export function buildPlaneMesh() {
  const group = new THREE.Group();
  const cream = new THREE.MeshLambertMaterial({ color: 0xf2e6c8 });
  const red = new THREE.MeshLambertMaterial({ color: 0xc23b2e });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2e3440 });
  const glass = new THREE.MeshPhongMaterial({
    color: 0x9fd8ff, shininess: 120, specular: 0xffffff, transparent: true, opacity: 0.9,
  });

  // Fuselage: a tapered body with a red nose and tail stripe.
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.55, 6.4, 10), cream);
  body.rotation.x = Math.PI / 2;
  group.add(body);
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.86, 0.7, 1.1, 10), red);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = -3.6;
  group.add(nose);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.87, 0.87, 0.5, 10), red);
  stripe.rotation.x = Math.PI / 2;
  stripe.position.z = 1.6;
  group.add(stripe);

  // Canopy.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.72, 12, 8), glass);
  canopy.scale.set(1, 0.75, 1.7);
  canopy.position.set(0, 0.62, -0.9);
  group.add(canopy);

  // High wing and tailplane.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.22, 2.1), red);
  wing.position.set(0, 0.85, -0.4);
  group.add(wing);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.18, 1.3), cream);
  tail.position.set(0, 0.35, 3.1);
  group.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.9, 1.6), red);
  fin.position.set(0, 1.0, 3.2);
  group.add(fin);

  // Propeller: hub plus two blurred blades on a spinning group.
  const prop = new THREE.Group();
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), dark);
  prop.add(hub);
  const bladeMat = new THREE.MeshBasicMaterial({ color: 0x1c1f26, transparent: true, opacity: 0.55 });
  for (const angle of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.4, 0.08), bladeMat);
    blade.rotation.z = angle;
    prop.add(blade);
  }
  prop.position.z = -4.25;
  group.add(prop);
  group.userData.prop = prop;

  // Fixed gear with little wheel fairings; they fold away visually with G.
  const gear = new THREE.Group();
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 6), dark);
    leg.position.set(side * 0.95, -0.9, -0.6);
    leg.rotation.z = side * 0.35;
    gear.add(leg);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 1.25, -1.4, -0.6);
    gear.add(wheel);
  }
  group.add(gear);
  group.userData.gear = gear;

  // Flaps: two panels under the wing trailing edge that drop with F.
  const flaps = new THREE.Group();
  for (const side of [-1, 1]) {
    const flap = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 0.9), red);
    flap.position.set(side * 2.6, 0.72, 0.75);
    flaps.add(flap);
  }
  group.add(flaps);
  group.userData.flaps = flaps;

  // Navigation lights: red left, green right, white tail.
  const navLights = [];
  for (const [color, x, y, z] of [[0xff4444, -5.7, 0.85, -0.4], [0x44ff66, 5.7, 0.85, -0.4], [0xffffff, 0, 0.4, 3.9]]) {
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6),
      new THREE.MeshBasicMaterial({ color }));
    light.position.set(x, y, z);
    group.add(light);
    navLights.push(light);
  }
  group.userData.navLights = navLights;

  // A soft blob shadow under the plane when it is low.
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const sctx = shadowCanvas.getContext('2d');
  const grad = sctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0,0,0,0.4)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 12),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.userData.isBlobShadow = true;
  group.add(shadow);
  group.userData.blobShadow = shadow;

  return group;
}

export class FlightModel {
  constructor() {
    this.reset();
  }

  reset() {
    this.pos = new THREE.Vector3(0, 8, 40);
    this.heading = Math.PI / 2; // facing east down runway 09
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;
    this.throttle = 0;
    this.flaps = 0; // 0 up, 1 half, 2 full
    this.gearDown = true;
    this.airborne = false;
    this.verticalSpeed = 0;
    this.groundSpeed = 0;
    this.stalled = false;
    this.propAngle = 0;
  }

  forwardVector() {
    return new THREE.Vector3(
      Math.sin(this.heading) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.heading) * Math.cos(this.pitch),
    );
  }

  // input: { pitch: -1..1 (pull up positive), roll: -1..1, rudder: -1..1,
  //          throttleDelta, flaps, gear } — dt seconds, wind Vector3 in m/s.
  step(dt, input, wind, groundHeight) {
    const stalled = this.speed < PLANE.stallSpeed;
    this.stalled = stalled && this.airborne;
    const authority = stalled ? 0.35 : 1;

    // Throttle and speed.
    this.throttle = Math.min(1, Math.max(0, this.throttle + input.throttleDelta * dt * 0.8));
    const flapDrag = this.flaps * PLANE.drag;
    const target = this.throttle * PLANE.maxSpeed;
    const accel = PLANE.accel * (1 - this.speed / (PLANE.maxSpeed + 12)) - flapDrag * 4;
    this.speed += Math.sign(target - this.speed) * Math.min(Math.abs(target - this.speed), Math.abs(accel) * dt + 2 * dt);
    if (!this.airborne && this.speed < 4 && this.throttle < 0.05) this.speed = Math.max(0, this.speed - 6 * dt);

    // Pitch and roll ease toward the pilot's command.
    const pitchTarget = input.pitch * 0.42 * authority;
    const rollTarget = input.roll * 0.85 * authority;
    this.pitch += (pitchTarget - this.pitch) * Math.min(1, PLANE.pitchRate * 2.2 * dt);
    this.roll += (rollTarget - this.roll) * Math.min(1, PLANE.rollRate * 2.2 * dt);

    // Bank turns the nose; rudder helps a little and counters adverse yaw.
    const turnAuthority = Math.min(1, this.speed / PLANE.cruiseSpeed);
    this.heading += (-this.roll * PLANE.turnRate * turnAuthority + input.rudder * 0.12 * turnAuthority) * dt;

    // Vertical speed: pitch converts speed into climb; stalls and flaps sink her.
    let climb = this.speed * Math.sin(this.pitch) * PLANE.climbFactor;
    if (stalled && this.airborne) climb -= PLANE.sinkRate * (1 - this.speed / PLANE.stallSpeed);
    if (this.flaps === 2) climb -= 1.5;
    if (!this.airborne) climb = Math.max(0, climb);
    this.verticalSpeed = climb;

    // Move: forward plus wind drift.
    const fwd = this.forwardVector();
    this.pos.x += (fwd.x * this.speed + wind.x) * dt;
    this.pos.z += (fwd.z * this.speed + wind.z) * dt;
    if (this.airborne) {
      this.pos.y += climb * dt;
    } else {
      this.pos.y = groundHeight + 1.4;
      if (this.speed > 30 && this.pitch > 0.12) {
        this.airborne = true;
        this.pos.y += 0.5;
      }
    }
    if (this.airborne && this.pos.y <= groundHeight + 1.4) {
      this.pos.y = groundHeight + 1.4;
      this.airborne = false;
    }
    this.groundSpeed = Math.sqrt(
      (fwd.x * this.speed + wind.x) ** 2 + (fwd.z * this.speed + wind.z) ** 2);
    this.propAngle += (2 + this.throttle * 38) * dt;
  }

  applyToMesh(mesh, groundHeight) {
    mesh.position.copy(this.pos);
    mesh.rotation.order = 'YXZ';
    mesh.rotation.y = this.heading;
    mesh.rotation.x = -this.pitch;
    mesh.rotation.z = this.roll;
    mesh.userData.prop.rotation.z = this.propAngle;
    mesh.userData.gear.visible = this.gearDown;
    mesh.userData.flaps.rotation.x = this.flaps * 0.5;
    const agl = this.pos.y - groundHeight;
    const shadow = mesh.userData.blobShadow;
    shadow.visible = agl < 60;
    if (shadow.visible) {
      shadow.position.y = -this.pos.y + groundHeight + 0.4;
      const s = Math.max(0.35, 1 - agl / 90);
      shadow.scale.setScalar(s);
      shadow.material.opacity = s;
      shadow.rotation.x = -Math.PI / 2;
      // Keep the blob level under the plane regardless of bank.
      shadow.rotation.z = 0;
    }
  }
}
