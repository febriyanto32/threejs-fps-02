// EMBERLINE — entrypoint for make.fun threejs-fps-02 (Node 22, stdlib only).
//
// This program hands the game in. It takes this repository's game/ folder
// (plain static files: the Harbor Yard FPS, three.js vendored under
// game/vendor/three) and screenshots/ (3-4 real renders of the game), copies
// both into the output directory, and writes /output/dossier.json with the
// kit's buildDossier library — the summary the judge reads.
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// The program runs twice and both runs must write the same bytes, so every
// step below is a plain deterministic copy; nothing here is random, and
// nothing reaches the network.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const gameDir = join(repoRoot, 'game');
const shotsDir = join(repoRoot, 'screenshots');

mkdirSync(outDir, { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });

// The whole game, exactly as it ships in the repository.
cpSync(gameDir, join(outDir, 'game'), { recursive: true });

// The screenshots, if the repository holds any.
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });
}

// The dossier, built with the kit's own library under the gate's caps:
// text at most 160 KiB, at most 4 screenshots of at most 256 KiB each,
// game/ at most 993 files and 48 MiB in all.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);

// The gate refuses a dossier over 1.5 MiB: fail loudly here instead of
// handing in an entry the scorer would refuse.
if (dossier.byteLength > 1572864) {
  throw new Error(`dossier.json is ${dossier.byteLength} bytes, over the 1.5 MiB cap`);
}
console.log(`EMBERLINE: wrote ${join(outDir, 'dossier.json')} (${dossier.byteLength} bytes)`);
