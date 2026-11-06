import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { normalizePath, type Plugin } from 'vite';

const contentScriptEntries = {
  codePaster: resolve(import.meta.dirname, 'src/content/codePaster.ts'),
  pageScanner: resolve(import.meta.dirname, 'src/content/pageScanner.ts')
};
const wrappedContentScriptEntryIds = new Set(
  Object.values(contentScriptEntries).map(normalizePath)
);

export default defineConfig({
  plugins: [tailwindcss(), react(), wrapContentScriptEntries()],
  publicDir: 'assets/extension',
  build: {
    // Extension module imports cannot reuse document preloads across script worlds.
    modulePreload: false,
    outDir: 'dist/app',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        background: resolve(import.meta.dirname, 'src/background.ts'),
        ...contentScriptEntries
      },
      output: {
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: [
            {
              name: 'react',
              test: /node_modules\/(?:react|react-dom|scheduler)(?:\/|$)/
            },
            {
              name: 'interface-translations',
              test: /\/lib\/i18n\/interface\.json$/
            },
            { name: 'site-domains', test: /node_modules\/.*tldts/ }
          ]
        },
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    }
  },
  test: {
    environment: 'node',
    fsModuleCache: true,
    include: ['test/**/*.test.{ts,tsx}']
  }
});

function wrapContentScriptEntries(): Plugin {
  return {
    name: 'auth-wrap-content-script-entries',
    apply: 'build',
    renderChunk(code, chunk) {
      const entry = chunk.facadeModuleId && normalizePath(chunk.facadeModuleId);
      if (!entry || !wrappedContentScriptEntryIds.has(entry)) {
        return null;
      }

      if (
        chunk.imports.length > 0 ||
        chunk.dynamicImports.length > 0 ||
        chunk.exports.length > 0
      ) {
        this.error(`Content script ${chunk.name} must be self-contained`);
      }

      return {
        code: `(() => {\n${code}\n})();\n`,
        map: null
      };
    }
  };
}
