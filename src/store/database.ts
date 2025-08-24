/*
  Simple in-memory database with TTL support for MemServLight server.
  Features: basic CRUD, TTL, pattern matching, cleanup.
*/

export interface CacheEntry {
  value: unknown;
  expiry?: number;
  createdAt: number;
}

export type Store = Map<string, CacheEntry>;

export class Database {
  private store: Store = new Map();

  private isExpired(entry: CacheEntry): boolean {
    return Boolean(entry.expiry && Date.now() > entry.expiry);
  }

  private createEntry(value: unknown, ttl?: number): CacheEntry {
    return {
    value,
    createdAt: Date.now(),
    expiry: ttl ? Date.now() + (ttl * 1000) : undefined
  };
}

  set(key: string, value: unknown, ttl?: number): boolean {
    this.store.set(key, this.createEntry(value, ttl));
    return true;
  }

  get(key: string): unknown {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (this.isExpired(entry)) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  delete(key: string): boolean {
    const deleted = this.store.delete(key);
    return deleted;
  }

  exists(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;

    if (this.isExpired(entry)) {
      this.store.delete(key);
      return false;
    }

    return true;
  }

  keys(pattern?: string): string[] {
    const validKeys: string[] = [];

    for (const [key, entry] of this.store.entries()) {
      if (this.isExpired(entry)) {
        this.store.delete(key);
        continue;
      }
      validKeys.push(key);
    }

    if (!pattern || pattern === '*') return validKeys;

    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    return validKeys.filter(key => regex.test(key));
  }

  clear(): boolean {
    this.store.clear();
    return true;
  }

  expire(key: string, seconds: number): boolean {
    const entry = this.store.get(key);
    if (!entry || this.isExpired(entry)) return false;

    this.store.set(key, {
      ...entry,
      expiry: Date.now() + (seconds * 1000)
    });
    return true;
  }

  ttl(key: string): number {
    const entry = this.store.get(key);
    if (!entry || this.isExpired(entry) || !entry.expiry) return -1;

    return Math.max(0, Math.ceil((entry.expiry - Date.now()) / 1000));
  }

  cleanupExpired(): number {
    let cleaned = 0;
    for (const [key, entry] of this.store.entries()) {
      if (this.isExpired(entry)) {
        this.store.delete(key);
        cleaned++;
      }
    }
    return cleaned;
  }
}
