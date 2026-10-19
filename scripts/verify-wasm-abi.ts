import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

interface AbiReport {
  rustSourceExports: string[];
  compiledDtsExports: string[];
  bridgeInvokedSymbols: string[];
  missingInCompiled: string[];
  missingInRustSource: string[];
}

function verifyAbi(): void {
  console.log('=== VÉRIFICATION DE LA COHÉRENCE ABI RUST / WASM / TS ===\n');

  const libRsPath = path.join(rootDir, 'crates', 'loto-engine', 'src', 'lib.rs');
  const dtsPath = path.join(rootDir, 'crates', 'loto-engine', 'pkg', 'loto_engine.d.ts');
  const bridgePath = path.join(rootDir, 'services', 'wasm', 'lotoEngineBridge.ts');

  // 1. Lire la liste canonique des exports déclarés dans lib.rs
  const libRsContent = fs.readFileSync(libRsPath, 'utf8');
  const exportsMatch = libRsContent.match(/const EXPORTS: &\[&str\] = &\[([\s\S]*?)\];/);
  let rustSourceExports: string[] = [];
  if (exportsMatch) {
    rustSourceExports = exportsMatch[1]
      .split('\n')
      .map(s => s.trim().replace(/[",]/g, ''))
      .filter(s => s.length > 0 && !s.startsWith('//'));
  }

  // 2. Extraire les déclarations exportées dans loto_engine.d.ts
  let compiledDtsExports: string[] = [];
  if (fs.existsSync(dtsPath)) {
    const dtsContent = fs.readFileSync(dtsPath, 'utf8');
    const classMatches = Array.from(dtsContent.matchAll(/export class (\w+)/g)).map(m => m[1]);
    const funcMatches = Array.from(dtsContent.matchAll(/export function (\w+)/g)).map(m => m[1]);
    compiledDtsExports = Array.from(new Set([...classMatches, ...funcMatches])).sort();
  }

  // 3. Extraire les symboles WASM appelés dans le bridge
  const bridgeContent = fs.readFileSync(bridgePath, 'utf8');
  const wasmCallMatches = Array.from(bridgeContent.matchAll(/wasmModuleInstance\??\.(\w+)/g)).map(m => m[1]);
  const storeCallMatches = Array.from(bridgeContent.matchAll(/store\??\.(\w+)/g)).map(m => m[1]);
  const bridgeInvokedSymbols = Array.from(new Set([...wasmCallMatches, ...storeCallMatches])).sort();

  // Comparaisons
  const missingInCompiled = rustSourceExports.filter(sym => !compiledDtsExports.includes(sym));
  const missingInRustSource = bridgeInvokedSymbols.filter(sym => {
    // Filtrer les méthodes d'instance de store et les utilitaires standards
    const isExportOrMethod = rustSourceExports.includes(sym) ||
      ['append_single_draw', 'get_frequencies', 'get_current_gaps', 'get_draw_count', 'clear_draw', 'bootstrap_json', 'generate_portfolio', 'analyze_draw', 'get_network_id', 'compute_interdraw_coupling', 'compute_network_domino_wasm', 'compute_walk_forward_calibration', 'clear_and_reload', 'rebuild_all_seen_indexes'].includes(sym);
    return !isExportOrMethod;
  });

  console.log(`- Exports déclarés dans le code source Rust : ${rustSourceExports.length}`);
  console.log(`- Exports présents dans le binaire compilé actuel (.d.ts) : ${compiledDtsExports.length}`);
  console.log(`- Fonctions/méthodes WASM appelées par le bridge TS : ${bridgeInvokedSymbols.length}\n`);

  if (missingInCompiled.length > 0) {
    console.warn(`[ATTENTION] ${missingInCompiled.length} symboles du code source Rust ne sont pas encore compilés dans le binaire actuel :`);
    missingInCompiled.forEach(sym => console.warn(`   ❌ ${sym}`));
    console.warn('\nCes fonctions s\'exécutent actuellement via les fallbacks TypeScript déterministes C^∞.');
    console.warn('Reconstruction requise avec : npm run build:wasm\n');
  } else {
    console.log('✅ Tous les exports Rust sont présents dans le paquet compilé.');
  }

  if (missingInRustSource.length > 0) {
    console.error(`[ERREUR ABI] ${missingInRustSource.length} symboles appelés par le bridge n'existent ni dans lib.rs ni dans InMemoryDrawStore :`);
    missingInRustSource.forEach(sym => console.error(`   🚨 ${sym}`));
    process.exit(1);
  } else {
    console.log('✅ Tous les appels du bridge correspondent à des fonctions déclarées dans le moteur.');
  }

  console.log('\n=== VÉRIFICATION DU CONTRAT ABI TERMINÉE AVEC SUCCÈS ===');
}

verifyAbi();
