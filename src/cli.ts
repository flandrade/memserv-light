#!/usr/bin/env node

import * as readline from 'readline';
import { program } from 'commander';
import { MemServLight } from './memserv';
import { deserialize } from './serializer/serializer';

let memServLight: MemServLight;

/**
 * Executes a command and prints the response.
 *
 * @param command - The command to execute.
 * @returns A promise that resolves when the command is executed.
 */
const executeCommand = async (command: string): Promise<void> => {
  try {
    // Convert command string to RESP format for parsing
    const parts = command.split(' ');
    const respCommand = parts.map(part => {
      // Remove quotes if present
      if ((part.startsWith('"') && part.endsWith('"')) ||
          (part.startsWith("'") && part.endsWith("'"))) {
        return part.slice(1, -1);
      }
      return part;
    });

    // Create RESP array format
    const respArray = `*${respCommand.length}\r\n${respCommand.map(part => `$${part.length}\r\n${part}\r\n`).join('')}`;

    const parsedCommand = memServLight.parse(respArray);

    if (!parsedCommand) {
      console.log('(error) Invalid command');
      return;
    }

    const response = await memServLight.execute(parsedCommand);

    try {
      const value = deserialize(response);
      console.log(value);
    } catch {
      // If deserialization fails, show raw response
      console.log(response.trim());
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
  }
};

/**
 * Starts the interactive CLI.
 *
 * @returns A promise that resolves when the CLI is started.
 */
const startInteractive = (): void => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'memserv> '
  });

  console.log('MemServLight CLI - Type "quit" to exit');
  rl.prompt();

  rl.on('line', (line) => {
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
        executeCommand(command).catch(error => {
          console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
        });
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log('\nBye!');
    process.exit(0);
  });
};

/**
 * Main function for the CLI.
 *
 * @returns A promise that resolves when the CLI is started.
 */
const main = (): void => {
  memServLight = new MemServLight();

  program
    .name('memserv-cli')
    .description('Local CLI for memserv-light')
    .version('1.0.0')
    .option('-c, --command <command>', 'Execute command and exit')
    .parse();

  const options = program.opts();

  if (options.command) {
    executeCommand(options.command);
  } else {
    startInteractive();
  }
};

try {
  main();
} catch (error) {
  console.error('CLI error:', error instanceof Error ? error.message : 'Unknown error');
  process.exit(1);
}
