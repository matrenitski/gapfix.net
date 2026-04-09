import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'what-is-gap-limit': resolve(__dirname, 'what-is-gap-limit/index.html'),
        'how-to-fix-bitcoin-wallet-zero-balance': resolve(__dirname, 'how-to-fix-bitcoin-wallet-zero-balance/index.html'),
        'utxo-recovery': resolve(__dirname, 'utxo-recovery/index.html'),
      },
    },
  },
});
