// The Three.js stage: renderer, dusk lighting and fog, the chase camera, and the
// per-frame render. The camera chases the Kestrel from behind, widens its field
// of view with speed, and leans into the bank a little, like a camera plane.
import { buildPlaneMesh } from './plane.js';

const THREE = window.THREE;

export class Renderer {
  constructor(canvas, world) {
    this.world = world;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x2c3552, 900, 4600);

    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 12000);
    this.camera.position.set(0, 30, 80);

    // Low amber sun from the west, cool violet sky fill.
    const sun = new THREE.DirectionalLight(0xffb36b, 1.25);
    sun.position.set(-900, 260, 320);
    this.scene.add(sun);
    const hemi = new THREE.HemisphereLight(0x8a7fd0, 0x1c2a44, 0.6);
    this.scene.add(hemi);
    const bounce = new THREE.AmbientLight(0x33415e, 0.5);
    this.scene.add(bounce);

    this.planeMesh = buildPlaneMesh();
    this.scene.add(this.planeMesh);

    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  render() {
    const world = this.world;
    const p = world.plane;
    const groundH = world.terrain.heightAt(p.pos.x, p.pos.z);
    p.applyToMesh(this.planeMesh, groundH);

    if (world.screen === 'title' || world.screen === 'end') {
      // Slow cinematic orbit around the parked Kestrel, framed so the plane
      // sits to the right of the centred card instead of behind it.
      const t = world.time * 0.10;
      const r = 30;
      const cx = p.pos.x + Math.sin(t) * r;
      const cz = p.pos.z + Math.cos(t) * r;
      world.camPos.set(cx, p.pos.y + 9 + Math.sin(t * 0.6) * 2, cz);
      const vx = p.pos.x - cx;
      const vz = p.pos.z - cz;
      const len = Math.hypot(vx, vz) || 1;
      const sideX = -vz / len;
      const sideZ = vx / len;
      world.camLook.set(p.pos.x - sideX * 18, p.pos.y + 1.5, p.pos.z - sideZ * 18);
    }

    const targetFov = 62 + Math.min(16, p.speed * 0.18);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * 0.08;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.copy(world.camPos);
    // Lean the camera into the bank so a turn feels like a turn.
    this.camera.up.set(Math.sin(p.roll * 0.35), Math.cos(p.roll * 0.35), 0);
    this.camera.lookAt(world.camLook);
    this.scene.userData.cameraPosition = this.camera.position;
    this.renderer.render(this.scene, this.camera);
  }
}
