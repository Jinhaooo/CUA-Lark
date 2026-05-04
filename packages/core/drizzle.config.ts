import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/trace/schema.ts',
  out: './migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: './traces/cua-lark.db',
  },
});