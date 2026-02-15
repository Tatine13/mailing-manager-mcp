import { defineConfig } from 'tsup';

export default defineConfig([
  // Library entry (no shebang)
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'node18',
    platform: 'node',
    splitting: false,
    treeshake: true
  },
  // CLI binaries (with shebang)
  {
    entry: {
      'bin/cli': 'src/bin/cli.ts',
      'bin/server': 'src/bin/server.ts'
    },
    format: ['esm'],
    dts: false,
    sourcemap: true,
    clean: false, // Don't clean — index build already ran
    target: 'node18',
    platform: 'node',
    splitting: false,
    treeshake: true,
    banner: {
      js: '#!/usr/bin/env node'
    }
  }
]);
