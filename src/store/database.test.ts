import { test, describe } from 'node:test';
import assert from 'node:assert';
import { Database } from './database';

describe('Database Thread Safety', () => {
  test('should handle concurrent read/write operations safely', async () => {
    const db = new Database();
    const key = 'test-key';
    const operations = [];

    // Set an initial value
    await db.set(key, 'initial-value');

    // Create 10 concurrent operations that read and write
    for (let i = 0; i < 10; i++) {
      operations.push(
        db.set(key, `value-${i}`).then(() => db.get(key))
      );
    }

    // Wait for all operations to complete
    const results = await Promise.all(operations);

    // All operations should have completed successfully
    assert.strictEqual(results.length, 10);

    // Each result should be a valid value (not null or undefined)
    results.forEach(result => {
      assert(result !== null && result !== undefined);
      assert(typeof result === 'string');
      assert(result.startsWith('value-'));
    });

    // The final value should be one of the set values
    const finalValue = await db.get(key);
    assert(typeof finalValue === 'string');
    assert(finalValue.startsWith('value-'));
  });

  test('should handle concurrent delete operations safely', async () => {
    const db = new Database();

    // Set up multiple keys
    const keys = ['key1', 'key2', 'key3', 'key4', 'key5'];
    for (const key of keys) {
      await db.set(key, `value-${key}`);
    }

    // Concurrently delete and check existence
    const operations = keys.map(async (key) => {
      const exists1 = await db.exists(key);
      const deleted = await db.delete(key);
      const exists2 = await db.exists(key);
      return { key, exists1, deleted, exists2 };
    });

    const results = await Promise.all(operations);

    // Verify that each key was properly handled
    results.forEach(({ key, exists1, deleted, exists2 }) => {
      // Each key should have existed initially
      assert.strictEqual(exists1, true, `Key ${key} should have existed initially`);
      // Each key should have been successfully deleted
      assert.strictEqual(deleted, true, `Key ${key} should have been deleted`);
      // Each key should not exist after deletion
      assert.strictEqual(exists2, false, `Key ${key} should not exist after deletion`);
    });
  });

  test('should handle concurrent size calculations safely', async () => {
    const db = new Database();
    const operations = [];

    // Perform concurrent set operations and size checks
    for (let i = 0; i < 5; i++) {
      operations.push(db.set(`key-${i}`, `value-${i}`));
      operations.push(db.size());
    }

    const results = await Promise.all(operations);

    // All operations should complete successfully
    assert.strictEqual(results.length, 10);

    // Final size should be 5 (all keys set)
    const finalSize = await db.size();
    assert.strictEqual(finalSize, 5);
  });

  test('should handle concurrent expire operations safely', async () => {
    const db = new Database();
    const key = 'expiring-key';

    await db.set(key, 'test-value');

    const operations = [];

    // Multiple concurrent expire operations
    for (let i = 1; i <= 5; i++) {
      operations.push(db.expire(key, i));
    }

    const results = await Promise.all(operations);

    // At least one expire operation should succeed
    const successCount = results.filter(result => result === true).length;
    assert(successCount >= 1, 'At least one expire operation should succeed');

    // Key should still exist (since we set expiry to positive values)
    const exists = await db.exists(key);
    assert.strictEqual(exists, true);

    // TTL should be a positive number
    const ttl = await db.ttl(key);
    assert(ttl > 0, 'TTL should be positive');
  });

  test('should handle concurrent keys operations safely', async () => {
    const db = new Database();
    const operations = [];

    // Set up some keys concurrently
    for (let i = 0; i < 5; i++) {
      operations.push(db.set(`pattern-${i}`, `value-${i}`));
    }

    await Promise.all(operations);

    // Concurrent keys operations with different patterns
    const keyOperations = [
      db.keys('*'),
      db.keys('pattern-*'),
      db.keys('pattern-1'),
      db.keys('nonexistent-*')
    ];

    const keyResults = await Promise.all(keyOperations);

    // All keys
    assert.strictEqual(keyResults[0].length, 5);

    // Pattern match
    assert.strictEqual(keyResults[1].length, 5);

    // Specific key
    assert.strictEqual(keyResults[2].length, 1);
    assert.strictEqual(keyResults[2][0], 'pattern-1');

    // Non-existent pattern
    assert.strictEqual(keyResults[3].length, 0);
  });

  test('AsyncLock should work correctly with withLock', async () => {
    const db = new Database();
    let counter = 0;
    const operations = [];

    // Create 10 concurrent operations that increment a counter
    for (let i = 0; i < 10; i++) {
      operations.push(
        // Access the private lock for testing purposes
        (db as any).lock.withLock(async () => {
          const current = counter;
          // Simulate some async work
          await new Promise(resolve => setTimeout(resolve, 1));
          counter = current + 1;
          return counter;
        })
      );
    }

    const results = await Promise.all(operations);

    // Without proper locking, this would be subject to race conditions
    // With proper locking, the counter should reach exactly 10
    assert.strictEqual(counter, 10);

    // Results should be sequential numbers from 1 to 10
    const sortedResults = results.sort((a, b) => a - b);
    for (let i = 0; i < 10; i++) {
      assert.strictEqual(sortedResults[i], i + 1);
    }
  });
});
