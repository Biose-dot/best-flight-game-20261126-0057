// The archipelago: three islands with heightfield terrain, a sea, runways with
// edge lights, pine and palm trees, a lighthouse with a sweeping beam, and
// harbour houses. terrainHeight(x, z) is the single source of truth the flight
// model uses for ground collision, so the mesh and the physics always agree.
import { makeNoise, mulberry32 } from './random.js';
import { STRIPS } from './config.js';

const THREE = window.THREE;

// Island definitions: centre, radius, peak height and terrain flavour.
const ISLANDS = [
  { x: 0, z: 0, r: 430, peak: 80, seed: 11 }, // Gull Island (home)
  { x: -900, z: -700, r: 390, peak: 110, seed: 23 }, // Pine Island
  { x: 800, z: -900, r: 270, peak: 55, seed: 37 }, // Lighthouse Rock
  { x: 620, z: 620, r: 150, peak: 34, seed: 51 }, // Gull Rock islet
  { x: -1150, z: 420, r: 170, peak: 46, seed: 67 }, // West islet
  { x: 150, z: -1350, r: 130, peak: 28, seed: 83 }, // North skerry
];

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export class Terrain {
  constructor(scene, seed) {
    this.scene = scene;
    this.noise = makeNoise(seed);
    this.rand = mulberry32(seed ^ 0x7e44a1);
    this.stripMeshes = {};
    this.buildOcean();
    this.buildIslands();
    this.buildRunways();
    this.buildTrees();
    this.buildLighthouse();
    this.buildHouses();
  }

  // Height of the land at (x, z); below 0 is open sea.
  heightAt(x, z) {
    let h = -6;
    for (const isl of ISLANDS) {
      const dx = x - isl.x;
      const dz = z - isl.z;
      const d = Math.sqrt(dx * dx + dz * dz) / isl.r;
      if (d >= 1) continue;
      const mask = smoothstep(1, 0.25, d);
      const n = this.noise(x * 0.004 + isl.seed, z * 0.004 + isl.seed * 1.7);
      const relief = 0.55 + 0.45 * n;
      const dome = Math.pow(Math.max(0, 1 - d * d), 0.8);
      h = Math.max(h, 2 + (isl.peak * dome * relief - 2) * mask + 2 * mask);
    }
    // Flatten a corridor along each runway, far past both thresholds, so a
    // landing approach flies over a gentle valley instead of into a hillside.
    // The pad is flat by the strip and rises only slowly toward the corridor's
    // edge, where it blends back into the island's natural relief.
    for (const key of Object.keys(STRIPS)) {
      const s = STRIPS[key];
      const rad = (s.heading * Math.PI) / 180;
      const along = (x - s.x) * Math.sin(rad) + (z - s.z) * Math.cos(rad);
      const across = (x - s.x) * Math.cos(rad) - (z - s.z) * Math.sin(rad);
      const halfL = s.length / 2 + 320;
      const halfW = s.width / 2 + 60;
      if (Math.abs(along) < halfL && Math.abs(across) < halfW) {
        const t = Math.max(Math.abs(along) / halfL, Math.abs(across) / halfW);
        const pad = key === 'gull' ? 7 : key === 'pine' ? 9 : 12;
        const cap = pad + 26 * smoothstep(0.25, 1, t);
        const blend = smoothstep(1, 0.55, t);
        const target = Math.min(h, cap);
        h = h * (1 - blend) + target * blend;
      }
    }
    return h;
  }

  buildOcean() {
    const geo = new THREE.PlaneGeometry(5600, 5600, 48, 48);
    const mat = new THREE.MeshPhongMaterial({
      color: 0x0e4d6b, specular: 0xff9a4d, shininess: 90, transparent: true, opacity: 0.96,
    });
    const sea = new THREE.Mesh(geo, mat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = 0;
    this.scene.add(sea);
    this.sea = sea;
  }

  buildIslands() {
    const geo = new THREE.PlaneGeometry(2900, 2900, 150, 150);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const sand = new THREE.Color(0xd9b380);
    const grass = new THREE.Color(0x4d7a3a);
    const rock = new THREE.Color(0x6b5a52);
    const snow = new THREE.Color(0xcfd8e6);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = this.heightAt(x, z);
      pos.setY(i, h);
      if (h < 1.5) c.copy(sand);
      else if (h < 55) c.copy(grass).lerp(sand, Math.max(0, 1 - h / 14) * 0.5);
      else if (h < 105) c.copy(rock).lerp(grass, Math.max(0, 1 - (h - 55) / 30) * 0.6);
      else c.copy(snow).lerp(rock, Math.max(0, 1 - (h - 105) / 25) * 0.7);
      const shade = 0.9 + this.noise(x * 0.02, z * 0.02) * 0.2;
      colors[i * 3] = c.r * shade;
      colors[i * 3 + 1] = c.g * shade;
      colors[i * 3 + 2] = c.b * shade;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(geo, mat);
    this.scene.add(mesh);
  }

  buildRunways() {
    const asphalt = new THREE.MeshLambertMaterial({ color: 0x3a3f4a });
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    const lightMat = new THREE.MeshBasicMaterial({ color: 0x7dff9a });
    const redMat = new THREE.MeshBasicMaterial({ color: 0xff5d5d });
    for (const key of Object.keys(STRIPS)) {
      const s = STRIPS[key];
      const group = new THREE.Group();
      const y = this.heightAt(s.x, s.z) + 0.35;
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(s.width, s.length), asphalt);
      strip.rotation.x = -Math.PI / 2;
      group.add(strip);
      // Centre dashes.
      for (let d = -s.length / 2 + 18; d < s.length / 2 - 10; d += 26) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 12), lineMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(0, 0.06, d);
        group.add(dash);
      }
      // Edge lights: green on the approach end, red on the far end.
      for (let d = -s.length / 2; d <= s.length / 2; d += 22) {
        for (const side of [-1, 1]) {
          const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6),
            d < -s.length / 2 + 5 ? lightMat : redMat);
          bulb.position.set(side * (s.width / 2 + 1.5), 0.8, d);
          group.add(bulb);
        }
      }
      group.position.set(s.x, y, s.z);
      group.rotation.y = (s.heading * Math.PI) / 180;
      this.scene.add(group);
      this.stripMeshes[key] = group;
    }
  }

  buildTrees() {
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
    const pineMat = new THREE.MeshLambertMaterial({ color: 0x2c5e33 });
    const palmMat = new THREE.MeshLambertMaterial({ color: 0x3f8f3a });
    const trunkGeo = new THREE.CylinderGeometry(0.7, 1.1, 7, 6);
    const pineGeo = new THREE.ConeGeometry(5.5, 16, 7);
    const palmGeo = new THREE.ConeGeometry(6.5, 7, 7);
    const dummy = new THREE.Object3D();
    const positions = [];
    for (let i = 0; i < 260; i += 1) {
      const angle = this.rand() * Math.PI * 2;
      const radius = 1300 * Math.sqrt(this.rand());
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const h = this.heightAt(x, z);
      if (h < 4 || h > 90) continue;
      // Keep the strips and their approach corridors clear of trees.
      let clear = true;
      for (const key of Object.keys(STRIPS)) {
        const s = STRIPS[key];
        const rad = (s.heading * Math.PI) / 180;
        const along = (x - s.x) * Math.sin(rad) + (z - s.z) * Math.cos(rad);
        const across = (x - s.x) * Math.cos(rad) - (z - s.z) * Math.sin(rad);
        if (Math.abs(along) < s.length / 2 + 320 && Math.abs(across) < s.width / 2 + 60) { clear = false; break; }
      }
      if (!clear) continue;
      positions.push({ x, z, h });
    }
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, positions.length);
    const crowns = new THREE.InstancedMesh(pineGeo, pineMat, positions.length);
    const palms = new THREE.InstancedMesh(palmGeo, palmMat, Math.floor(positions.length / 3));
    let palmCount = 0;
    positions.forEach((p, i) => {
      dummy.position.set(p.x, p.h + 3.5, p.z);
      dummy.scale.setScalar(0.8 + this.rand() * 0.7);
      dummy.rotation.y = this.rand() * Math.PI * 2;
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.y = p.h + 13;
      dummy.updateMatrix();
      if (p.h < 22 && palmCount < Math.floor(positions.length / 3)) {
        dummy.position.y = p.h + 9;
        dummy.updateMatrix();
        palms.setMatrixAt(palmCount, dummy.matrix);
        palmCount += 1;
      } else {
        crowns.setMatrixAt(i, dummy.matrix);
      }
    });
    trunks.count = positions.length;
    crowns.count = positions.length;
    palms.count = palmCount;
    this.scene.add(trunks);
    this.scene.add(crowns);
    this.scene.add(palms);
  }

  buildLighthouse() {
    const s = STRIPS.light;
    const base = new THREE.Group();
    const towerMat = new THREE.MeshLambertMaterial({ color: 0xf2ead8 });
    const bandMat = new THREE.MeshLambertMaterial({ color: 0xc23b2e });
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.4, 26, 10), towerMat);
    tower.position.y = 13;
    base.add(tower);
    for (const y of [8, 18]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 3.9, 3.4, 10), bandMat);
      band.position.y = y;
      base.add(band);
    }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(2.6, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
    lamp.position.y = 28;
    base.add(lamp);
    // The sweeping beam: a long translucent cone that rotates.
    const beamGeo = new THREE.ConeGeometry(16, 190, 12, 1, true);
    beamGeo.translate(0, -95, 0);
    beamGeo.rotateX(Math.PI / 2);
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
      color: 0xfff2b0, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    }));
    beam.position.y = 28;
    base.add(beam);
    this.beam = beam;
    const x = s.x + 60;
    const z = s.z - 40;
    base.position.set(x, this.heightAt(x, z), z);
    this.scene.add(base);
  }

  buildHouses() {
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xe8dcc0 });
    const roofMat = new THREE.MeshLambertMaterial({ color: 0xa8442f });
    const winMat = new THREE.MeshBasicMaterial({ color: 0xffd97a });
    const spots = [
      { x: 40, z: 120 }, { x: -70, z: 130 }, { x: 90, z: -60 },
      { x: -940, z: -640 }, { x: -860, z: -760 }, { x: 740, z: -840 },
    ];
    for (const spot of spots) {
      const h = this.heightAt(spot.x, spot.z);
      if (h < 3) continue;
      const house = new THREE.Group();
      const walls = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 10), wallMat);
      walls.position.y = 3.5;
      house.add(walls);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(9.5, 5, 4), roofMat);
      roof.position.y = 9.5;
      roof.rotation.y = Math.PI / 4;
      house.add(roof);
      const win = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), winMat);
      win.position.set(0, 3.5, 5.05);
      house.add(win);
      house.position.set(spot.x, h, spot.z);
      house.rotation.y = this.rand() * Math.PI * 2;
      this.scene.add(house);
    }
  }

  update(dt, elapsed) {
    if (this.beam) this.beam.rotation.y = elapsed * 0.5;
  }
}
