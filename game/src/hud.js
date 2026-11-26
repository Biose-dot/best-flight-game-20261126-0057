// The cockpit instruments, drawn in the DOM: score and leg, fuel and throttle
// bars, an attitude indicator, altitude / climb / heading, airspeed, a compass
// tape, a top-down minimap, the waypoint arrow and the warning lamp.
import { LEGS, STRIPS } from './config.js';

const MS_TO_KT = 1.94384;
const M_TO_FT = 3.28084;

function fmtTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function headingDeg(headingRad) {
  let deg = (-headingRad * 180) / Math.PI;
  deg = ((deg % 360) + 360) % 360;
  return deg;
}

export class Hud {
  constructor() {
    this.el = {};
    for (const id of ['score', 'leg-label', 'timer', 'fuel-fill', 'thr-fill', 'gear-label',
      'alt', 'vsi', 'hdg', 'speed', 'compass-tape', 'compass-hdg', 'wp-arrow', 'wp-text',
      'wp-dist', 'warn', 'toast', 'hud-left', 'hud-right', 'hud-bottom-left',
      'hud-bottom-right', 'compass', 'waypoint']) {
      this.el[id] = document.getElementById(id);
    }
    this.attitude = document.getElementById('attitude');
    this.attCtx = this.attitude.getContext('2d');
    this.minimap = document.getElementById('minimap');
    this.mapCtx = this.minimap.getContext('2d');
    this.toastTimer = 0;
  }

  showGame(show) {
    const ids = ['hud-left', 'hud-right', 'hud-bottom-left', 'hud-bottom-right', 'compass', 'waypoint'];
    for (const id of ids) this.el[id].classList.toggle('hidden', !show);
  }

  toast(text, seconds) {
    this.el.toast.textContent = text;
    this.el.toast.style.display = 'block';
    this.toastTimer = seconds || 2.5;
  }

  warn(text) {
    if (!text) {
      this.el.warn.style.display = 'none';
      return;
    }
    this.el.warn.textContent = text;
    this.el.warn.style.display = 'block';
  }

  update(dt, view) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.style.display = 'none';
    }
    const leg = LEGS[view.legIndex];
    this.el.score.textContent = view.score.toLocaleString('en-US');
    this.el['leg-label'].textContent = `Leg ${view.legIndex + 1}/3 — ${leg.name}`;
    this.el.timer.textContent = `${fmtTime(view.elapsed)}  ·  ✉ parcels ${view.deliveries}/3  ·  ◉ rings ${view.ringsCleared}/${leg.rings.length}`;
    this.el['fuel-fill'].style.width = `${Math.max(0, view.fuel)}%`;
    this.el['fuel-fill'].style.background = view.fuel < 25
      ? 'linear-gradient(90deg,#ef4444,#f97316)' : 'linear-gradient(90deg,#37d67a,#a5e635)';
    this.el['thr-fill'].style.width = `${Math.round(view.throttle * 100)}%`;
    const flapText = view.flaps === 0 ? 'FLAPS UP' : view.flaps === 1 ? 'FLAPS ½' : 'FLAPS FULL';
    this.el['gear-label'].textContent = `${view.gearDown ? 'GEAR DOWN' : 'GEAR UP'} · ${flapText}`;
    this.el['gear-label'].style.color = view.gearDown ? '#bfe3ff' : '#ffd97a';

    const altFt = Math.max(0, Math.round(view.altitude * M_TO_FT));
    this.el.alt.textContent = altFt.toLocaleString('en-US');
    this.el.vsi.textContent = Math.round(view.verticalSpeed * M_TO_FT * 60).toLocaleString('en-US');
    const hdg = Math.round(headingDeg(view.heading));
    this.el.hdg.textContent = String(hdg).padStart(3, '0');
    this.el.speed.textContent = String(Math.round(view.speed * MS_TO_KT));

    this.drawAttitude(view);
    this.drawCompass(hdg, view.windDir, view.windSpeedKt);
    this.drawMinimap(view);
    this.updateWaypoint(view);
  }

  drawAttitude(view) {
    const ctx = this.attCtx;
    const w = 92;
    const h = 92;
    const cx = w / 2;
    const cy = h / 2;
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();
    ctx.arc(cx, cy, 44, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(view.roll);
    const pitchPx = Math.max(-40, Math.min(40, view.pitch * 70));
    ctx.translate(0, pitchPx);
    ctx.fillStyle = '#3a6fd8';
    ctx.fillRect(-60, -60, 120, 60);
    ctx.fillStyle = '#7a5230';
    ctx.fillRect(-60, 0, 120, 60);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-60, 0);
    ctx.lineTo(60, 0);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = '#ffd97a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.lineTo(-5, 0);
    ctx.moveTo(5, 0);
    ctx.lineTo(16, 0);
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd97a';
    ctx.fill();
    ctx.restore();
  }

  drawCompass(hdg, windFrom, windKt) {
    const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    let tape = '';
    for (let off = -40; off <= 40; off += 10) {
      const d = ((hdg + off) % 360 + 360) % 360;
      const label = d % 45 === 0 ? points[Math.round(d / 45) % 8] : String(Math.round(d / 10) * 10).padStart(3, '0');
      tape += off === 0 ? ` <span class="cur">${label}</span> ` : ` ${label} `;
    }
    this.el['compass-tape'].innerHTML = tape;
    this.el['compass-hdg'].textContent =
      `HDG ${String(hdg).padStart(3, '0')}°  ·  WIND ${windKt} kt ${points[Math.round(windFrom / 45) % 8]}  ·  GUSTS`;
  }

  drawMinimap(view) {
    const ctx = this.mapCtx;
    const w = 150;
    const h = 150;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(10, 30, 60, 0.9)';
    ctx.fillRect(0, 0, w, h);
    const scale = w / 3000; // world spans roughly -1500..1500
    const toMap = (x, z) => [w / 2 + x * scale, h / 2 + z * scale];
    // Islands as blobs.
    ctx.fillStyle = '#4d7a3a';
    for (const [x, z, r] of [[0, 0, 430], [-900, -700, 390], [800, -900, 270], [620, 620, 150], [-1150, 420, 170]]) {
      const [mx, my] = toMap(x, z);
      ctx.beginPath();
      ctx.arc(mx, my, Math.max(3, r * scale), 0, Math.PI * 2);
      ctx.fill();
    }
    // Strips.
    ctx.strokeStyle = '#ffe9a8';
    ctx.lineWidth = 2;
    for (const key of Object.keys(STRIPS)) {
      const s = STRIPS[key];
      const [mx, my] = toMap(s.x, s.z);
      ctx.beginPath();
      ctx.arc(mx, my, 3.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Route: remaining rings then the target strip.
    ctx.fillStyle = '#39ff88';
    for (const ring of view.remainingRings || []) {
      const [mx, my] = toMap(ring.x, ring.z);
      ctx.beginPath();
      ctx.arc(mx, my, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // The plane: a little triangle pointing along its heading.
    const [px, py] = toMap(view.pos.x, view.pos.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-view.heading + Math.PI);
    ctx.fillStyle = '#ffd97a';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  updateWaypoint(view) {
    const target = view.waypoint;
    if (!target) {
      this.el['wp-text'].textContent = 'Land on the strip';
      this.el['wp-dist'].textContent = '';
      this.el['wp-arrow'].textContent = '▼';
      return;
    }
    const dx = target.x - view.pos.x;
    const dz = target.z - view.pos.z;
    const dist = Math.round(Math.sqrt(dx * dx + dz * dz));
    this.el['wp-dist'].textContent = `${dist.toLocaleString('en-US')} m`;
    this.el['wp-text'].textContent = target.label;
    // Arrow: rotate the glyph by the relative bearing to the target.
    const bearing = Math.atan2(dx, -dz);
    const relative = bearing - view.heading;
    const deg = Math.round((relative * 180) / Math.PI);
    this.el['wp-arrow'].style.transform = `rotate(${deg}deg)`;
    this.el['wp-arrow'].textContent = '⇧';
  }
}
