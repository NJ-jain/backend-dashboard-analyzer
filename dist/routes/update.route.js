"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const store_service_js_1 = require("../services/store.service.js");
const transformer_service_js_1 = require("../services/transformer.service.js");
const rateLimiter_js_1 = require("../middleware/rateLimiter.js");
const validator_js_1 = require("../middleware/validator.js");
const router = (0, express_1.Router)();
/**
 * POST /api/update
 * Webhook ingestion endpoint for EHS telemetry updates.
 * Protected by sliding window rate-limiter and strict schema validator.
 */
router.post("/update", rateLimiter_js_1.rateLimiter, validator_js_1.validator, (req, res) => {
    try {
        const payload = req.body;
        let updatedStore;
        // Detect if this is a raw Google Sheets row dataset payload
        if ("sheetName" in payload && "sheetData" in payload) {
            console.log(`[Update Webhook] Standardizing raw sheet rows for sheet: "${payload.sheetName}"`);
            const current = store_service_js_1.latestDashboardData || (0, store_service_js_1.getInitialMockData)();
            const parsedData = (0, transformer_service_js_1.transformSheetWebhook)(payload, current);
            updatedStore = (0, store_service_js_1.updateDashboardData)(parsedData);
        }
        else {
            // Direct partial update or standard dashboard state update override
            console.log("[Update Webhook] Processing direct telemetry dashboard state override");
            updatedStore = (0, store_service_js_1.updateDashboardData)(payload);
        }
        res.status(200).json({
            success: true,
            message: "Global telemetry store updated and broadcasted successfully",
            lastUpdated: updatedStore.lastUpdated
        });
    }
    catch (error) {
        console.error("[Update Webhook] Ingestion error details:", error);
        res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "An unexpected error occurred while processing the telemetry update."
        });
    }
});
exports.default = router;
