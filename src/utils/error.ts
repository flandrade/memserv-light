export class RespSerializeError extends Error {
  constructor(message: string, value?: unknown) {
    super(`${message}${value !== undefined ? `: ${JSON.stringify(value)}` : ''}`);
    this.name = 'RespSerializeError';
  }
}

export class AsyncLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AsyncLockError';
  }
}

export class AOFError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AOFError';
  }
}

/**
 * Handles persistence errors and provides specific guidance based on the error type.
 *
 * @param error - The error to handle.
 */
export function handlePersistenceError(error: unknown): void {
  console.error('❌ Persistence initialization failed:');

  if (error instanceof AOFError) {
    console.error(`   AOF Error: ${error.message}`);

    // Provide specific guidance based on error type
    if (error.message.includes('directory')) {
      console.error('   💡 Check file permissions and ensure the data directory is writable');
    } else if (error.message.includes('corrupted')) {
      console.error('   💡 AOF file may be corrupted - consider removing it to start fresh');
    } else if (error.message.includes('write stream')) {
      console.error('   💡 Check disk space and file permissions');
    }
  } else if (error instanceof Error) {
    console.error(`   Error: ${error.message}`);
    console.error(`   Stack: ${error.stack}`);
  } else {
    console.error(`   Unknown error: ${error}`);
  }

  console.log('Continuing without persistence - data will not be saved between restarts');
  console.log('To enable persistence later, restart the server with proper permissions');
}
