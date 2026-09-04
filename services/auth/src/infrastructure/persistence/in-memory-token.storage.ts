import { ITokenStorage } from '../../domain/token/token.storage.port.js';

interface StoredToken {
  userId: string;
  expiresAt: number;
  revokedAt?: number;
}

export class InMemoryTokenStorage implements ITokenStorage {
  private readonly tokens = new Map<string, StoredToken>();

  saveRefreshToken(token: string, userId: string, expiresAt: Date): void {
    this.tokens.set(token, {
      userId,
      expiresAt: expiresAt.getTime(),
    });
  }

  validateRefreshToken(token: string): { userId: string } | null {
    const record = this.tokens.get(token);
    if (!record || record.revokedAt) {
      return null;
    }

    if (Date.now() > record.expiresAt) {
      this.tokens.delete(token);
      return null;
    }

    return { userId: record.userId };
  }

  revokeRefreshToken(token: string): boolean {
    const record = this.tokens.get(token);
    if (record) {
      record.revokedAt = Date.now();
      this.tokens.delete(token);
      return true;
    }
    return false;
  }

  clear(): void {
    this.tokens.clear();
  }
}
