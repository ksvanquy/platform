import { getAttemptDb } from './connection.js';
import { attempts } from './schema.js';

export async function seedAttemptDatabase(): Promise<void> {
  const db = getAttemptDb();

  // Check if any attempts exist
  const existing = await db.select().from(attempts).limit(1);
  if (existing.length > 0) {
    return;
  }

  console.log('✅ Attempt database connected and ready for runtime sessions.');
}
