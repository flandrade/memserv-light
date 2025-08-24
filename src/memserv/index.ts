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

  parse(request: string): AnyCommandStructure | null {
    const parsed = deserialize(request);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const parts = parsed.map(String);

    const [command, ...args] = parts;
    const normalizedCommand = command.toLowerCase();

    switch(normalizedCommand) {
        case 'ping':{
          return {
            command: Command.Ping,
            params: {},
          }
        }
        case 'echo': {
          return {
            command: Command.Echo,
            params: {
              text: args.join(' ') || '',
            }
          }
        }
        case 'set': {
          if (args.length < 2) return null;

          // Check for TTL option (SET key value EX seconds)
          let ttl: number | undefined;
          let value = args.slice(1).join(' ');

          if (args.length >= 4 && args[args.length - 2].toLowerCase() === 'ex') {
            const ttlValue = parseInt(args[args.length - 1], 10);
            if (!Number.isNaN(ttlValue)) {
              ttl = ttlValue;
              value = args.slice(1, -2).join(' ');
            }
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
        case 'clear': {
          return {
            command: Command.Clear,
            params: {},
          }
        }
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

  private echo({ text }: CommandParams[Command.Echo]) {
    return formatResponse('DATA', text);
  }

  private ping({ timeout: _ }: CommandParams[Command.Ping]) {
    return formatResponse('PONG');
  }

  private set({ key, value, ttl}: CommandParams[Command.Set]): string {
    this.db.set(key, value, ttl);
    return formatResponse('OK');
  }

  private get({ key }: CommandParams[Command.Get]): string {
    const value = this.db.get(key);
    if (value === null) return formatResponse('NULL');

    return serialize(value as string);
  }

  private del({ key }: CommandParams[Command.Del]): string {
    const deleted = this.db.delete(key);
    return serialize(deleted ? 1 : 0);
  }

  private exists({ key }: CommandParams[Command.Exists]): string {
    const exists = this.db.exists(key);
    return serialize(exists ? 1 : 0);
  }

  private keys({ pattern }: CommandParams[Command.Keys]): string {
    const keys = this.db.keys(pattern || '*');
    return serialize(keys);
  }

  private clear(_params: CommandParams[Command.Clear]): string {
    this.db.clear();
    return formatResponse('OK');
  }

  private expire({ key, seconds }: CommandParams[Command.Expire]): string {
    const success = this.db.expire(key, seconds);
    return serialize(success ? 1 : 0);
  }

  private ttl({ key }: CommandParams[Command.Ttl]): string {
    const ttl = this.db.ttl(key);
    return serialize(ttl);
  }
}
