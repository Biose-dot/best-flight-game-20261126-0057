"""Delivery proof: start from the game's own ?shot=land staging (Kestrel on
final for Pine Island, gear down, flaps full, rings stamped) and fly the last
seconds to touchdown with REAL keyboard events, using the same glide math as
the shot's autopilot. Stops on delivery, crash, or timeout."""
import json
import math
import sys
import time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8080/?shot=land&seed=7"
MAX_WALL = float(sys.argv[1]) if len(sys.argv) > 1 else 120

HELD = set()
pwm = {}


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


# Pine Island strip: centre, heading (north), height, length.
SX, SZ, SH, SRAD = -900, -700, 9, 0.0
SLEN = 230

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
    page.wait_for_function("window.__shotReady === true", timeout=30000)
    page.wait_for_timeout(500)
    t0 = time.time()
    result = "timeout"
    while time.time() - t0 < MAX_WALL:
        st = page.evaluate("""() => {
            const w = window.__world; if (!w) return null;
            return {screen: w.screen, score: w.score, leg: w.legIndex,
                    deliv: w.deliveries, fuel: w.fuel,
                    x: w.plane.pos.x, y: w.plane.pos.y, z: w.plane.pos.z,
                    hdg: w.plane.heading, speed: w.plane.speed,
                    thr: w.plane.throttle, air: w.plane.airborne,
                    over: w.overTitle};
        }""")
        if not st:
            time.sleep(0.5)
            continue
        if st["screen"] in ("over", "end"):
            result = f"{st['screen']} score={st['score']} deliv={st['deliv']} ({st['over']})"
            break
        if st["deliv"] >= 1:
            result = (f"DELIVERY! score={st['score']} leg={st['leg']} "
                      f"fuel={st['fuel']:.0f} pos=({st['x']:.0f},{st['y']:.0f},{st['z']:.0f})")
            break
        # landFor math, mapped to keys: track the centreline (aim 120 m ahead
        # on it, so a lateral offset becomes a heading correction) and ride
        # the glide slope down.
        along = (st["x"] - SX) * math.sin(SRAD) + (st["z"] - SZ) * math.cos(SRAD)
        across = (st["x"] - SX) * math.cos(SRAD) - (st["z"] - SZ) * math.sin(SRAD)
        desired_heading = SRAD + math.atan2(-across, 60)
        dist_thr = along - SLEN / 2
        desired_alt = SH + 1.5 + max(0, dist_thr) * 0.10
        heading_err = wrap(desired_heading - st["hdg"])
        pitch_cmd = max(-1, min(1, (desired_alt - st["y"]) * 0.03))
        roll_cmd = max(-1, min(1, -heading_err * 2.2))
        want = set()
        if st["thr"] < 0.38:
            want.add("w")
        elif st["thr"] > 0.44:
            want.add("s")
        # Keys are full deflection, so pulse them: accumulate the continuous
        # command and fire the key for one tick per whole unit (PWM). A fixed
        # threshold either never fires or over-controls and plunges her in.
        for key, cmd in (("ArrowUp", pitch_cmd), ("ArrowDown", -pitch_cmd),
                         ("ArrowLeft", roll_cmd), ("ArrowRight", -roll_cmd)):
            if cmd > 0.03:
                pwm[key] = pwm.get(key, 0.0) + cmd
                if pwm[key] >= 1.0:
                    want.add(key)
                    pwm[key] -= 1.0
        set_keys(page, want)
        now = time.time() - t0
        if now - getattr(set_keys, "_lastlog", 0) > 2:
            set_keys._lastlog = now
            print(f"[{now:5.0f}s] pos=({st['x']:.0f},{st['y']:.0f},{st['z']:.0f}) "
                  f"spd={st['speed']:.0f} thr={st['thr']:.2f} desAlt={desired_alt:.0f} "
                  f"pitch={pitch_cmd:.2f} roll={roll_cmd:.2f} keys={sorted(want)}", flush=True)
        page.wait_for_timeout(150)
    set_keys(page, set())
    print("RESULT:", result)
    print("ERRORS:", errors[:10] if errors else "none")
    browser.close()
