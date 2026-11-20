import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

console.log('[Build] Compilando aplicación de escritorio y Electron...');

// 1. Compilar interfaz React de la consola de producción
await esbuild.build({
  entryPoints: ['desktop-app/src/index.tsx'],
  bundle: true,
  outfile: 'desktop-app/dist/bundle.js',
  format: 'esm',
  jsx: 'automatic',
  minify: process.env.NODE_ENV === 'production',
  sourcemap: true,
});
console.log('[Build] ✓ desktop-app/dist/bundle.js generado');

// 2. Compilar proceso principal de Electron (ESM y CJS)
await esbuild.build({
  entryPoints: ['desktop-app/electron/main.ts'],
  bundle: true,
  outfile: 'desktop-app/electron/main.js',
  format: 'esm',
  platform: 'node',
  external: ['electron'],
  sourcemap: true,
});

await esbuild.build({
  entryPoints: ['desktop-app/electron/main.ts'],
  bundle: true,
  outfile: 'desktop-app/electron/main.cjs',
  format: 'cjs',
  platform: 'node',
  external: ['electron'],
  sourcemap: true,
});
console.log('[Build] ✓ desktop-app/electron/main.js y main.cjs generados');

// 3. Compilar preload script de Electron (CJS para contextBridge)
await esbuild.build({
  entryPoints: ['desktop-app/electron/preload.ts'],
  bundle: true,
  outfile: 'desktop-app/electron/preload.js',
  format: 'cjs',
  platform: 'node',
  external: ['electron'],
  sourcemap: true,
});

fs.copyFileSync('desktop-app/electron/preload.js', 'desktop-app/electron/preload.cjs');
console.log('[Build] ✓ desktop-app/electron/preload.js generado');

console.log('[Build] ✓ Compilación completada con éxito.');
