/*
  Simple Append-Only File (AOF) persistence for MemServLight
  Reference: https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/
*/

import * as fs from 'fs';
import * as path from 'path';
import { createReadStream, createWriteStream } from 'node:fs';
import { serialize, deserialize, type RespValue } from '../serializer/serializer';
import { AOFError } from '../utils/error';

interface MemServInterface {
  parse(request: string): unknown;
  execute(command: unknown): Promise<string> | string;
  setRestorationMode(enabled: boolean): void;
}

export interface PersistenceOptions {
  batchSize?: number;      // Number of commands to batch (default: 50)
  flushInterval?: number;  // Max wait time in ms (default: 5)
}

/**
 * AppendOnlyPersister class for MemServLight server.
 *
 * This class provides a simple append-only file persistence for the server.
 * It uses a WriteStream to write the commands to a file.
 *
 */
export class AppendOnlyPersister {
  private ws: fs.WriteStream;
  private closed = false;
  private writeErrors: Error[] = [];

  constructor(private filename: string, options: PersistenceOptions = {}) {
    const dir = path.dirname(filename);
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (error) {
        throw new AOFError(`Failed to create directory for AOF file: ${error}`);
      }
    }

    try {
      this.ws = createWriteStream(filename, {
        flags: 'a',
        highWaterMark: 0
      });

      this.ws.on('error', (error) => {
        const aofError = new AOFError(`Write stream error: ${error.message}`);
        this.writeErrors.push(aofError);
        console.error('[AOF] write error:', aofError.message);
      });
    } catch (error) {
      throw new AOFError(`Failed to create write stream for AOF file: ${error}`);
    }
  }

  /**
   * Logs a command to the append-only file. This is called by the server when a command is executed.
   *
   * @param command - The command to log.
   * @throws {AOFError} If write fails and not during shutdown
   */
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
        const aofError = new AOFError(`Failed to serialize or write command: ${error}`);
        this.writeErrors.push(aofError);
        console.error('[AOF] write error:', aofError.message);
        throw aofError;
      }
    }
  }

  /**
   * Gets any write errors that occurred during operation
   *
   * @returns Array of AOFError instances
   */
  getWriteErrors(): AOFError[] {
    return [...this.writeErrors];
  }

  /**
   * Clears the write error history
   */
  clearWriteErrors(): void {
    this.writeErrors = [];
  }

  /**
   * Flushes the append-only file. This is called by the server when the server is shutting down.
   *
   * @returns A promise that resolves when the file is flushed.
   * @throws {AOFError} If flush fails
   */
  async flush(): Promise<void> {
    if (this.closed) {
      return;
    }
    return new Promise((resolve, reject) => {
      this.ws.end('', () => {
        this.ws.once('finish', () => {
          resolve();
        });
        this.ws.once('error', (error: Error) => {
          const aofError = new AOFError(`Failed to flush AOF file: ${error.message}`);
          console.error('[AOF] flush error:', aofError.message);
          reject(aofError);
        });
      });
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    try {
      await this.flush();
    } catch (error) {
      console.error('[AOF] Error during close:', error);
      // Don't re-throw during shutdown
    }
  }
}

/**
 * Restores the database from an append-only file. This is called by the server when the server is starting up.
 * It uses a ReadStream to read the commands from the file and avoid loading the entire file into memory.
 *
 * @param filename - The filename to restore from.
 * @param memserv - The MemServInterface instance to use.
 * @returns A promise that resolves to true if the restore was successful, false otherwise.
 * @throws {AOFError} If file is corrupted or cannot be read
 */
export async function restoreFromFile(filename: string, memserv: MemServInterface): Promise<boolean> {
  if (!fs.existsSync(filename)) {
    return true;
  }

  // Enable restoration mode to prevent logging during restore
  memserv.setRestorationMode(true);

  let buffer = '';
  const maxBufferSize = 10 * 1024 * 1024; // 10MB max buffer size

  try {
    const readStream = createReadStream(filename, {
      encoding: 'utf8',
    });

    for await (const chunk of readStream) {
      buffer += chunk;

      // Limit buffer size to prevent memory overflow
      if (buffer.length > maxBufferSize) {
        console.warn(`[AOF restore] Buffer size limit reached (${maxBufferSize / 1024}KB). Skipping to next command boundary.`);
        const lastArrayStart = buffer.lastIndexOf('*');
        if (lastArrayStart > 0) {
          buffer = buffer.substring(lastArrayStart);
        } else {
          buffer = buffer.substring(buffer.length - 1024); // Keep last 1KB
        }
      }

      // Process complete commands from buffer
      while (true) {
        // Find the start of a RESP array
        const arrayStart = buffer.indexOf('*');
        if (arrayStart === -1) {
          // No array start found, keep accumulating
          break;
        }

        // Try to parse a complete command from the array start
        const commandData = buffer.substring(arrayStart);

        try {
          // Try to parse the command
          const command = memserv.parse(commandData);

          if (command) {
            // Command was parsed successfully, execute it
            try {
              const result = await Promise.resolve(memserv.execute(command));
              if (result && result.startsWith('-ERROR')) {
                console.error(`[AOF restore] Command execution failed: ${commandData.substring(0, 100)}...`);
                return false;
              }
            } catch (executeError) {
              console.error(`[AOF restore] Command execution error: ${executeError instanceof Error ? executeError.message : String(executeError)}`);
              return false;
            }

            // Find the end of the command by re-serializing it
            const parsed = deserialize(commandData);
            if (Array.isArray(parsed)) {
              const commandStr = serialize(parsed);
              const commandEnd = arrayStart + commandStr.length;

              // Remove the processed command from buffer
              buffer = buffer.substring(commandEnd);
            } else {
              // Fallback: remove the array start and continue
              buffer = buffer.substring(arrayStart + 1);
            }
          } else {
            // Incomplete command, wait for more data
            break;
          }
        } catch (parseError) {
          // Try to find the next array start
          const nextArrayStart = buffer.indexOf('*', arrayStart + 1);
          if (nextArrayStart !== -1) {
            // Skip this corrupted command and try the next one
            buffer = buffer.substring(nextArrayStart);
            console.warn(`[AOF restore] Skipped corrupted command at position ${commandData}`);
          } else {
            // No more array starts, wait for more data
            break;
          }
        }
      }
    }

    return true;
  } catch (error) {
    if (error instanceof AOFError) {
      console.error('[AOF restore] AOF error:', error.message);
      throw error;
    }

    console.error('[AOF restore] Unexpected error:', error);
    // Return false for file read errors instead of throwing
    return false;
  } finally {
    // Always disable restoration mode when done
    memserv.setRestorationMode(false);
  }
}