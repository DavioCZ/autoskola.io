import { Server } from "colyseus";
import { createServer } from "http";
import express from "express";
import { DriveRoom } from "./rooms/drive";

const port = Number(process.env.PORT) || 3000;

const app = express();
app.use(express.json());

const gameServer = new Server({
  server: createServer(app),
});

// Register our game room
gameServer.define("drive", DriveRoom);

gameServer.listen(port);
console.log(`Server listening on ws://localhost:${port}`);
