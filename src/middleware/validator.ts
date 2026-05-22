/**
 * Schema and Type Validation Layer for Realtime EHS Telemetry
 * Guarantees that only structurally sound data updates are committed
 * to the global store, protecting against malformed rows or format issues.
 */

import { Request, Response, NextFunction } from "express";
import { DashboardData } from "../types/index.js";

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates the structure and type constraints of incoming webhook updates.
 * Supports both raw Google Sheets payloads and partial/full EHS state overrides.
 */
export function validatePayload(payload: unknown): ValidationResult {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { isValid: false, error: "Payload must be a non-null JSON object." };
  }

  const obj = payload as Record<string, any>;

  // Scenario A: Google Sheets webhook rows format
  if ("sheetName" in obj || "sheetData" in obj) {
    if (typeof obj.sheetName !== "string" || !obj.sheetName.trim()) {
      return { isValid: false, error: "Missing or invalid 'sheetName'. Must be a non-empty string." };
    }
    if (!Array.isArray(obj.sheetData)) {
      return { isValid: false, error: "Missing or invalid 'sheetData'. Must be an array of row objects." };
    }
    
    // Inspect each row inside sheetData
    for (let i = 0; i < obj.sheetData.length; i++) {
      const row = obj.sheetData[i];
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        return { isValid: false, error: `Invalid entry in 'sheetData' at index ${i}. Each row must be a JSON object.` };
      }
    }
    return { isValid: true };
  }

  // Scenario B: Direct partial dashboard state updates
  const validKeys: Array<keyof DashboardData> = [
    "kpiStats", "incidentBreakdown", "incidentTrend", "msiParameters", 
    "msiScore", "gembaData", "criticalIssues", "bodyPartInjuries", 
    "fireIncidents", "envIncidents", "committeeMeetings", 
    "trainingSessions", "auditCompliance", "mockDrills", "milestones",
    "lastUpdated", "facility", "region", "reportMonth", "reportDate",
    "siteGM", "siteLead", "ehsLead", "records"
  ];

  const payloadKeys = Object.keys(obj);
  if (payloadKeys.length === 0) {
    return { isValid: false, error: "Payload cannot be empty." };
  }

  for (const key of payloadKeys) {
    if (!validKeys.includes(key as keyof DashboardData)) {
      return { isValid: false, error: `Unknown dashboard telemetry key: '${key}'.` };
    }

    const val = obj[key];

    // Numeric type verification
    if (key === "msiScore" && typeof val !== "number") {
      return { isValid: false, error: "'msiScore' must be a number." };
    }

    // Milestones check
    if (key === "milestones" && (!Array.isArray(val) || val.some(item => typeof item !== "string"))) {
      return { isValid: false, error: "'milestones' must be a clean array of strings." };
    }

    // Array metric segments check
    const arrayKeys = [
      "kpiStats", 
      "incidentBreakdown", 
      "incidentTrend", 
      "msiParameters", 
      "criticalIssues", 
      "bodyPartInjuries", 
      "committeeMeetings", 
      "trainingSessions", 
      "auditCompliance", 
      "mockDrills"
    ];
    if (arrayKeys.includes(key)) {
      if (!Array.isArray(val)) {
        return { isValid: false, error: `'${key}' must be a valid array.` };
      }
    }

    // Key hazard metrics check
    if (["fireIncidents", "envIncidents"].includes(key)) {
      if (!val || typeof val !== "object" || Array.isArray(val) || typeof val.value !== "number") {
        return { isValid: false, error: `'${key}' must be an object containing a numeric 'value' key.` };
      }
    }

    // GembaWalk structural validation
    if (key === "gembaData") {
      if (!val || typeof val !== "object" || Array.isArray(val) || typeof val.walksCount !== "number" || !Array.isArray(val.trend)) {
        return { isValid: false, error: "'gembaData' must match the standard GembaWalkData structure." };
      }
    }
  }

  return { isValid: true };
}

/**
 * Express middleware to validate req.body payload structure
 */
export const validator = (req: Request, res: Response, next: NextFunction): void => {
  const result = validatePayload(req.body);

  if (!result.isValid) {
    console.warn(`[Validator] Rejected malformed payload: ${result.error}`);
    res.status(400).json({
      success: false,
      error: "Bad Request",
      message: result.error
    });
    return;
  }

  next();
};
