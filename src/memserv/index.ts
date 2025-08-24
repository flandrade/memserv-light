import { Command, type AnyCommandStructure } from "./types";
import { serialize, deserialize, formatError, COMMON_RESP_VALUES, type RespValue } from "../serializer/serializer";
import { Database } from "../store/database";
import { AppendOnlyPersister, restoreFromFile } from "../store/persistence";
import type { PersistenceOptions } from "../store/persistence";

export class MemServLight {
  private db = new Database();
  private lastInfoUpdate = 0;
  private cachedInfoResponse = '';
  private persister?: AppendOnlyPersister;

  enablePersistence(filename: string, options?: PersistenceOptions): boolean {
    try {
      this.persister = new AppendOnlyPersister(filename, options);
      return true;
    } catch (error) {
      console.error('Failed to enable persistence:', error);
      return false;
    }
  }

  async restoreFromPersistence(filename: string): Promise<boolean> {
    return await restoreFromFile(filename, this);
  }

  async flushPersistence(): Promise<void> {
    if (this.persister) {
      await this.persister.flush();
    }
  }

  private logCommand(command: RespValue[]): void {
    if (this.persister) {
      this.persister.logCommand(command);
    }
  }

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
        this.logCommand(logCommand);

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
          this.logCommand(['DEL', params.key]);
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
        this.logCommand(['CLEAR']);

        return COMMON_RESP_VALUES.OK;
      }
      case Command.Expire: {
        const expired = this.db.expire(params.key, params.seconds);

        // Log command for persistence (only if expiry was actually set)
        if (expired) {
          this.logCommand(['EXPIRE', params.key, params.seconds.toString()]);
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

  private info(): string {
    const now = Date.now();
    if (now - this.lastInfoUpdate > 1000) { // Update every 1s instead of 500ms
      const uptime = Math.floor(process.uptime());
      const memMB = Math.round(process.memoryUsage().heapUsed / 1048576);

      const infoString = `memserv-light v1.0.0\r\nuptime: ${uptime}s\r\nmemory: ${memMB}MB`;

      this.cachedInfoResponse = serialize(infoString);
      this.lastInfoUpdate = now;
    }
    return this.cachedInfoResponse;
  }
}



