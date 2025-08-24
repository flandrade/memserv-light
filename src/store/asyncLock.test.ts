import { test, describe } from 'node:test';
import assert from 'node:assert';
import { AsyncLock } from './asyncLock';

describe('AsyncLock', () => {

  test('should allow only one operation at a time', async () => {
    const lock = new AsyncLock();
    const results: number[] = [];
    const operations = [];

    for (let i = 0; i < 5; i++) {
      operations.push(
        lock.withLock(async () => {
          const start = results.length;
          // Simulate async work
          await new Promise(resolve => setTimeout(resolve, 10));
          results.push(i);
          // Ensure no other operation modified the array during our work
          assert.strictEqual(results.length, start + 1);
          return i;
        })
      );
    }

    await Promise.all(operations);

    // All operations should complete
    assert.strictEqual(results.length, 5);
  });

  test('should handle errors properly and release lock', async () => {
    const lock = new AsyncLock();

    // First operation throws an error
    const errorOperation = lock.withLock(async () => {
      throw new Error('Test error');
    });

    await assert.rejects(errorOperation, /Test error/);

    // Second operation should still work (lock should be released)
    const successOperation = lock.withLock(async () => {
      return 'success';
    });

    const result = await successOperation;
    assert.strictEqual(result, 'success');
  });
});
