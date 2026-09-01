/**
 * Primary keys.
 *
 * UUIDv7 via `expo-crypto`'s native `getRandomBytes`. The `uuid` npm package is
 * deliberately NOT used: it calls the global `crypto.getRandomValues()`, which
 * Hermes does not implement, and the app failed to launch with
 * "crypto.getRandomValues() not supported". See src/domain/uuidv7.ts.
 */
import { getRandomBytes } from 'expo-crypto';
import { uuidv7 } from '@/domain/uuidv7';

export function newId(): string {
  return uuidv7(Date.now(), getRandomBytes);
}
