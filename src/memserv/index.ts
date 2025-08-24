import { Command, type AnyCommandStructure, type CommandParams } from "./types";
import { serialize, deserialize, formatResponse } from "../serializer/serializer";

export class MemServLight {
  private storage: Record<string, string> = {};

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
          return {
            command: Command.Set,
            params: {
              key: args[0],
              value: args.slice(1).join(' '),
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

  private set({ key, value}: CommandParams[Command.Set]): string {
    this.storage[key] = value;
    return formatResponse('OK');
  }

  private get({ key }: CommandParams[Command.Get]): string {
    if (!(key in this.storage)) return formatResponse('NULL');

    return serialize(this.storage[key]);
  }
}
