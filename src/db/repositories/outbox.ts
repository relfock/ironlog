import { db } from '../client';
import { syncOutbox } from '../schema';

export type SyncOp = 'insert' | 'update' | 'delete';

/**
 * Record a change for a future sync engine.
 *
 * Nothing reads this table yet. It exists now because retrofitting a change log
 * onto an app that already holds years of history means either a lossy backfill
 * or a full re-upload; one INSERT per mutation today avoids that entirely.
 *
 * Failures are swallowed on purpose: the outbox is bookkeeping, and it must
 * never be the reason a user loses a logged set.
 */
export async function recordChange(
  tableName: string,
  rowId: string,
  op: SyncOp,
): Promise<void> {
  try {
    await db.insert(syncOutbox).values({ tableName, rowId, op, changedAt: Date.now() });
  } catch {
    // Intentionally ignored — see above.
  }
}
