"""Closed-loop playtest: actually plays SKYPOST with real keyboard events.
Takes off, steers at the next ring/strip with the same keys a human uses,
and reports whether a delivery (or a crash) happens. No shot params."""
import json
import math
import sys
import time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8080/"
MAX_WALL = float(sys.argv[1]) if len(sys.argv) > 1 else 300

HELD = set()


def set_keys(page, want):
    global HELD
    for k in list(HELD):
        if k not in want:
            page.keyboard.up(k)
            HELD.discard(k)
    for k in want:
        if k not in HELD:
            page.keyboard.down(k)
            HELD.add(k)


def wrap(a):
    while a > math.pi:
        a -= 2 * math.pi
    while a < -math.pi:
        a += 2 * math.pi
    return a


with sync_playwright() as p:
    browser = p.chromium.launch(args=[
        "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
        "--disable-gpu-sandbox", "--no-sandbox",
    ])
    page = browser.new_page(viewport={"width": 800, "height": 500})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(BASE, wait_until="load")
    page.wait_for_timeout(1500)
    page.click("#btn-fly")
    page.wait_for_timeout(500)
    t0 = time.time()
    last_log = 0
    result = "timeout"
    while time.time() - t0 < MAX_WALL:
        st = page.evaluate("""() => {
            const w = window.__world; if (!w) return null;
            const v = w.viewState();
            return {screen: w.screen, score: w.score, leg: w.legIndex,
                    deliv: w.deliveries, fuel: w.fuel,
                    x: w.plane.pos.x, y: w.plane.pos.y, z: w.plane.pos.z,
                    hdg: w.plane.heading, speed: w.plane.speed,
                    thr: w.plane.throttle, air: w.plane.airborne,
                    wp: v.waypoint, over: w.overTitle};
        }""")
        if not st:
            time.sleep(0.5)
            continue
        if st["screen"] in ("over", "end"):
            result = f"{st['screen']} score={st['score']} deliv={st['deliv']} ({st['over']})"
            break
        if st["deliv"] >= 1:
            result = f"DELIVERY! score={st['score']} leg={st['leg']} fuel={st['fuel']:.0f}"
            break
        # --- pilot ---
        wp = st["wp"]
        want = set()
        # waypoint from viewState has no y; rings carry y in world state
        ring = page.evaluate("() => { const w = window.__world; const r = w.rings.currentRing(); return r ? {x: r.x, y: r.y, z: r.z} : null; }")
        if ring:
            tx, ty, tz = ring["x"], ring["y"], ring["z"]
            label = "ring"
        else:
            # Landing: fly to a point 300 m out on the strip's extended
            # centreline first, then ride the centreline down to the threshold.
            # (Leg 1 target: Pine Island strip, heading north.)
            sx, sz, sh, srad = -900, -700, 9, 0.0
            fx, fz = math.sin(srad), -math.cos(srad)
            apx, apz = sx - fx * 300, sz - fz * 300
            dist_ap = math.hypot(apx - st["x"], apz - st["z"])
            if dist_ap > 80:
                tx, tz, ty = apx, apz, sh + 45
                label = "approach"
            else:
                tx, tz = sx, sz
                dist_strip = math.hypot(sx - st["x"], sz - st["z"])
                ty = sh + 10 + max(0, dist_strip) * 0.08
                label = "strip"
            # Full flaps once on final.
            dist = math.hypot(sx - st["x"], sz - st["z"])
            if dist < 300 and not getattr(set_keys, "_flaps", False):
                set_keys._flaps = True
                page.keyboard.press("f")
                page.keyboard.press("f")
        dx, dz = tx - st["x"], tz - st["z"]
        dist = math.hypot(dx, dz)
        # Slow down near the target: tight turns need low speed.
        target_thr = 0.45 if dist < 130 else 0.6 if dist < 350 else 0.85
        if st["thr"] < target_thr - 0.03:
            want.add("w")
        elif st["thr"] > target_thr + 0.03:
            want.add("s")
        desired_hdg = math.atan2(dx, -dz)
        err = wrap(desired_hdg - st["hdg"])
        if st["air"]:
            # err > 0: desired heading is above current, so heading must
            # INCREASE; heading rate is -roll, so that needs roll < 0 (right).
            if err > 0.12:
                want.add("ArrowRight")
            elif err < -0.12:
                want.add("ArrowLeft")
            if st["y"] < ty - 6:
                want.add("ArrowUp")
            elif st["y"] > ty + 6:
                want.add("ArrowDown")
        else:
            # on the ground: full throttle, pull up once fast
            want.add("w")
            if st["speed"] > 32:
                want.add("ArrowUp")
        set_keys(page, want)
        now = time.time() - t0
        if now - last_log > 10:
            last_log = now
            print(f"[{now:5.0f}s] {st['screen']} leg{st['leg']} {label} "
                  f"pos=({st['x']:.0f},{st['y']:.0f},{st['z']:.0f}) "
                  f"spd={st['speed']:.0f} thr={st['thr']:.2f} air={st['air']} "
                  f"score={st['score']} deliv={st['deliv']} fuel={st['fuel']:.0f}", flush=True)
        page.wait_for_timeout(200)
    set_keys(page, set())
    print("RESULT:", result)
    print("ERRORS:", errors[:10] if errors else "none")
    browser.close()
