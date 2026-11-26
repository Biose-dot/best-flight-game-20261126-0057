"""Play-test SKYPOST in headless Chromium: load each ?shot= scene, collect
console/page errors, wait for __shotReady, screenshot to the given out dir."""
import json
import sys
import time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8080"
SHOTS = json.load(open("/home/hatch/workspace/makefun/best-flight-game-20261126-0057/shots.json"))
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/skypost-shots"
ONLY = sys.argv[2] if len(sys.argv) > 2 else ""

import os
os.makedirs(OUT, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(args=[
        "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
        "--disable-gpu-sandbox", "--no-sandbox",
    ])
    for shot in SHOTS:
        if ONLY and ONLY not in shot["name"]:
            continue
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        errors = []
        page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        page.on("requestfailed", lambda r: errors.append(f"reqfail: {r.url} {r.failure}"))
        url = BASE + "/" + shot["query"]
        page.goto(url, wait_until="load")
        try:
            page.wait_for_function("window.__shotReady === true", timeout=30000)
        except Exception as e:
            errors.append(f"TIMEOUT waiting __shotReady: {e}")
        # Let a few more frames settle (aurora/cloud drift, HUD).
        page.wait_for_timeout(1200)
        state = page.evaluate("""() => {
            const w = window.__world;
            if (!w) return {noWorld: true};
            return {screen: w.screen, score: w.score, leg: w.legIndex,
                    pos: [w.plane.pos.x.toFixed(0), w.plane.pos.y.toFixed(0), w.plane.pos.z.toFixed(0)],
                    speed: w.plane.speed.toFixed(1), alt: w.viewState().altitude.toFixed(0),
                    fuel: w.fuel.toFixed(0), ringsLeft: w.rings.ringsLeft()};
        }""")
        print(f"== {shot['name']} {shot['query']} -> {json.dumps(state)}")
        for e in errors:
            print(f"   ERR {e}")
        page.screenshot(path=f"{OUT}/{shot['name']}", type="jpeg", quality=88)
        page.close()
    browser.close()
print("done")
