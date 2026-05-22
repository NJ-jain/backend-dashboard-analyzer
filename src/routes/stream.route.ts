import { Router, Request, Response } from "express";
import crypto from "crypto";
import { addSSEClient, removeSSEClient, latestDashboardData } from "../services/store.service.js";
import { SSEClient } from "../types/index.js";

const router = Router();

/**
 * GET /api/stream
 * Establishes a persistent Server-Sent Events (SSE) telemetry connection.
 */
router.get("/stream", (req: Request, res: Response) => {
  const clientId = crypto.randomUUID();

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
  const sendSSE = (event: string, data: unknown, preSerialized?: string) => {
    try {
      const message = preSerialized || `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      res.write(message);
      
      // Flush response if compression middleware is present
      if (typeof (res as any).flush === "function") {
        (res as any).flush();
      }
    } catch (err) {
      console.error(`[SSE Stream] Error writing to client ${clientId}:`, err);
    }
  };

  // Construct SSEClient model
  const client: SSEClient = {
    id: clientId,
    send: (event: string, data: unknown, preSerialized?: string) => {
      sendSSE(event, data, preSerialized);
    },
    close: () => {
      try {
        res.end();
      } catch (_) {}
    }
  };

  // Register the client
  addSSEClient(client);

  // Send connection successful greeting
  sendSSE("connected", { success: true, clientId });

  // Flush current state immediately so new client doesn't wait for the next update
  if (latestDashboardData) {
    sendSSE("dashboard_update", latestDashboardData);
  }

  // Handle socket closed by client (closed tab, page refresh, network drop)
  req.on("close", () => {
    console.log(`[SSE Stream] Client connection closed by client socket: ${clientId}`);
    removeSSEClient(clientId);
  });
});

export default router;
