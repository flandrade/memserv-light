import { test, describe } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import { AppendOnlyPersister, restoreFromFile, type PersistenceOptions } from './persistence';
import { serialize, deserialize, type RespValue } from '../serializer/serializer';

// Mock MemServ interface for testing
class MockMemServ {
  parse(request: string): unknown {
    try {
      return deserialize(request);
    } catch {
      return null;
    }
  }

  execute(command: unknown): string {
    if (Array.isArray(command) && command.length > 0) {
      return `+OK ${command[0]}`;
    }
    return '+OK';
  }
}

describe('AppendOnlyPersister', () => {
  const testDir = path.join(process.cwd(), 'data');
  const testFile = path.join(testDir, 'test.aof');

  // Helper function to cleanup test directory
  const cleanup = () => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  };

  describe('constructor', () => {
    test('should create directory if it does not exist', async () => {
      cleanup();
      const persister = new AppendOnlyPersister(testFile);
      assert(fs.existsSync(testDir), 'Directory should be created');
      await persister.close();
      cleanup();
    });

    test('should create write stream with append flag', async () => {
      cleanup();
      const persister = new AppendOnlyPersister(testFile);
      // Write something to ensure file is created
      persister.logCommand(['SET', 'test', 'value']);
      await persister.flush();
      assert(fs.existsSync(testFile), 'File should be created');
      await persister.close();
      cleanup();
    });

    test('should handle existing directory', async () => {
      cleanup();
      fs.mkdirSync(testDir, { recursive: true });
      const persister = new AppendOnlyPersister(testFile);
      // Write something to ensure file is created
      persister.logCommand(['SET', 'test', 'value']);
      await persister.flush();
      assert(fs.existsSync(testFile), 'File should be created in existing directory');
      await persister.close();
      cleanup();
    });
  });

    describe('logCommand', () => {
    test('should write valid commands to file', async () => {
      cleanup();
      const persister = new AppendOnlyPersister(testFile);
      const command: RespValue[] = ['SET', 'key1', 'value1'];

      persister.logCommand(command);
      await persister.flush();
      await persister.close();

      const content = fs.readFileSync(testFile, 'utf8');
      const expected = serialize(command);
      assert.strictEqual(content, expected);
      cleanup();
    });

    test('should handle multiple commands', async () => {
      cleanup();
      const persister = new AppendOnlyPersister(testFile);
      const commands: RespValue[][] = [
        ['SET', 'key1', 'value1'],
        ['SET', 'key2', 'value2'],
        ['DEL', 'key1']
      ];

      commands.forEach(cmd => persister.logCommand(cmd));
      await persister.flush();
      await persister.close();

      const content = fs.readFileSync(testFile, 'utf8');
      const expected = commands.map(cmd => serialize(cmd)).join('');
      assert.strictEqual(content, expected);
      cleanup();
    });

    test('should ignore invalid commands', async () => {
      cleanup();
      const persister = new AppendOnlyPersister(testFile);

      // Invalid commands
      persister.logCommand([]);
      persister.logCommand(null as any);
      persister.logCommand(undefined as any);

      // Valid command
      persister.logCommand(['SET', 'key1', 'value1']);
      await persister.flush();
      await persister.close();

      const content = fs.readFileSync(testFile, 'utf8');
      const expected = serialize(['SET', 'key1', 'value1']);
      assert.strictEqual(content, expected);
      cleanup();
    });

    test('should not write after close', async () => {
      cleanup();
      const persister = new AppendOnlyPersister(testFile);
      // Write something first to create the file
      persister.logCommand(['SET', 'key1', 'value1']);
      await persister.flush();
      await persister.close();

      // Try to write after close
      persister.logCommand(['SET', 'key2', 'value2']);

      const content = fs.readFileSync(testFile, 'utf8');
      const expected = serialize(['SET', 'key1', 'value1']);
      assert.strictEqual(content, expected, 'Should only contain the first command');
      cleanup();
    });
  });

    describe('flush', () => {
    test('should flush pending writes', async () => {
      cleanup();
      const persister = new AppendOnlyPersister(testFile);
      persister.logCommand(['SET', 'key1', 'value1']);

      await persister.flush();

      const content = fs.readFileSync(testFile, 'utf8');
      const expected = serialize(['SET', 'key1', 'value1']);
      assert.strictEqual(content, expected);

      await persister.close();
      cleanup();
    });

    test('should handle flush when closed', async () => {
      cleanup();
      const persister = new AppendOnlyPersister(testFile);
      await persister.close();

      // Should not throw
      await persister.flush();
      cleanup();
    });
  });

    describe('close', () => {
        test('should close write stream and mark as closed', async () => {
      cleanup();
      const persister = new AppendOnlyPersister(testFile);
      persister.logCommand(['SET', 'key1', 'value1']);
      await persister.flush();

      await persister.close();

      // Should not be able to write after close
      persister.logCommand(['SET', 'key2', 'value2']);

      const content = fs.readFileSync(testFile, 'utf8');
      const expected = serialize(['SET', 'key1', 'value1']);
      assert.strictEqual(content, expected);
      cleanup();
    });

    test('should handle multiple close calls', async () => {
      cleanup();
      const persister = new AppendOnlyPersister(testFile);

      await persister.close();
      // Should not throw on second close
      await persister.close();
      cleanup();
    });
  });

    describe('error handling', () => {
    test('should handle write stream errors gracefully', async () => {
      cleanup();
      // Create a file that can't be written to (read-only directory)
      const readOnlyDir = path.join(testDir, 'readonly');
      fs.mkdirSync(readOnlyDir, { recursive: true });
      fs.chmodSync(readOnlyDir, 0o444); // Read-only

      const readOnlyFile = path.join(readOnlyDir, 'test.aof');

      // Should not throw during construction
      const persister = new AppendOnlyPersister(readOnlyFile);

      // Should handle write errors gracefully
      persister.logCommand(['SET', 'key1', 'value1']);

      // Clean up
      fs.chmodSync(readOnlyDir, 0o755);
      await persister.close();
      cleanup();
    });
  });
});

describe('restoreFromFile', () => {
  const testDir = path.join(process.cwd(), 'test-restore');
  const testFile = path.join(testDir, 'restore.aof');

  // Helper function to cleanup test directory
  const cleanup = () => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  };

    test('should return true for non-existent file', async () => {
    cleanup();
    const memserv = new MockMemServ();
    const result = await restoreFromFile('non-existent.aof', memserv);
    assert.strictEqual(result, true);
  });

  test('should restore single command from file', async () => {
    cleanup();
    fs.mkdirSync(testDir, { recursive: true });
    const memserv = new MockMemServ();
    const command: RespValue[] = ['SET', 'key1', 'value1'];
    const data = serialize(command);

    fs.writeFileSync(testFile, data);

    const result = await restoreFromFile(testFile, memserv);
    assert.strictEqual(result, true);
    cleanup();
  });

    test('should restore multiple commands from file', async () => {
    cleanup();
    fs.mkdirSync(testDir, { recursive: true });
    const memserv = new MockMemServ();
    const commands: RespValue[][] = [
      ['SET', 'key1', 'value1'],
      ['SET', 'key2', 'value2'],
      ['DEL', 'key1']
    ];

    const data = commands.map(cmd => serialize(cmd)).join('');
    fs.writeFileSync(testFile, data);

    const result = await restoreFromFile(testFile, memserv);
    assert.strictEqual(result, true);
    cleanup();
  });

  test('should handle incomplete commands in buffer', async () => {
    cleanup();
    fs.mkdirSync(testDir, { recursive: true });
    const memserv = new MockMemServ();
    const command: RespValue[] = ['SET', 'key1', 'value1'];
    const data = serialize(command);

    // Write incomplete data
    fs.writeFileSync(testFile, data.substring(0, data.length - 5));

    const result = await restoreFromFile(testFile, memserv);
    assert.strictEqual(result, true);
    cleanup();
  });

  test('should handle malformed data gracefully', async () => {
    cleanup();
    fs.mkdirSync(testDir, { recursive: true });
    const memserv = new MockMemServ();

    // Write malformed data
    fs.writeFileSync(testFile, 'invalid data\nmore invalid data');

    const result = await restoreFromFile(testFile, memserv);
    assert.strictEqual(result, true);
    cleanup();
  });

  test('should handle empty file', async () => {
    cleanup();
    fs.mkdirSync(testDir, { recursive: true });
    const memserv = new MockMemServ();
    fs.writeFileSync(testFile, '');

    const result = await restoreFromFile(testFile, memserv);
    assert.strictEqual(result, true);
    cleanup();
  });

    test('should handle file with only whitespace', async () => {
    cleanup();
    fs.mkdirSync(testDir, { recursive: true });
    const memserv = new MockMemServ();
    fs.writeFileSync(testFile, '   \n\t  \r\n');

    const result = await restoreFromFile(testFile, memserv);
    assert.strictEqual(result, true);
    cleanup();
  });

  test('should handle large files', async () => {
    cleanup();
    fs.mkdirSync(testDir, { recursive: true });
    const memserv = new MockMemServ();
    const commands: RespValue[][] = [];

    // Generate many commands
    for (let i = 0; i < 1000; i++) {
      commands.push(['SET', `key${i}`, `value${i}`]);
    }

    const data = commands.map(cmd => serialize(cmd)).join('');
    fs.writeFileSync(testFile, data);

    const result = await restoreFromFile(testFile, memserv);
    assert.strictEqual(result, true);
    cleanup();
  });

  test('should handle commands with special characters', async () => {
    cleanup();
    fs.mkdirSync(testDir, { recursive: true });
    const memserv = new MockMemServ();
    const commands: RespValue[][] = [
      ['SET', 'key\nwith\nnewlines', 'value\r\nwith\r\nreturns'],
      ['SET', 'key\twith\ttabs', 'value\twith\ttabs'],
      ['SET', 'key with spaces', 'value with spaces']
    ];

    const data = commands.map(cmd => serialize(cmd)).join('');
    fs.writeFileSync(testFile, data);

    const result = await restoreFromFile(testFile, memserv);
    assert.strictEqual(result, true);
    cleanup();
  });

    test('should handle mixed command types', async () => {
    cleanup();
    fs.mkdirSync(testDir, { recursive: true });
    const memserv = new MockMemServ();
    const commands: RespValue[][] = [
      ['SET', 'string-key', 'string-value'],
      ['SET', 'number-key', 42],
      ['SET', 'bool-key', true],
      ['SET', 'null-key', null]
    ];

    const data = commands.map(cmd => serialize(cmd)).join('');
    fs.writeFileSync(testFile, data);

    const result = await restoreFromFile(testFile, memserv);
    assert.strictEqual(result, true);
    cleanup();
  });

  test('should handle file read errors', async () => {
    cleanup();
    const memserv = new MockMemServ();

    // Create a directory with the same name as the file to cause read error
    fs.mkdirSync(testFile, { recursive: true });

    const result = await restoreFromFile(testFile, memserv);
    assert.strictEqual(result, false);
    cleanup();
  });

  test('should handle execute errors', async () => {
    cleanup();
    fs.mkdirSync(testDir, { recursive: true });
    // Create a mock that throws on execute
    const errorMemServ = {
      parse: (request: string) => deserialize(request),
      execute: () => {
        throw new Error('Execute error');
      }
    };

    const command: RespValue[] = ['SET', 'key1', 'value1'];
    const data = serialize(command);
    fs.writeFileSync(testFile, data);

    const result = await restoreFromFile(testFile, errorMemServ);
    assert.strictEqual(result, false);
    cleanup();
  });

  test('should handle parse errors', async () => {
    cleanup();
    fs.mkdirSync(testDir, { recursive: true });
    const memserv = new MockMemServ();

    // Write data that can't be parsed
    fs.writeFileSync(testFile, '*invalid\r\n');

    const result = await restoreFromFile(testFile, memserv);
    assert.strictEqual(result, true);
    cleanup();
  });
});

describe('Integration Tests', () => {
  const testDir = path.join(process.cwd(), 'data');
  const testFile = path.join(testDir, 'integration.aof');

  // Helper function to cleanup test directory
  const cleanup = () => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  };

  test('should persist and restore commands correctly', async () => {
    cleanup();
    const memserv = new MockMemServ();
    const persister = new AppendOnlyPersister(testFile);

    // Write some commands
    const commands: RespValue[][] = [
      ['SET', 'user:1', 'John Doe'],
      ['SET', 'user:2', 'Jane Smith'],
      ['DEL', 'user:1'],
      ['SET', 'config:debug', true]
    ];

    commands.forEach(cmd => persister.logCommand(cmd));
    await persister.flush();
    await persister.close();

    // Verify file content
    const content = fs.readFileSync(testFile, 'utf8');
    const expected = commands.map(cmd => serialize(cmd)).join('');
    assert.strictEqual(content, expected);

    // Restore from file
    const result = await restoreFromFile(testFile, memserv);
    assert.strictEqual(result, true);
    cleanup();
  });

    test('should handle append operations correctly', async () => {
    cleanup();
    const memserv = new MockMemServ();

    // First batch of commands
    const persister1 = new AppendOnlyPersister(testFile);
    const commands1: RespValue[][] = [
      ['SET', 'key1', 'value1'],
      ['SET', 'key2', 'value2']
    ];

    commands1.forEach(cmd => persister1.logCommand(cmd));
    await persister1.flush();
    await persister1.close();

    // Second batch of commands (append)
    const persister2 = new AppendOnlyPersister(testFile);
    const commands2: RespValue[][] = [
      ['DEL', 'key1'],
      ['SET', 'key3', 'value3']
    ];

    commands2.forEach(cmd => persister2.logCommand(cmd));
    await persister2.flush();
    await persister2.close();

    // Verify all commands are in file
    const content = fs.readFileSync(testFile, 'utf8');
    const allCommands = [...commands1, ...commands2];
    const expected = allCommands.map(cmd => serialize(cmd)).join('');
    assert.strictEqual(content, expected);

    // Restore from file
    const result = await restoreFromFile(testFile, memserv);
    assert.strictEqual(result, true);
    cleanup();
  });
});
