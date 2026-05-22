/**
 * Pre-serialization Broadcast Service
 * Minimizes serialization overhead by encoding payloads once and pushing to all sockets.
 */

import { sseClients } from "./store.service.js";

/**
 * Broadcast an event payload to all currently connected SSE clients.
 * Pre-serializes the data payload once, avoiding redundant stringify overhead per client.
 */
export function broadcast(event: string, data: unknown): void {
  if (sseClients.size === 0) return;

  console.log(`[Broadcast] Pre-serializing "${event}" payload once for ${sseClients.size} clients...`);
  
  try {
    const serialized = JSON.stringify(data);
    const preSerialized = `event: ${event}\ndata: ${serialized}\n\n`;

    sseClients.forEach((client) => {
      try {
        client.send(event, data, preSerialized);
      } catch (error) {
        console.error(`[Broadcast] Pruning dead client connection: ${client.id}`, error);
        sseClients.delete(client);
        try {
          client.close();
        } catch (_) {}
      }
    });
  } catch (err) {
    console.error("[Broadcast] Broadcast serialization failure:", err);
  }
}
