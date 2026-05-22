/**
 * SSE Heartbeat Keep-Alive Service
 * Drives persistent 25s pings to avoid socket timeout on proxy load-balancers.
 */

import { sseClients } from "./store.service.js";

let heartbeatInterval: NodeJS.Timeout | null = null;

/**
 * Start the heartbeat ping loop
 */
export function startHeartbeat(): void {
  if (heartbeatInterval) return;

  console.log("[Heartbeat] Initializing keep-alive daemon (25s interval)");

  heartbeatInterval = setInterval(() => {
    if (sseClients.size === 0) return;

    console.log(`[Heartbeat] Sending ping to ${sseClients.size} connected clients...`);
    const pingMessage = `event: ping\ndata: "heartbeat"\n\n`;

    sseClients.forEach((client) => {
      try {
        client.send("ping", "heartbeat", pingMessage);
      } catch (err) {
        console.warn(`[Heartbeat] Socket dead. Pruning client from registry: ${client.id}`);
        sseClients.delete(client);
        try {
          client.close();
        } catch (_) {}
      }
    });
  }, 25000);

  // Prevent blocking process termination in testing suites
  if (typeof heartbeatInterval.unref === "function") {
    heartbeatInterval.unref();
  }
}

/**
 * Stop the heartbeat ping loop
 */
export function stopHeartbeat(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
    console.log("[Heartbeat] Stopped keep-alive daemon");
  }
}
