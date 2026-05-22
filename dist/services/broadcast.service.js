"use strict";
/**
 * Pre-serialization Broadcast Service
 * Minimizes serialization overhead by encoding payloads once and pushing to all sockets.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.broadcast = broadcast;
const store_service_js_1 = require("./store.service.js");
/**
 * Broadcast an event payload to all currently connected SSE clients.
 * Pre-serializes the data payload once, avoiding redundant stringify overhead per client.
 */
function broadcast(event, data) {
    if (store_service_js_1.sseClients.size === 0)
        return;
    console.log(`[Broadcast] Pre-serializing "${event}" payload once for ${store_service_js_1.sseClients.size} clients...`);
    try {
        const serialized = JSON.stringify(data);
        const preSerialized = `event: ${event}\ndata: ${serialized}\n\n`;
        store_service_js_1.sseClients.forEach((client) => {
            try {
                client.send(event, data, preSerialized);
            }
            catch (error) {
                console.error(`[Broadcast] Pruning dead client connection: ${client.id}`, error);
                store_service_js_1.sseClients.delete(client);
                try {
                    client.close();
                }
                catch (_) { }
            }
        });
    }
    catch (err) {
        console.error("[Broadcast] Broadcast serialization failure:", err);
    }
}
