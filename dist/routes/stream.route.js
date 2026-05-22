"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const crypto_1 = __importDefault(require("crypto"));
const store_service_js_1 = require("../services/store.service.js");
const router = (0, express_1.Router)();
/**
 * GET /api/stream
 * Establishes a persistent Server-Sent Events (SSE) telemetry connection.
 */
router.get("/stream", (req, res) => {
    const clientId = crypto_1.default.randomUUID();
    // Establish SSE HTTP headers
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no" // Prevent Nginx/Cloudflare buffering
    });
    // Send initial comment ping to flush headers immediately
    res.write(":\n\n");
    /**
     * Helper to write SSE formatted data
     */
    const sendSSE = (event, data, preSerialized) => {
        try {
            const message = preSerialized || `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
            res.write(message);
            // Flush response if compression middleware is present
            if (typeof res.flush === "function") {
                res.flush();
            }
        }
        catch (err) {
            console.error(`[SSE Stream] Error writing to client ${clientId}:`, err);
        }
    };
    // Construct SSEClient model
    const client = {
        id: clientId,
        send: (event, data, preSerialized) => {
            sendSSE(event, data, preSerialized);
        },
        close: () => {
            try {
                res.end();
            }
            catch (_) { }
        }
    };
    // Register the client
    (0, store_service_js_1.addSSEClient)(client);
    // Send connection successful greeting
    sendSSE("connected", { success: true, clientId });
    // Flush current state immediately so new client doesn't wait for the next update
    if (store_service_js_1.latestDashboardData) {
        sendSSE("dashboard_update", store_service_js_1.latestDashboardData);
    }
    // Handle socket closed by client (closed tab, page refresh, network drop)
    req.on("close", () => {
        console.log(`[SSE Stream] Client connection closed by client socket: ${clientId}`);
        (0, store_service_js_1.removeSSEClient)(clientId);
    });
});
exports.default = router;
