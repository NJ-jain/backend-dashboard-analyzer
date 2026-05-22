import { Router, Request, Response } from "express";
import { updateDashboardData, latestDashboardData, getInitialMockData } from "../services/store.service.js";
import { transformSheetWebhook } from "../services/transformer.service.js";
import { rateLimiter } from "../middleware/rateLimiter.js";
import { validator } from "../middleware/validator.js";

const router = Router();

/**
 * POST /api/update
 * Webhook ingestion endpoint for EHS telemetry updates.
 * Protected by sliding window rate-limiter and strict schema validator.
 */
router.post("/update", rateLimiter, validator, (req: Request, res: Response) => {
  try {
    const payload = req.body;
    let updatedStore;

    // Detect if this is a raw Google Sheets row dataset payload
    if ("sheetName" in payload && "sheetData" in payload) {
      console.log(`[Update Webhook] Standardizing raw sheet rows for sheet: "${payload.sheetName}"`);
      const current = latestDashboardData || getInitialMockData();
      const parsedData = transformSheetWebhook(payload, current);
      updatedStore = updateDashboardData(parsedData);
    } else {
      // Direct partial update or standard dashboard state update override
      console.log("[Update Webhook] Processing direct telemetry dashboard state override");
      updatedStore = updateDashboardData(payload);
    }

    res.status(200).json({
      success: true,
      message: "Global telemetry store updated and broadcasted successfully",
      lastUpdated: updatedStore.lastUpdated
    });
  } catch (error: any) {
    console.error("[Update Webhook] Ingestion error details:", error);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "An unexpected error occurred while processing the telemetry update."
    });
  }
});

export default router;
