// The mail route: glowing rings hung in the sky between islands. Fly through the
// lit ring to stamp the next leg of the route; the ring ahead always pulses
// green-gold, the rest wait dim blue. A ring counts when the plane passes within
// its radius.
import { LEGS } from './config.js';

const THREE = window.THREE;

export class MailRings {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.legIndex = 0;
    this.ringIndex = 0;
    this.meshes = [];
    this.loadLeg(0);
  }

  loadLeg(legIndex) {
    this.legIndex = legIndex;
    this.ringIndex = 0;
    while (this.group.children.length) {
      const child = this.group.children.pop();
      this.group.remove(child);
    }
    this.meshes = [];
    const leg = LEGS[legIndex];
    leg.rings.forEach((ring, i) => {
      const mesh = this.makeRing(ring, i + 1);
      mesh.position.set(ring.x, ring.y, ring.z);
      this.group.add(mesh);
      this.meshes.push(mesh);
    });
    this.updateGlow();
  }

  makeRing(ring, number) {
    const group = new THREE.Group();
    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(16, 1.1, 12, 40),
      new THREE.MeshBasicMaterial({ color: 0x2b6cff, transparent: true, opacity: 0.85 }),
    );
    group.add(torus);
    const inner = new THREE.Mesh(
      new THREE.CircleGeometry(15.2, 32),
      new THREE.MeshBasicMaterial({
        color: 0x2b6cff, transparent: true, opacity: 0.08,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    group.add(inner);
    // Number board floating above the ring.
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(8,14,32,0.85)';
    ctx.beginPath();
    ctx.arc(64, 64, 56, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffd97a';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.fillStyle = '#ffd97a';
    ctx.font = 'bold 64px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(number), 64, 68);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 14),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, side: THREE.DoubleSide }),
    );
    board.position.y = 24;
    group.add(board);
    group.userData.torus = torus;
    group.userData.inner = inner;
    group.userData.board = board;
    group.userData.baseY = ring.y;
    return group;
  }

  currentRing() {
    return LEGS[this.legIndex].rings[this.ringIndex] || null;
  }

  ringsLeft() {
    return LEGS[this.legIndex].rings.length - this.ringIndex;
  }

  // Returns true when the plane just flew through the active ring.
  checkPass(pos) {
    const ring = this.currentRing();
    if (!ring) return false;
    const dx = pos.x - ring.x;
    const dy = pos.y - ring.y;
    const dz = pos.z - ring.z;
    if (dx * dx + dy * dy + dz * dz < 15 * 15) {
      this.ringIndex += 1;
      this.updateGlow();
      return true;
    }
    return false;
  }

  updateGlow() {
    this.meshes.forEach((mesh, i) => {
      const active = i === this.ringIndex;
      const done = i < this.ringIndex;
      const color = active ? 0x39ff88 : done ? 0x3affd8 : 0x2b6cff;
      mesh.userData.torus.material.color.setHex(color);
      mesh.userData.inner.material.color.setHex(color);
      mesh.userData.torus.material.opacity = active ? 1 : done ? 0.25 : 0.7;
      mesh.userData.inner.material.opacity = active ? 0.16 : done ? 0.03 : 0.07;
      mesh.userData.board.visible = active;
    });
  }

  update(dt, elapsed) {
    this.meshes.forEach((mesh, i) => {
      const active = i === this.ringIndex;
      const pulse = active ? 1 + Math.sin(elapsed * 3.2) * 0.06 : 1;
      mesh.scale.setScalar(pulse);
      mesh.position.y = mesh.userData.baseY + Math.sin(elapsed * 0.8 + i * 1.7) * 1.6;
      // Face the camera-ish: rings stand vertical, slowly turning to stay readable.
      mesh.rotation.y = Math.sin(elapsed * 0.12 + i) * 0.35;
    });
  }
}
