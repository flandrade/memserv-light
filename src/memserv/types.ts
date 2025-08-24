export enum Command {
  Echo = "echo",
  Ping = "ping",
  Set = "set",
  Get = "get",
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
  },
  [Command.Get]: {
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
