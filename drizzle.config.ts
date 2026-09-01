import type { Config } from 'drizzle-kit';

/**
 * `driver: 'expo'` makes drizzle-kit emit a migrations bundle that
 * `drizzle-orm/expo-sqlite/migrator` can apply on device, rather than trying to
 * connect to a database at generate time.
 */
export default {
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
  driver: 'expo',
} satisfies Config;
