import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { db } from './client';
import migrations from './migrations/migrations';

/**
 * Applies any pending migrations on launch. Returns Drizzle's
 * `{ success, error }` so the UI can show a real failure instead of a blank
 * screen — a migration failure must never be silent, because the alternative
 * is an app that looks empty and invites the user to start over.
 */
export function useDatabaseMigrations() {
  return useMigrations(db, migrations);
}
