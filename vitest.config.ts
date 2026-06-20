import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default defineConfig(async (env) => {
  // @ts-expect-error baseConfig could be a promise or function
  const baseConfig = await (typeof viteConfig === 'function' ? viteConfig(env) : viteConfig);
  return mergeConfig(baseConfig, {
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './vitest.setup.ts',
    },
  });
});
