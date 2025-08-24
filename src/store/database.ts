/*
  Simple in-memory database with TTL support for MemServLight server.
  Features: basic CRUD, TTL, pattern matching, cleanup.
*/

import { AsyncLock } from './asyncLock';

export interface CacheEntry {
  value: unknown;
  expiry?: number;
  createdAt: number;
}

export type Store = Map<string, CacheEntry>;

export class Database {
  private store: Store = new Map();
  private cachedSize: number = 0;
  private sizeNeedsUpdate: boolean = true;
  private lastCleanup: number = 0;
  private lock = new AsyncLock();

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

  async set(key: string, value: unknown, ttl?: number): Promise<boolean> {
    return await this.lock.withLock(() => {
      this.store.set(key, this.createEntry(value, ttl));
      this.sizeNeedsUpdate = true;
      return true;
    });
  }

  async get(key: string): Promise<unknown> {
    return await this.lock.withLock(() => {
      const entry = this.store.get(key);
      if (!entry) return null;

      if (this.isExpired(entry)) {
        this.store.delete(key);
        return null;
      }

      return entry.value;
    });
  }

  async delete(key: string): Promise<boolean> {
    return await this.lock.withLock(() => {
      const deleted = this.store.delete(key);
      if (deleted) this.sizeNeedsUpdate = true;
      return deleted;
    });
  }

  async exists(key: string): Promise<boolean> {
    return await this.lock.withLock(() => {
      const entry = this.store.get(key);
      if (!entry) return false;

      if (this.isExpired(entry)) {
        this.store.delete(key);
        return false;
      }

      return true;
    });
  }

  async keys(pattern?: string): Promise<string[]> {
    return await this.lock.withLock(() => {
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
    });
  }

  async clear(): Promise<boolean> {
    return await this.lock.withLock(() => {
      this.store.clear();
      this.cachedSize = 0;
      this.sizeNeedsUpdate = false;
      return true;
    });
  }

  async size(): Promise<number> {
    return await this.lock.withLock(() => {
      const now = Date.now();

      // Only recalculate if needed and do cleanup max once every 1000ms
      if (this.sizeNeedsUpdate || (now - this.lastCleanup > 1000)) {
        let count = 0;
        for (const [key, entry] of this.store.entries()) {
          if (entry.expiry && now > entry.expiry) {
            this.store.delete(key);
          } else {
            count++;
          }
        }
        this.cachedSize = count;
        this.sizeNeedsUpdate = false;
        this.lastCleanup = now;
      }

      return this.cachedSize;
    });
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    return await this.lock.withLock(() => {
      const entry = this.store.get(key);
      if (!entry || this.isExpired(entry)) return false;

      this.store.set(key, {
        ...entry,
        expiry: Date.now() + (seconds * 1000)
      });
      return true;
    });
  }

  async ttl(key: string): Promise<number> {
    return await this.lock.withLock(() => {
      const entry = this.store.get(key);
      if (!entry || this.isExpired(entry) || !entry.expiry) return -1;

      return Math.max(0, Math.ceil((entry.expiry - Date.now()) / 1000));
    });
  }

  async cleanupExpired(): Promise<number> {
    return await this.lock.withLock(() => {
      let cleaned = 0;
      for (const [key, entry] of this.store.entries()) {
        if (this.isExpired(entry)) {
          this.store.delete(key);
          cleaned++;
        }
      }
      return cleaned;
    });
  }
}
