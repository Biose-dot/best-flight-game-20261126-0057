// SKYPOST — Aurora Mail Run: the hand-in program (Node 22, standard library only).
//
// It gathers the entry — the playable game under game/ and the screenshots under
// screenshots/ — into the output directory and writes dossier.json, the summary
// the judge reads, using the kit's vendored dossier library.
//
// The grader runs this with /output as the destination; outside the grader,
// MAKEFUN_OUTPUT_DIR stands in for it:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The entry is deterministic: the same repository always hands in the same bytes,
// so the two grading runs agree.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameDir = join(repoRoot, 'game');
const shotsDir = join(repoRoot, 'screenshots');

if (!existsSync(gameDir)) {
  throw new Error(`game/ is missing from the repository root: ${gameDir}`);
}
if (!existsSync(join(gameDir, 'index.html'))) {
  throw new Error('game/index.html is missing: the game cannot open without it.');
}

// Start from a clean slate so a stale file from an earlier run can never leak in.
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// The game, exactly as it ships: static files, no build step, no network.
cpSync(gameDir, join(outDir, 'game'), { recursive: true });

// The screenshots, in name order; the first is the cover the judge sees largest.
// The competition wants 3 or 4: refuse to hand in a set that would fail the gate.
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });
}
const shotCount = readdirSync(join(outDir, 'screenshots'))
  .filter((name) => !name.startsWith('.')).length;
if (shotCount < 3 || shotCount > 4) {
  throw new Error(`screenshots/ holds ${shotCount} images; the competition wants 3 or 4.`);
}

// The dossier: game block, sources in load order, and the screenshots, capped
// to the scorer's own limits (see the competition's gate.json).
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
const gameFiles = readdirSync(join(outDir, 'game'), { recursive: true }).length;
console.log(`SKYPOST handed in: game/ (${gameFiles} entries) + ${shotCount} screenshots + dossier.json -> ${outDir}`);
