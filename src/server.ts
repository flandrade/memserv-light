import * as net from "net";
import { MemServLight } from "./memserv";
import { AOFError, handlePersistenceError } from "./utils/error";

const memServ = new MemServLight();

// Persistence configuration
const AOF_FILE = './data/appendonly.aof';
const PERSISTENCE_ENABLED = process.env.MEMSERV_PERSISTENCE === 'true';

/**
 * Initialize persistence with comprehensive error handling and logging
 */
async function initializePersistence(): Promise<void> {
  if (!PERSISTENCE_ENABLED) {
    console.log('📝 Persistence disabled (set MEMSERV_PERSISTENCE=true to enable)');
    return;
  }

  console.log('🔄 Initializing persistence...');

  try {
    // Step 1: Enable persistence
    const persistenceEnabled = memServ.enablePersistence(AOF_FILE);
    if (!persistenceEnabled) {
      throw new AOFError('Failed to enable persistence - write stream creation failed');
    }
    // Step 2: Restore data from AOF file
    const restored = await memServ.restoreFromPersistence(AOF_FILE);

    if (restored) {
      console.log('✅ Data restored successfully from AOF file');
    } else {
      console.warn('⚠️  AOF file exists but restore failed - starting with empty database');
    }

  } catch (error) {
    handlePersistenceError(error);
  }
}

/**
 * Start the server with persistence enabled
 */
async function startServer(): Promise<void> {
  console.log('🚀 Starting MemServLight server...');

  await initializePersistence();

  const server: net.Server = net.createServer((connection: net.Socket) => {
    connection.on("data", async (data) => {
      try {
        const commandString = data.toString("utf-8");
        const parsedCommand = memServ.parse(commandString);

        if (!parsedCommand) {
          connection.write("-ERROR Invalid command\r\n");
          return;
        }

        const response = await memServ.execute(parsedCommand);
        connection.write(response);
      } catch (err) {
        console.error('Command execution error:', err);
        connection.write("-ERROR Internal server error\r\n");
      }
    });

    connection.on("error", (err) => {
      console.error("Connection error:", err);
    });
  });

  server.listen(6379, "127.0.0.1", () => {
    console.log("✅ MemServLight server listening on 127.0.0.1:6379");
    console.log("📊 Server ready to accept connections");
  });

  // Graceful shutdown
  let isShuttingDown = false;

  const shutdown = async () => {
    if (isShuttingDown) {
      return; // Prevent multiple shutdown calls
    }

    isShuttingDown = true;
    console.log("🔄 Shutting down server...");

    // Flush any pending writes
    try {
      await memServ.flushPersistence();
      console.log("✅ Persistence flushed successfully");
    } catch (error) {
      console.error("❌ Error flushing persistence:", error);
    }

    server.close(() => {
      console.log("✅ Server closed");
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

startServer().catch((error) => {
  console.error('💥 Failed to start server:', error);
  process.exit(1);
});