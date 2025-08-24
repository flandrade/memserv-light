import { Command, type AnyCommandStructure } from "./types";
import { serialize, deserialize, formatError, COMMON_RESP_VALUES } from "../serializer/serializer";
import { Database } from "../store/database";

export class MemServLight {
  private db = new Database();
  private lastInfoUpdate = 0;
  private cachedInfoResponse = '';

  async execute({ command, params }: AnyCommandStructure): Promise<string> {
    switch (command) {
      case Command.Ping:
        return COMMON_RESP_VALUES.PONG;
      case Command.Echo:
        return serialize(params.text);
      case Command.Set:
        this.db.set(params.key, params.value, params.ttl);
        return COMMON_RESP_VALUES.OK;
      case Command.Get: {
        const value = this.db.get(params.key) as string | null;
        return value ? serialize(value) : COMMON_RESP_VALUES.NULL;
      }
      case Command.Del: {
        const deleted = this.db.delete(params.key);
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
        return COMMON_RESP_VALUES.OK;
      }
      case Command.Expire: {
        const expired = this.db.expire(params.key, params.seconds);
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

    const [cmd, ...args] = parsed.map(String);
    const command = cmd.toLowerCase();

    switch (command) {
      case Command.Ping: return { command: Command.Ping, params: {} };
      case Command.Echo: return { command: Command.Echo, params: { text: args.join(' ') } };
      case Command.Clear: return { command: Command.Clear, params: {} };
      case Command.Info: return { command: Command.Info, params: { section: args[0] } };
      case Command.Keys: return { command: Command.Keys, params: { pattern: args[0] || '*' } };
    }

    if (!args.length) return null;

    switch (command) {
      case Command.Get: return { command: Command.Get, params: { key: args[0] } };
      case Command.Del: return { command: Command.Del, params: { key: args[0] } };
      case Command.Exists: return { command: Command.Exists, params: { key: args[0] } };
      case Command.Ttl: return { command: Command.Ttl, params: { key: args[0] } };
      case Command.Set: {
        const key = args[0];
        let value = args.slice(1).join(' ');
        let ttl: number | undefined;

        // Parse TTL
        if (args.length >= 4 && args[args.length - 2] === 'EX') {
          const t = parseInt(args[args.length - 1], 10);
          if (!Number.isNaN(t)) {
            ttl = t;
            value = args.slice(1, -2).join(' ');
          }
        }
        return { command: Command.Set, params: { key, value, ttl } };
      }
      case Command.Expire: {
        const seconds = parseInt(args[1], 10);
        return Number.isNaN(seconds) ? null : { command: Command.Expire, params: { key: args[0], seconds } };
      }
    }

    return null;
  }

  private info(): string {
    const now = Date.now();
    if (now - this.lastInfoUpdate > 500) {
      const uptime = Math.floor(process.uptime());
      const memUsed = Math.round(process.memoryUsage().heapUsed);
      const memHuman = Math.round(memUsed / 1048576);
      const keyCount = this.db.size();

      const infoString = `# Server\r\nredis_version:memserv-light-1.0.0\r\nredis_mode:standalone\r\ntcp_port:6379\r\nuptime_in_seconds:${uptime}\r\n\r\n# Memory\r\nused_memory:${memUsed}\r\nused_memory_human:${memHuman}M\r\n\r\n# Stats\r\ntotal_connections_received:0\r\ntotal_commands_processed:0\r\n\r\n# Keyspace\r\ndb0:keys=${keyCount},expires=0,avg_ttl=0`;

      this.cachedInfoResponse = serialize(infoString);
      this.lastInfoUpdate = now;
    }
    return this.cachedInfoResponse;
  }
}


