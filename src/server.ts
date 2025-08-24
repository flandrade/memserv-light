import * as net from "net";
import { MemServLight } from "./memserv";

const memServ = new MemServLight();

// Initialize persistence
const AOF_FILE = './data/appendonly.aof';

(async () => {
  try {
    memServ.enablePersistence(AOF_FILE);
    const restored = await memServ.restoreFromPersistence(AOF_FILE);
    if (restored) {
      console.log('Persistence initialized and data restored');
    } else {
      console.log('Failed to restore from AOF file');
    }
  } catch (error) {
    console.error('Failed to initialize persistence:', error);
    // Don't exit, just continue without persistence
    console.log('Continuing without persistence...');
  }
})();

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
  console.log("MemServLight server listening on 127.0.0.1:6379");
});

// Graceful shutdown
let isShuttingDown = false;

const shutdown = async () => {
  if (isShuttingDown) {
    return; // Prevent multiple shutdown calls
  }

  isShuttingDown = true;
  console.log("Shutting down server...");

  // Flush any pending writes
  try {
    await memServ.flushPersistence();
    console.log("Persistence flushed");
  } catch (error) {
    console.error("Error flushing persistence:", error);
  }

  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
