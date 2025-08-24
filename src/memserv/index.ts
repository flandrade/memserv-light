import { Command, type AnyCommandStructure, type CommandParams } from "./types";
import { serialize, deserialize, formatResponse } from "../serializer/serializer";
import { Database } from "../store/database";

export class MemServLight {
  private db: Database = new Database();

  execute({ command, params }: AnyCommandStructure): string {
    switch(command) {
      case Command.Ping:{
        return this.ping(params);
      }
      case Command.Echo: {
        return this.echo(params);
      }
      case Command.Set: {
        return this.set(params);
      }
      case Command.Get: {
        return this.get(params);
      }
      case Command.Del: {
        return this.del(params);
      }
      case Command.Exists: {
        return this.exists(params);
      }
      case Command.Keys: {
        return this.keys(params);
      }
      case Command.Clear: {
        return this.clear(params);
      }
      case Command.Expire: {
        return this.expire(params);
      }
      case Command.Ttl: {
        return this.ttl(params);
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
    const parts = new Array(parsed.length);
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

  private set({ key, value, ttl}: CommandParams[Command.Set]): string {
    this.db.set(key, value, ttl);
    return MemServLight.OK_RESPONSE;
  }

  private get({ key }: CommandParams[Command.Get]): string {
    const value = this.db.get(key);
    if (value === null) return MemServLight.NULL_RESPONSE;

    return serialize(value as string);
  }

  private del({ key }: CommandParams[Command.Del]): string {
    const deleted = this.db.delete(key);
    return deleted ? MemServLight.ONE_RESPONSE : MemServLight.ZERO_RESPONSE;
  }

  private exists({ key }: CommandParams[Command.Exists]): string {
    const exists = this.db.exists(key);
    return exists ? MemServLight.ONE_RESPONSE : MemServLight.ZERO_RESPONSE;
  }

  private keys({ pattern }: CommandParams[Command.Keys]): string {
    const keys = this.db.keys(pattern || '*');
    return serialize(keys);
  }

  private clear(_params: CommandParams[Command.Clear]): string {
    this.db.clear();
    return MemServLight.OK_RESPONSE;
  }

  private expire({ key, seconds }: CommandParams[Command.Expire]): string {
    const success = this.db.expire(key, seconds);
    return success ? MemServLight.ONE_RESPONSE : MemServLight.ZERO_RESPONSE;
  }

  private ttl({ key }: CommandParams[Command.Ttl]): string {
    const ttl = this.db.ttl(key);
    return serialize(ttl);
  }
}
