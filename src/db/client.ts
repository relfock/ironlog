/**
 * SQLite connection.
 *
 * `enableChangeListener` is required for Drizzle's `useLiveQuery`, which is how
 * every screen reads data — no store duplication, no manual invalidation. MobX
 * is reserved for ephemeral session state (see src/stores).
 */
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import * as schema from './schema';

export const DATABASE_NAME = 'ironlog.db';

let sqlite: SQLiteDatabase | null = null;

export function getSqlite(): SQLiteDatabase {
  if (sqlite === null) {
    sqlite = openDatabaseSync(DATABASE_NAME, { enableChangeListener: true });
    // Durability and concurrency settings. WAL matters here: a workout writes
    // on every set tap, and rollback-journal mode would block reads mid-write.
    sqlite.execSync('PRAGMA journal_mode = WAL;');
    sqlite.execSync('PRAGMA foreign_keys = ON;');
  }
  return sqlite;
}

export const db = drizzle(getSqlite(), { schema });

export type Database = typeof db;
export { schema };
