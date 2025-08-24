import * as net from "net";
import { MemServLight } from "./memserv";

// Create a single instance to handle all connections
const memServ = new MemServLight();

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
const shutdown = () => {
  console.log("Shutting down server...");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
