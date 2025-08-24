import { test, describe } from 'node:test';
import assert from 'node:assert';
import { serialize, deserialize, formatResponse, type RespValue } from './serializer';

describe('RESP Serializer', () => {
  describe('serialize', () => {
    test('should serialize null values', () => {
      const result = serialize(null);
      assert.strictEqual(result, '$-1\r\n');
    });

    test('should serialize strings', () => {
      const result = serialize('hello');
      assert.strictEqual(result, '+hello\r\n');
    });

    test('should serialize empty strings', () => {
      const result = serialize('');
      assert.strictEqual(result, '+\r\n');
    });

    test('should serialize strings with special characters', () => {
      const result = serialize('hello\nworld');
      assert.strictEqual(result, '+hello\nworld\r\n');
    });

    test('should serialize positive numbers', () => {
      const result = serialize(42);
      assert.strictEqual(result, ':42\r\n');
    });

    test('should serialize negative numbers', () => {
      const result = serialize(-10);
      assert.strictEqual(result, ':-10\r\n');
    });

    test('should serialize zero', () => {
      const result = serialize(0);
      assert.strictEqual(result, ':0\r\n');
    });

    test('should serialize true boolean', () => {
      const result = serialize(true);
      assert.strictEqual(result, ':1\r\n');
    });

    test('should serialize false boolean', () => {
      const result = serialize(false);
      assert.strictEqual(result, ':0\r\n');
    });

    test('should serialize empty arrays', () => {
      const result = serialize([]);
      assert.strictEqual(result, '*0\r\n');
    });

    test('should serialize arrays with single string', () => {
      const result = serialize(['hello']);
      assert.strictEqual(result, '*1\r\n+hello\r\n');
    });

    test('should serialize arrays with multiple strings', () => {
      const result = serialize(['hello', 'world']);
      assert.strictEqual(result, '*2\r\n+hello\r\n+world\r\n');
    });

    test('should serialize arrays with mixed types', () => {
      const result = serialize(['hello', 42, true, null]);
      assert.strictEqual(result, '*4\r\n+hello\r\n:42\r\n:1\r\n$-1\r\n');
    });

    test('should serialize nested arrays', () => {
      const result = serialize([['a', 'b'], ['c']]);
      assert.strictEqual(result, '*2\r\n*2\r\n+a\r\n+b\r\n*1\r\n+c\r\n');
    });

    test('should serialize undefined as string', () => {
      const result = serialize(undefined as any); // Allow undefined for this legacy test
      assert.strictEqual(result, '$9\r\nundefined\r\n');
    });

    test('should serialize objects as string', () => {
      const result = serialize({ key: 'value' } as any); // Allow objects for this legacy test
      assert.strictEqual(result, '$15\r\n[object Object]\r\n');
    });
  });

  describe('deserialize', () => {
    test('should deserialize null bulk string', () => {
      const result = deserialize('$-1\r\n');
      assert.strictEqual(result, null);
    });

    test('should deserialize simple strings', () => {
      const result = deserialize('$5\r\nhello\r\n');
      assert.strictEqual(result, 'hello');
    });

    test('should deserialize empty strings', () => {
      const result = deserialize('$0\r\n\r\n');
      assert.strictEqual(result, '');
    });

    test('should deserialize integers', () => {
      const result = deserialize(':42\r\n');
      assert.strictEqual(result, 42);
    });

    test('should deserialize negative integers', () => {
      const result = deserialize(':-10\r\n');
      assert.strictEqual(result, -10);
    });

    test('should deserialize simple strings with + prefix', () => {
      const result = deserialize('+OK\r\n');
      assert.strictEqual(result, 'OK');
    });

    test('should deserialize empty arrays', () => {
      const result = deserialize('*0\r\n');
      assert.deepStrictEqual(result, []);
    });

    test('should deserialize arrays with single element', () => {
      const result = deserialize('*1\r\n$5\r\nhello\r\n');
      assert.deepStrictEqual(result, ['hello']);
    });

    test('should deserialize arrays with multiple elements', () => {
      const result = deserialize('*2\r\n$5\r\nhello\r\n$5\r\nworld\r\n');
      assert.deepStrictEqual(result, ['hello', 'world']);
    });

    test('should deserialize arrays with mixed types', () => {
      const result = deserialize('*3\r\n$5\r\nhello\r\n:42\r\n$-1\r\n');
      assert.deepStrictEqual(result, ['hello', 42, null]);
    });

    test('should deserialize nested arrays', () => {
      const result = deserialize('*2\r\n*2\r\n$1\r\na\r\n$1\r\nb\r\n*1\r\n$1\r\nc\r\n');
      assert.deepStrictEqual(result, [['a', 'b'], ['c']]);
    });

    test('should handle empty input', () => {
      assert.throws(() => {
        deserialize('');
      }, /Empty input data/);
    });

    test('should handle malformed input gracefully', () => {
      const result = deserialize('invalid\r\n');
      assert.strictEqual(result, 'nvalid');
    });

    test('should throw error on error response', () => {
      assert.throws(() => {
        deserialize('-ERROR Something went wrong\r\n');
      }, /Something went wrong/);
    });
  });

  describe('formatResponse', () => {
    test('should format OK response', () => {
      const result = formatResponse('OK');
      assert.strictEqual(result, '+OK\r\n');
    });

    test('should format ERROR response with message', () => {
      const result = formatResponse('ERROR', 'Something went wrong');
      assert.strictEqual(result, '-ERROR Something went wrong\r\n');
    });

    test('should format ERROR response without message', () => {
      const result = formatResponse('ERROR');
      assert.strictEqual(result, '-ERROR Unknown error\r\n');
    });

    test('should format data response using serialize', () => {
      const result = formatResponse('DATA', 'hello');
      assert.strictEqual(result, '+hello\r\n');
    });

    test('should format data response with array', () => {
      const result = formatResponse('DATA', ['a', 'b']);
      assert.strictEqual(result, '*2\r\n+a\r\n+b\r\n');
    });

    test('should format data response with number', () => {
      const result = formatResponse('DATA', 42);
      assert.strictEqual(result, ':42\r\n');
    });

    test('should format data response with null', () => {
      const result = formatResponse('DATA', null);
      assert.strictEqual(result, '$-1\r\n');
    });
  });

  describe('serialize/deserialize', () => {
    test('should maintain string values through round-trip', () => {
      const original = 'hello world';
      const serialized = serialize(original);
      const deserialized = deserialize(serialized);
      assert.strictEqual(deserialized, original);
    });

    test('should maintain number values through round-trip', () => {
      const original = 42;
      const serialized = serialize(original);
      const deserialized = deserialize(serialized);
      assert.strictEqual(deserialized, original);
    });

    test('should maintain null values through round-trip', () => {
      const original = null;
      const serialized = serialize(original);
      const deserialized = deserialize(serialized);
      assert.strictEqual(deserialized, original);
    });

    test('should maintain array values through round-trip', () => {
      const original = ['hello', 42, null, true];
      const serialized = serialize(original);
      const deserialized = deserialize(serialized);
      assert.deepStrictEqual(deserialized, ['hello', 42, null, 1]); // Note: boolean becomes 1
    });

    test('should maintain nested arrays through round-trip', () => {
      const original = [['a', 'b'], [1, 2], [null]];
      const serialized = serialize(original);
      const deserialized = deserialize(serialized);
      assert.deepStrictEqual(deserialized, [['a', 'b'], [1, 2], [null]]);
    });

    test('should maintain empty structures through round-trip', () => {
      const original: RespValue[] = [];
      const serialized = serialize(original);
      const deserialized = deserialize(serialized);
      assert.deepStrictEqual(deserialized, original);
    });
  });
});
