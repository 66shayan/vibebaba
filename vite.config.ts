import { vitePlugin as remix, cloudflareDevProxyVitePlugin } from '@remix-run/dev';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import * as dotenv from 'dotenv';
import { optimizeCssModules } from 'vite-plugin-optimize-css-modules';
import wasm from 'vite-plugin-wasm';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { sentryVitePlugin } from '@sentry/vite-plugin';

dotenv.config();

export default defineConfig((config) => {
  const isCloudflare = process.env.CF_PAGES === '1' || process.env.CLOUDFLARE;
  
  return {
    define: {
      'process.env.VERCEL_ENV': JSON.stringify(process.env.VERCEL_ENV),
      'process.env.VERCEL_GIT_COMMIT_SHA': JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA),
    },

    ssr: isCloudflare
      ? {
          // Cloudflare Workers runtime configuration
          resolve: {
            conditions: ['workerd', 'worker', 'browser'],
            externalConditions: ['workerd', 'worker'],
          },
          external: [
            'cloudflare',
            '@protobufjs/inquire',
            '@protobufjs/inquire?commonjs-external',
            '@sentry/remix',
            'vite-plugin-node-polyfills',
          ],
        }
      : config.command === 'build'
        ? {
            // Vercel/Node.js configuration
            external: [
              'cloudflare',
              '@protobufjs/inquire',
              '@protobufjs/inquire?commonjs-external',
              '@sentry/remix',
              'vite-plugin-node-polyfills',
            ],
          }
        : { noExternal: ['@protobufjs/inquire'] },
    
    build: {
      target: 'esnext',
      sourcemap: true,
      rollupOptions: {
        output: {
          format: 'esm',
        },
      },
      commonjsOptions: {
        transformMixedEsModules: true,
      },
    },
    
    optimizeDeps: {
      include: [
        'jose',
        'classnames',
        'react-dom',
        'react-fast-compare',
        'warning',
        'fuzzy',
      ],
      esbuildOptions: {
        define: {
          global: 'globalThis',
        },
      },
    },
    
    resolve: {
      alias: {
        buffer: 'vite-plugin-node-polyfills/polyfills/buffer',
        ...(config.mode === 'test' ? { 'lz4-wasm': 'lz4-wasm/dist/index.js' } : {}),
      },
    },
    
    server: {
      host: '127.0.0.1',
      strictPort: true,
    },
    
    plugins: [
      // Cloudflare dev proxy for local development
      isCloudflare && cloudflareDevProxyVitePlugin(),
      
      nodePolyfills({
        include: ['buffer', 'process', 'stream'],
        globals: {
          Buffer: true,
          process: true,
          global: true,
        },
        protocolImports: true,
        exclude: ['child_process', 'fs', 'path'],
      }),
      
      {
        name: 'buffer-polyfill',
        transform(code, id) {
          if (id.includes('env.mjs')) {
            return {
              code: `import { Buffer } from 'buffer';\n${code}`,
              map: null,
            };
          }
        },
      },

      remix({
        // Only use Vercel preset when deploying to Vercel
        ...(process.env.VERCEL && !isCloudflare ? { 
          presets: [
            // You'll need to import this at the top if using Vercel
            // import { vercelPreset } from '@vercel/remix/vite';
            // vercelPreset()
          ] 
        } : {}),
        future: {
          v3_fetcherPersist: true,
          v3_relativeSplatPath: true,
          v3_throwAbortReason: true,
          v3_lazyRouteDiscovery: true,
        },
      }),
      
      tsconfigPaths(),
      config.mode === 'production' && optimizeCssModules({ apply: 'build' }),
      wasm(),
      
      sentryVitePlugin({
        authToken: process.env.SENTRY_VITE_PLUGIN_AUTH_TOKEN,
        org: 'convex-dev',
        project: '4509097600811008',
        disable: process.env.VERCEL_ENV !== 'production',
      }),
    ].filter(Boolean),
    
    envPrefix: ['VITE_'],
    
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler',
        },
      },
    },
  };
});
