#!/usr/bin/env node

import * as readline from 'readline';
import { program } from 'commander';
import { MemServLight } from './memserv';
import { deserialize } from './serializer/serializer';

// Create a local MemServLight instance for the CLI
const memServLight = new MemServLight();


const executeCommand = async (command: string): Promise<void> => {
  try {
    const parsedCommand = memServLight.parse(command);

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

const main = (): void => {
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
