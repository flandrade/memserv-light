import { test, describe } from 'node:test';
import assert from 'node:assert';
import { Database } from './database';

describe('Database Thread Safety', () => {
  test('should handle read/write operations safely', () => {
    const db = new Database();
    const key = 'test-key';

    // Set an initial value
    db.set(key, 'initial-value');

    // Perform sequential operations (since they're now synchronous)
    const results: unknown[] = [];
    for (let i = 0; i < 10; i++) {
      db.set(key, `value-${i}`);
      const result = db.get(key);
      results.push(result);
    }

    // All operations should have completed successfully
    assert.strictEqual(results.length, 10);

    // Each result should be a valid value (not null or undefined)
    results.forEach(result => {
      assert(result !== null && result !== undefined);
      assert(typeof result === 'string');
      assert(result.startsWith('value-'));
    });

    // The final value should be the last set value
    const finalValue = db.get(key);
    assert.strictEqual(finalValue, 'value-9');
  });

  test('should handle delete operations safely', () => {
    const db = new Database();

    // Set up multiple keys
    const keys = ['key1', 'key2', 'key3', 'key4', 'key5'];
    for (const key of keys) {
      db.set(key, `value-${key}`);
    }

    // Delete and check existence for each key
    const results = keys.map((key) => {
      const exists1 = db.exists(key);
      const deleted = db.delete(key);
      const exists2 = db.exists(key);
      return { key, exists1, deleted, exists2 };
    });

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


  test('should handle expire operations safely', () => {
    const db = new Database();
    const keys = ['exp1', 'exp2', 'exp3'];

    // Set up keys with different expiration times
    for (let i = 0; i < keys.length; i++) {
      db.set(keys[i], `value-${i}`, 1); // 1 second TTL
      const success = db.expire(keys[i], 2); // Extend to 2 seconds
      assert.strictEqual(success, true, `Should be able to set expiry for ${keys[i]}`);
    }

    // All keys should still exist
    keys.forEach(key => {
      assert.strictEqual(db.exists(key), true, `Key ${key} should exist`);
      assert(db.ttl(key) > 0, `Key ${key} should have positive TTL`);
    });

    // Setting expiry on non-existent key should fail
    const success = db.expire('non-existent', 10);
    assert.strictEqual(success, false, 'Should not be able to set expiry on non-existent key');
  });

  test('should handle keys operations safely', () => {
    const db = new Database();

    // Set up keys with patterns
    const patterns = ['user:1', 'user:2', 'admin:1', 'temp:data'];
    patterns.forEach((key, i) => {
      db.set(key, `value-${i}`);
    });

    // Test pattern matching
    const userKeys = db.keys('user:*');
    assert.strictEqual(userKeys.length, 2);
    assert(userKeys.includes('user:1'));
    assert(userKeys.includes('user:2'));

    const allKeys = db.keys('*');
    assert.strictEqual(allKeys.length, 4);

    const adminKeys = db.keys('admin:*');
    assert.strictEqual(adminKeys.length, 1);
    assert.strictEqual(adminKeys[0], 'admin:1');
  });

  test('should handle TTL operations correctly', () => {
    const db = new Database();

    // Test TTL on non-existent key
    assert.strictEqual(db.ttl('non-existent'), -2);

    // Test TTL on key without expiry
    db.set('no-expiry', 'value');
    assert.strictEqual(db.ttl('no-expiry'), -1);

    // Test TTL on key with expiry
    db.set('with-expiry', 'value', 10);
    const ttl = db.ttl('with-expiry');
    assert(ttl > 0 && ttl <= 10, 'TTL should be positive and <= 10');
  });

  test('should handle basic CRUD operations', () => {
    const db = new Database();

    // Test set and get
    db.set('test', 'value');
    assert.strictEqual(db.get('test'), 'value');

    // Test exists
    assert.strictEqual(db.exists('test'), true);
    assert.strictEqual(db.exists('non-existent'), false);

    // Test delete
    assert.strictEqual(db.delete('test'), true);
    assert.strictEqual(db.exists('test'), false);
    assert.strictEqual(db.get('test'), null);

    // Test delete non-existent
    assert.strictEqual(db.delete('non-existent'), false);
  });

  test('should handle TTL expiration correctly', () => {
    const db = new Database();

    // Set a key with very short TTL (using direct expiry manipulation for testing)
    const now = Date.now();
    db.set('short-ttl', 'value');

    // Manually set expiry to past (simulate expired key)
    const entry = (db as any).store.get('short-ttl');
    if (entry) {
      entry.expiry = now - 1000; // Expired 1 second ago
    }

    // Key should be considered expired
    assert.strictEqual(db.get('short-ttl'), null);
    assert.strictEqual(db.exists('short-ttl'), false);
    assert.strictEqual(db.ttl('short-ttl'), -2);
  });

  test('should handle clear operation', () => {
    const db = new Database();

    // Add some data
    db.set('key1', 'value1');
    db.set('key2', 'value2');

    // Clear should remove everything
    assert.strictEqual(db.clear(), true);
    assert.strictEqual(db.exists('key1'), false);
    assert.strictEqual(db.exists('key2'), false);
  });
});