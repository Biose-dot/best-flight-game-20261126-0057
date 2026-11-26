// The dusk sky: a gradient dome, a low amber sun, early stars, drifting cloud
// puffs and the aurora — green ribbons that slowly breathe across the north.
import { mulberry32 } from './random.js';

const THREE = window.THREE;

export class Sky {
  constructor(scene, seed) {
    this.scene = scene;
    this.rand = mulberry32(seed ^ 0x5eed);
    this.auroraUniforms = [];
    this.clouds = [];
    this.buildDome();
    this.buildSun();
    this.buildStars();
    this.buildAurora();
    this.buildClouds();
  }

  buildDome() {
    const geo = new THREE.SphereGeometry(4800, 32, 18);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x0b1030) },
        mid: { value: new THREE.Color(0x3b4a7d) },
        low: { value: new THREE.Color(0xe8734a) },
      },
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 mid; uniform vec3 low;
        varying vec3 vPos;
        void main() {
          float h = normalize(vPos).y;
          vec3 col = h > 0.25 ? mix(mid, top, smoothstep(0.25, 0.85, h))
                              : mix(low, mid, smoothstep(-0.08, 0.25, h));
          // Warm glow hugging the western horizon where the sun sits.
          float sunGlow = pow(max(0.0, 1.0 - abs(normalize(vPos).x + 0.82) * 2.2
            - abs(normalize(vPos).z - 0.25) * 1.4), 2.0) * smoothstep(-0.05, 0.3, h);
          col += vec3(1.0, 0.45, 0.15) * sunGlow * 0.55;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.dome = new THREE.Mesh(geo, mat);
    this.scene.add(this.dome);
  }

  buildSun() {
    // A soft amber disc low in the west, plus a halo sprite.
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255, 236, 180, 1)');
    grad.addColorStop(0.25, 'rgba(255, 178, 92, 0.95)');
    grad.addColorStop(0.6, 'rgba(255, 120, 50, 0.35)');
    grad.addColorStop(1, 'rgba(255, 120, 50, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false, fog: false,
    }));
    sprite.position.set(-3900, 420, 900);
    sprite.scale.set(1500, 1500, 1);
    this.scene.add(sprite);
    this.sunSprite = sprite;
  }

  buildStars() {
    const count = 420;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const theta = this.rand() * Math.PI * 2;
      const y = 0.18 + this.rand() * 0.8;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      positions[i * 3] = Math.cos(theta) * r * 4600;
      positions[i * 3 + 1] = y * 4600;
      positions[i * 3 + 2] = Math.sin(theta) * r * 4600;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xdfeaff, size: 3.2, sizeAttenuation: false, transparent: true,
      opacity: 0.75, fog: false, depthWrite: false,
    });
    this.stars = new THREE.Points(geo, mat);
    this.scene.add(this.stars);
  }

  buildAurora() {
    // Three wide ribbons across the northern sky, waving slowly in the vertex shader.
    const palette = [0x39ff88, 0x2ee6c8, 0x7dff5e];
    for (let band = 0; band < 3; band += 1) {
      const uniforms = {
        time: { value: band * 13.7 },
        color: { value: new THREE.Color(palette[band]) },
      };
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: false,
        uniforms,
        vertexShader: `
          uniform float time;
          varying vec2 vUv;
          void main() {
            vUv = uv;
            vec3 p = position;
            p.y += sin(uv.x * 6.0 + time * 0.35) * 60.0;
            p.z += cos(uv.x * 4.0 + time * 0.22) * 40.0;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: `
          uniform float time; uniform vec3 color;
          varying vec2 vUv;
          void main() {
            float curtain = sin(vUv.x * 21.0 + time * 0.4) * 0.5 + 0.5;
            float vertical = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.45, vUv.y);
            float a = curtain * vertical * 0.16;
            gl_FragColor = vec4(color, a);
          }`,
      });
      const geo = new THREE.PlaneGeometry(5200, 700, 64, 1);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(-300 + band * 260, 1150 + band * 260, -2900 - band * 320);
      mesh.rotation.x = -0.12;
      mesh.rotation.y = 0.12 + band * 0.05;
      this.scene.add(mesh);
      this.auroraUniforms.push(uniforms);
    }
  }

  buildClouds() {
    const puffGeo = new THREE.SphereGeometry(1, 10, 8);
    const puffMat = new THREE.MeshLambertMaterial({
      color: 0xffd9c2, transparent: true, opacity: 0.82, emissive: 0x69402e,
    });
    const darkMat = new THREE.MeshLambertMaterial({
      color: 0x8d7fae, transparent: true, opacity: 0.8, emissive: 0x2a2340,
    });
    for (let i = 0; i < 26; i += 1) {
      const group = new THREE.Group();
      const puffs = 3 + Math.floor(this.rand() * 4);
      for (let p = 0; p < puffs; p += 1) {
        const puff = new THREE.Mesh(puffGeo, this.rand() < 0.25 ? darkMat : puffMat);
        const s = 34 + this.rand() * 60;
        puff.scale.set(s, s * 0.42, s * 0.8);
        puff.position.set((this.rand() - 0.5) * 150, (this.rand() - 0.5) * 22, (this.rand() - 0.5) * 70);
        group.add(puff);
      }
      const angle = this.rand() * Math.PI * 2;
      const radius = 500 + this.rand() * 1900;
      group.position.set(Math.cos(angle) * radius, 300 + this.rand() * 260, Math.sin(angle) * radius);
      group.userData.drift = 1.5 + this.rand() * 2.5;
      this.scene.add(group);
      this.clouds.push(group);
    }
  }

  update(dt, elapsed) {
    for (const u of this.auroraUniforms) u.time.value = elapsed;
    for (const cloud of this.clouds) {
      cloud.position.x += cloud.userData.drift * dt;
      if (cloud.position.x > 2600) cloud.position.x = -2600;
    }
    this.dome.position.copy(this.scene.userData.cameraPosition || new THREE.Vector3());
  }
}
