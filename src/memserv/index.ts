import { Command, type AnyCommandStructure } from "./types";
import { serialize, deserialize, formatError, COMMON_RESP_VALUES, type RespValue } from "../serializer/serializer";
import { Database } from "../store/database";
import { AppendOnlyPersister, restoreFromFile } from "../store/persistence";
import type { PersistenceOptions } from "../store/persistence";

/**
 * MemServLight class for MemServLight server.
 *
 * This class provides a simple in-memory database for the server.
 * It uses a Database class to store the data and a AppendOnlyPersister class to persist the data.
 *
 */
export class MemServLight {
  private db = new Database();
  private lastInfoUpdate = 0;
  private cachedInfoResponse = '';
  private persister?: AppendOnlyPersister;
  private isRestoring = false;

  /**
   * Enables persistence for the server.
   *
   * @param filename - The filename to persist the data to.
   * @param options - The options for the persistence.
   * @returns True if persistence is enabled, false otherwise.
   */
  enablePersistence(filename: string, options?: PersistenceOptions): boolean {
    try {
      this.persister = new AppendOnlyPersister(filename, options);
      return true;
    } catch (error) {
      console.error('Failed to enable persistence:', error);
      return false;
    }
  }

  /**
   * Restores the data from the persistence file.
   *
   * @param filename - The filename to restore the data from.
   * @returns True if the data is restored, false otherwise.
   */
  async restoreFromPersistence(filename: string): Promise<boolean> {
    return await restoreFromFile(filename, this);
  }

  /**
   * Flushes the persistence file.
   *
   * @returns A promise that resolves when the persistence file is flushed.
   */
  async flushPersistence(): Promise<void> {
    if (this.persister) {
      await this.persister.flush();
    }
  }

  /**
   * Logs a command to the persistence file.
   *
   * @param command - The command to log.
   * @param skipDuringRestore - If true, skip logging during restoration to prevent duplicate entries
   */
  private logCommand(command: RespValue[], skipDuringRestore = false): void {
    if (this.persister && !skipDuringRestore) {
      this.persister.logCommand(command);
    }
  }

  /**
   * Sets the restoration mode flag to prevent logging during AOF restoration
   */
  setRestorationMode(enabled: boolean): void {
    this.isRestoring = enabled;
  }

  /**
   * Executes a parsed command and returns the RESP-formatted response.
   *
   * This method handles the supported Redis-compatible commands including:
   * - **Basic Operations**: SET, GET, DEL, EXISTS
   * - **Key Management**: KEYS, CLEAR, EXPIRE, TTL
   * - **Server Commands**: PING, ECHO, INFO
   *
   * Each command is executed against the in-memory database and optionally
   * logged to the AOF persistence file for durability. The method ensures
   * atomic operations and proper error handling.
   *
   * @param command - The command structure containing the command type and parameters
   * @returns Promise resolving to RESP-formatted string response
   *
   * @example
   * // Execute a SET command
   * const result = await memServ.execute({
   *   command: Command.Set,
   *   params: { key: 'user:1', value: 'John Doe', ttl: 3600 }
   * });
   * // Returns: "+OK\r\n"
   *
   * @example
   * // Execute a GET command
   * const result = await memServ.execute({
   *   command: Command.Get,
   *   params: { key: 'user:1' }
   * });
   * // Returns: "$8\r\nJohn Doe\r\n" or "$-1\r\n" if key doesn't exist
   */
  async execute({ command, params }: AnyCommandStructure): Promise<string> {
    switch (command) {
      case Command.Ping:
        return COMMON_RESP_VALUES.PONG;
      case Command.Echo:
        return serialize(params.text);
      case Command.Set: {
        this.db.set(params.key, params.value, params.ttl);

        // Log command for persistence
        const logCommand = ['SET', params.key, params.value];
        if (params.ttl) {
          logCommand.push('EX', params.ttl.toString());
        }
        this.logCommand(logCommand, this.isRestoring);

        return COMMON_RESP_VALUES.OK;
      }
      case Command.Get: {
        const value = this.db.get(params.key) as string | null;
        return value ? serialize(value) : COMMON_RESP_VALUES.NULL;
      }
      case Command.Del: {
        const deleted = this.db.delete(params.key);

        // Log command for persistence (only if key was actually deleted)
        if (deleted) {
          this.logCommand(['DEL', params.key], this.isRestoring);
        }

        return deleted ? COMMON_RESP_VALUES.ONE : COMMON_RESP_VALUES.ZERO;
      }
      case Command.Exists: {
        const exists = this.db.exists(params.key);
        return exists ? COMMON_RESP_VALUES.ONE : COMMON_RESP_VALUES.ZERO;
      }
      case Command.Keys: {
        const keys = this.db.keys(params.pattern || '*');
        return serialize(keys);
      }
      case Command.Clear: {
        this.db.clear();

        // Log command for persistence
        this.logCommand(['CLEAR'], this.isRestoring);

        return COMMON_RESP_VALUES.OK;
      }
      case Command.Expire: {
        const expired = this.db.expire(params.key, params.seconds);

        // Log command for persistence (only if expiry was actually set)
        if (expired) {
          this.logCommand(['EXPIRE', params.key, params.seconds.toString()], this.isRestoring);
        }

        return expired ? COMMON_RESP_VALUES.ONE : COMMON_RESP_VALUES.ZERO;
      }
      case Command.Ttl: {
        const ttl = this.db.ttl(params.key);
        return serialize(ttl);
      }
      case Command.Info:
        return this.info();
      default:
        return formatError('Unknown command');
    }
  }

  /**
   * Parses a RESP-formatted request string into a structured command object.
   *
   * This method deserializes RESP protocol messages and converts them into
   * strongly-typed command structures that can be safely executed. It handles
   * various command formats and validates parameter requirements.
   *
   * **Supported Commands:**
   * - `PING` - No parameters
   * - `ECHO <text>` - Single text parameter
   * - `SET <key> <value> [EX <seconds>]` - Key, value, optional TTL
   * - `GET <key>` - Single key parameter
   * - `DEL <key>` - Single key parameter
   * - `EXISTS <key>` - Single key parameter
   * - `KEYS [pattern]` - Optional pattern (defaults to '*')
   * - `TTL <key>` - Single key parameter
   * - `EXPIRE <key> <seconds>` - Key and TTL seconds
   * - `CLEAR` - No parameters
   * - `INFO [section]` - Optional section parameter
   *
   * **Parameter Validation:**
   * - Commands requiring parameters return null if insufficient arguments
   * - TTL values are validated as positive integers
   * - Pattern matching supports wildcards (* and ?)
   *
   * @param request - RESP-formatted string (e.g., "*3\r\n$3\r\nSET\r\n$6\r\nuser:1\r\n$8\r\nJohn Doe\r\n")
   * @returns Structured command object or null if parsing fails
   *
   * @example
   * // Parse a SET command
   * const cmd = memServ.parse("*3\r\n$3\r\nSET\r\n$6\r\nuser:1\r\n$8\r\nJohn Doe\r\n");
   * // Returns: { command: Command.Set, params: { key: 'user:1', value: 'John Doe' } }
   *
   * @example
   * // Parse a SET command with TTL
   * const cmd = memServ.parse("*5\r\n$3\r\nSET\r\n$6\r\nuser:1\r\n$8\r\nJohn Doe\r\n$2\r\nEX\r\n$4\r\n3600\r\n");
   * // Returns: { command: Command.Set, params: { key: 'user:1', value: 'John Doe', ttl: 3600 } }
   *
   * @example
   * // Parse an invalid command
   * const cmd = memServ.parse("*1\r\n$3\r\nINVALID\r\n");
   * // Returns: null
   *
   * @see {@link execute} For executing the parsed command
   * @see {@link deserialize} For RESP protocol deserialization
   */
  parse(request: string): AnyCommandStructure | null {
    const parsed = deserialize(request);
    if (!Array.isArray(parsed) || !parsed.length) return null;

    const cmd = String(parsed[0]).toLowerCase();

    // Commands that don't need arguments
    switch (cmd) {
      case 'ping': return { command: Command.Ping, params: {} };
      case 'clear': return { command: Command.Clear, params: {} };
      case 'info': return { command: Command.Info, params: { section: parsed[1] ? String(parsed[1]) : undefined } };
      case 'keys': return { command: Command.Keys, params: { pattern: parsed[1] ? String(parsed[1]) : '*' } };
      case 'echo': {
        const args: string[] = [];
        for (let i = 1; i < parsed.length; i++) {
          args.push(String(parsed[i]));
        }
        return { command: Command.Echo, params: { text: args.join(' ') } };
      }
    }

    // Commands that need at least one argument
    if (parsed.length < 2) return null;
    const arg0 = String(parsed[1]);

    switch (cmd) {
      case 'get': return { command: Command.Get, params: { key: arg0 } };
      case 'del': return { command: Command.Del, params: { key: arg0 } };
      case 'exists': return { command: Command.Exists, params: { key: arg0 } };
      case 'ttl': return { command: Command.Ttl, params: { key: arg0 } };
      case 'set': {
        if (parsed.length < 3) return null;

        const key = arg0;
        let ttl: number | undefined;
        let valueEndIndex = parsed.length;

        // Check for TTL - check last elements first
        if (parsed.length >= 4 && String(parsed[parsed.length - 2]) === 'EX') {
          const t = parseInt(String(parsed[parsed.length - 1]), 10);
          if (!Number.isNaN(t)) {
            ttl = t;
            valueEndIndex = parsed.length - 2;
          }
        }

        // Build value string only once
        const valueParts: string[] = [];
        for (let i = 2; i < valueEndIndex; i++) {
          valueParts.push(String(parsed[i]));
        }
        const value = valueParts.join(' ');

        return { command: Command.Set, params: { key, value, ttl } };
      }
      case 'expire': {
        if (parsed.length < 3) return null;
        const seconds = parseInt(String(parsed[2]), 10);
        return Number.isNaN(seconds) ? null : { command: Command.Expire, params: { key: arg0, seconds } };
      }
    }

    return null;
  }

  /**
   * Returns the info about the server.
   *
   * @returns The info about the server.
   */
  private info(): string {
    const now = Date.now();
    if (now - this.lastInfoUpdate > 1000) { // Update every 1s
      const uptime = Math.floor(process.uptime());
      const memMB = Math.round(process.memoryUsage().heapUsed / 1048576);

      const infoString = `memserv-light v1.0.0\r\nuptime: ${uptime}s\r\nmemory: ${memMB}MB`;

      this.cachedInfoResponse = serialize(infoString);
      this.lastInfoUpdate = now;
    }
    return this.cachedInfoResponse;
  }
}



