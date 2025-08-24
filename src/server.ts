import * as net from "net";
import { MemServLight } from "./memserv";

// Create a single instance to handle all connections
const memServ = new MemServLight();

const server: net.Server = net.createServer((connection: net.Socket) => {
  connection.on("data", (data) => {
    try {
    const commandString = data.toString("utf-8");
    const parsedCommand = memServ.parse(commandString);

    if (!parsedCommand) {
      connection.write("ERROR");
      return;
    }

    const response = memServ.execute(parsedCommand);
    connection.write(response);
  } catch(err) {
      console.log(err);
    }
  })
});

server.listen(6379, "127.0.0.1");
