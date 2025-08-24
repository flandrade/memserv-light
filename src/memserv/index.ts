import { Command, type AnyCommandStructure, type CommandParams } from "./types";
import { serialize, deserialize, formatResponse } from "../serializer/serializer";
import { Database } from "../store/database";

export class MemServLight {
  private db: Database = new Database();
  private lastInfoUpdate: number = 0;
  private cachedInfoResponse: string = '';

  async execute({ command, params }: AnyCommandStructure): Promise<string> {
    switch(command) {
      case Command.Ping:{
        return this.ping(params);
      }
      case Command.Echo: {
        return this.echo(params);
      }
      case Command.Set: {
        return await this.set(params);
      }
      case Command.Get: {
        return await this.get(params);
      }
      case Command.Del: {
        return await this.del(params);
      }
      case Command.Exists: {
        return await this.exists(params);
      }
      case Command.Keys: {
        return await this.keys(params);
      }
      case Command.Clear: {
        return await this.clear(params);
      }
      case Command.Expire: {
        return await this.expire(params);
      }
      case Command.Ttl: {
        return await this.ttl(params);
      }
      case Command.Info: {
        return await this.info(params);
      }
      default:
        return formatResponse('ERROR', 'Unknown command');
    }
  }

  // Pre-created command objects to avoid object creation overhead
  private static readonly COMMAND_OBJECTS = {
    ping: { command: Command.Ping, params: {} },
    clear: { command: Command.Clear, params: {} }
  } as const;

  parse(request: string): AnyCommandStructure | null {
    const parsed = deserialize(request);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    // Avoid map() allocation for small arrays
    const parts: string[] = Array.from({ length: parsed.length });
    for (let i = 0; i < parsed.length; i++) {
      parts[i] = String(parsed[i]);
    }

    const [command, ...args] = parts;
    const normalizedCommand = command.toLowerCase();

    switch(normalizedCommand) {
        case 'ping':
          return MemServLight.COMMAND_OBJECTS.ping;
        case 'echo': {
          return {
            command: Command.Echo,
            params: {
              text: args.length > 0 ? args.join(' ') : '',
            }
          }
        }
        case 'set': {
          if (args.length < 2) return null;

          // Optimize TTL parsing
          let ttl: number | undefined;
          let value: string;

          // Fast path: check if EX is present
          const exIndex = args.length - 2;
          if (args.length >= 4 && args[exIndex] === 'EX') {
            const ttlValue = parseInt(args[args.length - 1], 10);
            if (!Number.isNaN(ttlValue)) {
              ttl = ttlValue;
              // Build value string without creating intermediate arrays
              if (exIndex === 1) {
                value = '';
              } else {
                value = args[1];
                for (let i = 2; i < exIndex; i++) {
                  value += ' ' + args[i];
                }
              }
            } else {
              value = args.slice(1).join(' ');
            }
          } else {
            value = args.slice(1).join(' ');
          }

          return {
            command: Command.Set,
            params: {
              key: args[0],
              value,
              ttl,
            }
          }
        }
        case 'get': {
          if (args.length < 1) return null;
          return {
            command: Command.Get,
            params: {
              key: args[0],
            }
          }
        }
        case 'del': {
          if (args.length < 1) return null;
          return {
            command: Command.Del,
            params: {
              key: args[0],
            }
          }
        }
        case 'exists': {
          if (args.length < 1) return null;
          return {
            command: Command.Exists,
            params: {
              key: args[0],
            }
          }
        }
        case 'keys': {
          return {
            command: Command.Keys,
            params: {
              pattern: args[0] || '*',
            }
          }
        }
        case 'clear':
          return MemServLight.COMMAND_OBJECTS.clear;
        case 'expire': {
          if (args.length < 2) return null;
          const seconds = parseInt(args[1], 10);
          if (Number.isNaN(seconds)) return null;
          return {
            command: Command.Expire,
            params: {
              key: args[0],
              seconds,
            }
          }
        }
        case 'ttl': {
          if (args.length < 1) return null;
          return {
            command: Command.Ttl,
            params: {
              key: args[0],
            }
          }
        }
        case 'info': {
          return {
            command: Command.Info,
            params: {
              section: args[0],
            }
          }
        }
    }

    return null;
  }

  static encode(response: string): string {
    return serialize(response);
  }

  // Pre-computed response strings for common cases
  private static readonly PONG_RESPONSE = formatResponse('PONG');
  private static readonly OK_RESPONSE = formatResponse('OK');
  private static readonly NULL_RESPONSE = formatResponse('NULL');
  private static readonly ZERO_RESPONSE = serialize(0);
  private static readonly ONE_RESPONSE = serialize(1);

  private echo({ text }: CommandParams[Command.Echo]) {
    return formatResponse('DATA', text);
  }

  private ping({ timeout: _ }: CommandParams[Command.Ping]) {
    return MemServLight.PONG_RESPONSE;
  }

  private async set({ key, value, ttl}: CommandParams[Command.Set]): Promise<string> {
    this.db.set(key, value, ttl);
    return MemServLight.OK_RESPONSE;
  }

  private async get({ key }: CommandParams[Command.Get]): Promise<string> {
    const value = this.db.get(key);
    if (value === null) return MemServLight.NULL_RESPONSE;

    return serialize(value as string);
  }

  private async del({ key }: CommandParams[Command.Del]): Promise<string> {
    const deleted = this.db.delete(key);
    return deleted ? MemServLight.ONE_RESPONSE : MemServLight.ZERO_RESPONSE;
  }

  private async exists({ key }: CommandParams[Command.Exists]): Promise<string> {
    const exists = this.db.exists(key);
    return exists ? MemServLight.ONE_RESPONSE : MemServLight.ZERO_RESPONSE;
  }

  private async keys({ pattern }: CommandParams[Command.Keys]): Promise<string> {
    const keys = this.db.keys(pattern || '*');
    return serialize(keys);
  }

  private async clear(_params: CommandParams[Command.Clear]): Promise<string> {
    this.db.clear();
    return MemServLight.OK_RESPONSE;
  }

  private async expire({ key, seconds }: CommandParams[Command.Expire]): Promise<string> {
    const success = this.db.expire(key, seconds);
    return success ? MemServLight.ONE_RESPONSE : MemServLight.ZERO_RESPONSE;
  }

  private async ttl({ key }: CommandParams[Command.Ttl]): Promise<string> {
    const ttl = this.db.ttl(key);
    return serialize(ttl);
  }

    // Pre-computed static parts of INFO response
  private static readonly INFO_STATIC =
    '# Server\r\n' +
    'redis_version:memserv-light-1.0.0\r\n' +
    'redis_mode:standalone\r\n' +
    'tcp_port:6379\r\n';

  private static readonly INFO_MEMORY_PREFIX =
    '\r\n# Memory\r\n' +
    'used_memory:';

  private static readonly INFO_MEMORY_HUMAN_PREFIX =
    '\r\nused_memory_human:';

  private static readonly INFO_STATS =
    '\r\n\r\n# Stats\r\n' +
    'total_connections_received:0\r\n' +
    'total_commands_processed:0\r\n' +
    '\r\n# Keyspace\r\n' +
    'db0:keys=';

  private static readonly INFO_KEYSPACE_SUFFIX = ',expires=0,avg_ttl=0';

  private async info({ section: _ }: CommandParams[Command.Info]): Promise<string> {
    const now = Date.now();

    // Cache INFO response for 500ms to avoid expensive calculations
    if (now - this.lastInfoUpdate > 500) {
      const uptime = Math.floor(process.uptime());
      const memUsed = Math.round(process.memoryUsage().heapUsed);
      const memHuman = Math.round(memUsed / 1048576); // /1024/1024 optimized
      const keyCount = this.db.size();

      const infoString =
        MemServLight.INFO_STATIC +
        'uptime_in_seconds:' + uptime +
        MemServLight.INFO_MEMORY_PREFIX + memUsed +
        MemServLight.INFO_MEMORY_HUMAN_PREFIX + memHuman + 'M' +
        MemServLight.INFO_STATS + keyCount +
        MemServLight.INFO_KEYSPACE_SUFFIX;

      this.cachedInfoResponse = serialize(infoString);
      this.lastInfoUpdate = now;
    }

    return this.cachedInfoResponse;
  }
}
