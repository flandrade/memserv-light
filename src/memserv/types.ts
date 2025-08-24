export enum Command {
  Echo = "echo",
  Ping = "ping",
  Set = "set",
  Get = "get",
  Del = "del",
  Exists = "exists",
  Keys = "keys",
  Clear = "clear",
  Expire = "expire",
  Ttl = "ttl",
}

export interface CommandParams {
  [Command.Echo]: {
    text: string,
  },
  [Command.Ping]: {
    timeout?: number,
  },
  [Command.Set]: {
    key: string,
    value: string,
    ttl?: number,
  },
  [Command.Get]: {
    key: string,
  },
  [Command.Del]: {
    key: string,
  },
  [Command.Exists]: {
    key: string,
  },
  [Command.Keys]: {
    pattern?: string,
  },
  [Command.Clear]: Record<string, never>,
  [Command.Expire]: {
    key: string,
    seconds: number,
  },
  [Command.Ttl]: {
    key: string,
  }
}

export interface CommandStructure<T extends Command> {
  command: T,
  params: CommandParams[T];
}

export type AnyCommandStructure = {
  [K in Command]: CommandStructure<K>
}[Command];
