#!/usr/bin/env node

import * as net from 'net';
import * as readline from 'readline';
import { program } from 'commander';
import { deserialize } from './serializer/serializer';

const handleErrorResponse = (response: string): string => {
  if (response.startsWith('-')) {
    return `(error) ${response.substring(1).replace(/\r\n$/, '')}`;
  }
  return response.trim();
};

const connect = (host: string, port: number): Promise<net.Socket> =>
  new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.connect(port, host, () => {
      console.log(`Connected to memserv server at ${host}:${port}`);
      resolve(socket);
    });
    socket.on('error', reject);
    socket.on('close', () => console.log('Connection closed'));
  });

const sendCommand = (socket: net.Socket, command: string): Promise<string> =>
  new Promise((resolve) => {
    socket.once('data', (data) => resolve(data.toString()));
    socket.write(command + '\n');
  });

const executeCommand = async (socket: net.Socket, command: string): Promise<void> => {
  try {
    const response = await sendCommand(socket, command);
    try {
      const value = deserialize(response);
      console.log(value);
    } catch {
      // If deserialization fails, handle as error response
      console.log(handleErrorResponse(response));
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
  }
};

const startInteractive = (socket: net.Socket, host: string, port: number): void => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${host}:${port}> `
  });

  console.log('MemServLight CLI - Type "quit" to exit');
  rl.prompt();

  rl.on('line', async (line) => {
    const command = line.trim();

    if (!command) {
      rl.prompt();
      return;
    }

    // Handle CLI commands
    switch (command) {
      case 'quit':
        rl.close();
        return;
      default:
        await executeCommand(socket, command);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log('\nBye!');
    socket.end();
    process.exit(0);
  });
};

const main = async (): Promise<void> => {
  program
    .name('memserv-cli')
    .description('CLI client for memserv-light server')
    .version('1.0.0')
    .option('-h, --host <host>', 'Server host', 'localhost')
    .option('-p, --port <port>', 'Server port', '6379')
    .option('-c, --command <command>', 'Execute command and exit')
    .parse();

  const options = program.opts();
  const host = options.host;
  const port = parseInt(options.port);

  try {
    const socket = await connect(host, port);

    if (options.command) {
      await executeCommand(socket, options.command);
      socket.end();
    } else {
      startInteractive(socket, host, port);
    }
  } catch (error) {
    console.error('Failed to connect:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
};

  main().catch((error) => {
    console.error('CLI error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  });