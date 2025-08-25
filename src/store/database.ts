/*
  Simple in-memory database with TTL support for MemServLight server.
*/

export interface CacheEntry {
  value: unknown;
  expiry?: number;
  createdAt: number;
}

export type Store = Map<string, CacheEntry>;

/**
 * Database class for MemServLight server.
 *
 * This class provides a simple in-memory database with TTL support.
 * It uses a Map to store key-value pairs and provides methods for CRUD operations.
 *
 */
export class Database {
  private store: Store = new Map();

  /**
   * Checks if a cache entry has expired.
   *
   * @param entry - The cache entry to check.
   * @returns True if the entry has expired, false otherwise.
   */
  private isExpired(entry: CacheEntry): boolean {
    return Boolean(entry.expiry && Date.now() > entry.expiry);
  }


  /**
   * Sets a key-value pair in the database.
   *
   * @param key - The key to set.
   * @param value - The value to store.
   * @param ttl - The TTL in seconds.
   * @returns True if the key-value pair was set, false otherwise.
   */
  set(key: string, value: unknown, ttl?: number): boolean {
    this.store.set(key, {
      value,
      createdAt: Date.now(),
      // if ttl is provided, set the expiry time to the current time plus the ttl in seconds
      expiry: ttl ? Date.now() + (ttl * 1000) : undefined
    });
    return true;
  }

  /**
   * Gets a value from the database.
   *
   * @param key - The key to get.
   * @returns The value associated with the key, or null if the key does not exist or has expired.
   */
  get(key: string): unknown {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (this.isExpired(entry)) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Deletes a key-value pair from the database.
   *
   * @param key - The key to delete.
   * @returns True if the key-value pair was deleted, false otherwise.
   */
  delete(key: string): boolean {
    const deleted = this.store.delete(key);
    return deleted;
  }

  /**
   * Checks if a key exists in the database.
   *
   * @param key - The key to check.
   * @returns True if the key exists, false otherwise.
   */
  exists(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;

    if (this.isExpired(entry)) {
      this.store.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Lists all keys in the database.
   *
   * @param pattern - The pattern to filter keys.
   * @returns An array of keys that match the pattern.
   */
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

    // if pattern is provided, filter the keys that match the pattern
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    return validKeys.filter(key => regex.test(key));
  }

  /**
   * Clears the database.
   *
   * @returns True if the database was cleared, false otherwise.
   */
  clear(): boolean {
    this.store.clear();
    return true;
  }

  /**
   * Sets the expiration time for a key.
   *
   * @param key - The key to set the expiration time for.
   * @param seconds - The number of seconds until the key expires.
   * @returns True if the expiration time was set, false otherwise.
   */
  expire(key: string, seconds: number): boolean {
    const entry = this.store.get(key);
    if (!entry || this.isExpired(entry)) return false;

    this.store.set(key, {
      ...entry,
      expiry: Date.now() + (seconds * 1000)
    });
    return true;
  }

  /**
   * Gets the time to live for a key.
   *
   * @param key - The key to get the time to live for.
   * @returns The time to live for the key, or -2 if the key does not exist or has expired, or -1 if the key has no expiration time.
   */
  ttl(key: string): number {
    const entry = this.store.get(key);
    if (!entry || this.isExpired(entry)) return -2;
    if (entry.expiry === undefined) return -1;

    return Math.max(0, Math.ceil((entry.expiry - Date.now()) / 1000));
  }
}
