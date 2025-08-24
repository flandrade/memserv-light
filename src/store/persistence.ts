/*
  Simple Append-Only File (AOF) persistence for MemServLight

  Reference: https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/
*/

import * as fs from 'fs';
import * as path from 'path';
import { createReadStream, createWriteStream } from 'node:fs';
import { serialize, deserialize, type RespValue } from '../serializer/serializer';

interface MemServInterface {
  parse(request: string): unknown;
  execute(command: unknown): Promise<string> | string;
}

export interface PersistenceOptions {
  batchSize?: number;      // Number of commands to batch (default: 50)
  flushInterval?: number;  // Max wait time in ms (default: 5)
}

export class AppendOnlyPersister {
  private ws: fs.WriteStream;
  private closed = false;

  constructor(private filename: string, options: PersistenceOptions = {}) {
    const dir = path.dirname(filename);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.ws = createWriteStream(filename, {
      flags: 'a',
      highWaterMark: 0
    });

    this.ws.on('error', (e) => console.error('[AOF] write error:', e));
  }

  logCommand(command: RespValue[]): void {
    if (this.closed || !Array.isArray(command) || command.length === 0) {
      return;
    }

    try {
      const data = serialize(command);
      this.ws.write(data);
    } catch (error) {
      // Ignore write errors during shutdown
      if (!this.closed) {
        console.error('[AOF] write error:', error);
      }
    }
  }

  async flush(): Promise<void> {
    if (this.closed) {
      return;
    }

    return new Promise((resolve) => {
      this.ws.end('', () => resolve());
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.flush();
  }
}


export async function restoreFromFile(filename: string, memserv: MemServInterface): Promise<boolean> {
  if (!fs.existsSync(filename)) {
    return true;
  }

  let buffer = Buffer.alloc(0);

  try {
    const readStream = createReadStream(filename);

    for await (const chunk of readStream) {
      buffer = Buffer.concat([buffer, chunk as Buffer]);

      while (true) {
        const data = buffer.toString('utf8');

        // Try to find a complete command by looking for array start
        const arrayStart = data.indexOf('*');
        if (arrayStart === -1) {
          break; // No array start found
        }

        try {
          // Try to parse from the array start
          const commandData = data.substring(arrayStart);
          const command = memserv.parse(commandData);

          if (!command) {
            break; // No complete command found
          }

          // Find the end of the command by re-serializing it
          const commandStr = serialize(deserialize(commandData) as RespValue[]);
          const commandEnd = arrayStart + commandStr.length;

          // Remove processed command from buffer
          buffer = buffer.subarray(commandEnd);

          try {
            const result = await Promise.resolve(memserv.execute(command));
            if (result && result.startsWith('-ERROR')) {
              console.error('Error: corrupt AOF file');
              return false;
            }
          } catch (error) {
            console.error('Error processing command during AOF restore:', error);
            return false;
          }
        } catch (parseError) {
          // Incomplete command - wait for more data
          break;
        }
      }
    }

    return true;
  } catch (error) {
    console.error('[AOF restore] error:', error);
    return false;
  }
}