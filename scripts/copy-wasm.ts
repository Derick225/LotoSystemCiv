import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const source = path.join(rootDir, 'crates', 'loto-engine', 'pkg', 'loto_engine_bg.wasm');
const dest = path.join(rootDir, 'public', 'loto_engine_bg.wasm');

try {
  if (fs.existsSync(source)) {
    fs.copyFileSync(source, dest);
    const stats = fs.statSync(dest);
    console.log(`[WASM COPY] Copié avec succès: ${source} -> ${dest} (${stats.size} octets)`);
  } else {
    console.warn(`[WASM COPY] Avertissement: source introuvable à ${source}`);
  }
} catch (err) {
  console.error('[WASM COPY] Erreur lors de la copie du binaire WASM:', err);
  process.exit(1);
}
