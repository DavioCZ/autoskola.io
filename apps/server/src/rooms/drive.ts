import { Room, Client } from "colyseus";
import { TICK_RATE } from "@shared";

export class DriveRoom extends Room {
  onCreate(options: any) {
    console.log("DriveRoom created!", options);

    this.setPatchRate(1000 / TICK_RATE);

    this.onMessage("*", (client, type, message) => {
      console.log(`Received message "${type}" from ${client.sessionId}:`, message);
    });
  }

  onJoin(client: Client, options: any) {
    console.log(client.sessionId, "joined!");
  }

  onLeave(client: Client, consented: boolean) {
    console.log(client.sessionId, "left!");
  }

  onDispose() {
    console.log("room", this.roomId, "disposing...");
  }
}
