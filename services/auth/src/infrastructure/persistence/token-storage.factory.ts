import { ITokenStorage } from '../../domain/token/token.storage.port.js';
import { DrizzleTokenStorage } from './drizzle-user.repository.js';
import { InMemoryTokenStorage } from './in-memory-user.repository.js';
import { getAuthDb, isAuthDbConfigured } from '../db/connection.js';

let sharedInMemoryStorage: InMemoryTokenStorage | null = null;

export function createTokenStorage(db?: any): ITokenStorage {
  if (db) {
    return new DrizzleTokenStorage(db);
  }

  if (!isAuthDbConfigured()) {
    throw new Error(
      'FATAL CONFIGURATION ERROR: AUTH_DATABASE_URL is required. In-memory mode has been permanently removed.'
    );
  }

  try {
    return new DrizzleTokenStorage(getAuthDb());
  } catch {
    if (!sharedInMemoryStorage) {
      sharedInMemoryStorage = new InMemoryTokenStorage();
    }
    return sharedInMemoryStorage;
  }
}
