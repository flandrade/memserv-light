import { AsyncLockError } from "../utils/error";

/**
 * A simple async lock implementation for JavaScript/TypeScript.
 */
export class AsyncLock {
  private locked: boolean = false;
  private waitQueue: Array<() => void> = [];

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }

    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  release(): void {
    if (!this.locked) {
      throw new AsyncLockError('Cannot release a lock that is not held');
    }

    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift();
      if (next) {
        next();
      }
    } else {
      this.locked = false;
    }
  }

  async withLock<T>(fn: () => Promise<T> | T): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}