/**
 * Stateful In-Memory cache and connection registry service.
 * Seeds initial mock data on startup and manages SSE client tracking.
 */

import fs from "fs";
import path from "path";
import { DashboardData, SSEClient } from "../types/index.js";
import { broadcast } from "./broadcast.service.js";

// Global active SSE clients registry
export const sseClients = new Set<SSEClient>();

// Local state file path for telemetry persistence
const STATE_FILE_PATH = path.join(process.cwd(), "ehs_dashboard_state.json");

// Global latest EHS Dashboard data cache
export let latestDashboardData: DashboardData | null = null;

/**
 * Register a new SSE client
 */
export function addSSEClient(client: SSEClient): void {
  sseClients.add(client);
  console.log(`[Store] SSE Client registered: ${client.id}. Total active: ${sseClients.size}`);
}

/**
 * Remove an SSE client from the registry
 */
export function removeSSEClient(clientId: string): void {
  let found: SSEClient | null = null;
  for (const client of sseClients) {
    if (client.id === clientId) {
      found = client;
      break;
    }
  }
  if (found) {
    sseClients.delete(found);
    console.log(`[Store] SSE Client pruned: ${clientId}. Total active: ${sseClients.size}`);
  }
}

let broadcastDebounceTimer: NodeJS.Timeout | null = null;

/**
 * Update the global EHS telemetry cache and trigger a debounced SSE broadcast (500ms window).
 */
export function updateDashboardData(newData: Partial<DashboardData>): DashboardData {
  const current = latestDashboardData || getInitialMockData();
  
  latestDashboardData = {
    ...current,
    ...newData,
    lastUpdated: new Date().toISOString()
  };

  // Persist state to local storage asynchronously
  try {
    fs.writeFile(STATE_FILE_PATH, JSON.stringify(latestDashboardData, null, 2), "utf8", (err) => {
      if (err) {
        console.error("[Store] Failed to write EHS persisted state:", err);
      } else {
        console.log(`[Store] Telemetry state successfully persisted to disk: ${STATE_FILE_PATH}`);
      }
    });
  } catch (err) {
    console.error("[Store] Async disk write operation threw exception:", err);
  }

  // Debounced/throttled broadcast to prevent UI rendering storms under consecutive sheet edits
  if (broadcastDebounceTimer) {
    clearTimeout(broadcastDebounceTimer);
  }

  broadcastDebounceTimer = setTimeout(() => {
    broadcastDebounceTimer = null;
    if (latestDashboardData) {
      broadcast("dashboard_update", latestDashboardData);
    }
  }, 500);

  return latestDashboardData;
}

/**
 * Generates high-fidelity mock data to seed the telemetry system immediately on startup.
 */
export function getInitialMockData(): DashboardData {
  return {
    kpiStats: [
      {
        title: "Total Incidents",
        value: 21,
        change: "12% vs Apr 2025",
        changeType: "decrease",
        comparisonText: "vs Apr 2025",
        isGoodTrend: "positive",
        iconColorClass: "text-rose-400",
        iconBgClass: "bg-rose-950/20 border-rose-500/20"
      },
      {
        title: "LTIFR (Lost Time)",
        value: 1.32,
        change: "8% vs Apr 2025",
        changeType: "decrease",
        comparisonText: "vs Apr 2025",
        isGoodTrend: "positive",
        iconColorClass: "text-emerald-400",
        iconBgClass: "bg-emerald-950/20 border-emerald-500/20"
      },
      {
        title: "First Aid Cases",
        value: 7,
        change: "16% vs Apr 2025",
        changeType: "increase",
        comparisonText: "vs Apr 2025",
        isGoodTrend: "negative",
        iconColorClass: "text-amber-400",
        iconBgClass: "bg-amber-950/20 border-amber-500/20"
      },
      {
        title: "Near Miss Track",
        value: 8,
        change: "11% vs Apr 2025",
        changeType: "decrease",
        comparisonText: "vs Apr 2025",
        isGoodTrend: "positive",
        iconColorClass: "text-orange-400",
        iconBgClass: "bg-orange-950/20 border-orange-500/20"
      },
      {
        title: "Safety Compliance",
        value: "89%",
        change: "3% vs Apr 2025",
        changeType: "decrease",
        comparisonText: "vs Apr 2025",
        isGoodTrend: "negative",
        iconColorClass: "text-cyan-400",
        iconBgClass: "bg-cyan-950/20 border-cyan-500/20"
      },
      {
        title: "Training Hours",
        value: 320,
        change: "10% vs Apr 2025",
        changeType: "increase",
        comparisonText: "vs Apr 2025",
        isGoodTrend: "positive",
        iconColorClass: "text-indigo-400",
        iconBgClass: "bg-indigo-950/20 border-indigo-500/20"
      }
    ],
    incidentBreakdown: [
      { name: "Fatality", value: 0, color: "#EF4444" },
      { name: "LTI (Lost Time Injury)", value: 4, color: "#F97316" },
      { name: "First Aid", value: 7, color: "#10B981" },
      { name: "Near Miss", value: 8, color: "#06B6D4" },
      { name: "Unsafe Act", value: 1, color: "#8B5CF6" },
      { name: "Unsafe Cond.", value: 1, color: "#EAB308" }
    ],
    incidentTrend: [
      { name: "Dec-24", Fatality: 0, LTI: 1, FirstAid: 2, NearMiss: 4, UnsafeAct: 5, UnsafeCond: 1 },
      { name: "Jan-25", Fatality: 0, LTI: 2, FirstAid: 4, NearMiss: 5, UnsafeAct: 3, UnsafeCond: 2 },
      { name: "Feb-25", Fatality: 0, LTI: 1, FirstAid: 3, NearMiss: 5, UnsafeAct: 2, UnsafeCond: 1 },
      { name: "Mar-25", Fatality: 0, LTI: 0, FirstAid: 1, NearMiss: 7, UnsafeAct: 1, UnsafeCond: 1 },
      { name: "Apr-25", Fatality: 0, LTI: 1, FirstAid: 3, NearMiss: 9, UnsafeAct: 2, UnsafeCond: 3 },
      { name: "May-25", Fatality: 0, LTI: 0, FirstAid: 7, NearMiss: 8, UnsafeAct: 1, UnsafeCond: 3 }
    ],
    msiParameters: [
      { title: "Accident Mgmt", score: "9/10", percentage: 90 },
      { title: "Permit to Work (PTW)", score: "8.5/10", percentage: 85 },
      { title: "Electrical Safety", score: "9.5/10", percentage: 95 },
      { title: "PIT / Forklifts", score: "9/10", percentage: 90 },
      { title: "Chemical Safety", score: "8/10", percentage: 80 },
      { title: "Machine Guarding", score: "8.5/10", percentage: 85 },
      { title: "EHS Committee Meetings", score: "10/10", percentage: 100 },
      { title: "Gemba Walks Compliance", score: "9/10", percentage: 90 },
      { title: "EHS Training Compliance", score: "8.5/10", percentage: 85 },
      { title: "Mock Drills Auditing", score: "9/10", percentage: 90 },
      { title: "EHS Legal Compliance", score: "10/10", percentage: 100 },
      { title: "Waste Management Plan", score: "9.5/10", percentage: 95 }
    ],
    msiScore: 90,
    gembaData: {
      walksCount: 24,
      compliance: 96,
      mtdObs: 12,
      ytdObs: 110,
      closurePct: 91,
      trend: [
        { name: "Dec", Observations: 8, Closed: 7 },
        { name: "Jan", Observations: 10, Closed: 9 },
        { name: "Feb", Observations: 15, Closed: 12 },
        { name: "Mar", Observations: 11, Closed: 10 },
        { name: "Apr", Observations: 18, Closed: 16 },
        { name: "May", Observations: 12, Closed: 11 }
      ]
    },
    criticalIssues: [
      { id: 1, issue: "Non-compliance with PTW procedure", area: "Work Area C", status: "Open" },
      { id: 2, issue: "Improper storage of flammable chemicals", area: "Chemical Store A", status: "Open" },
      { id: 3, issue: "Delay in corrective action closure for machine guarding", area: "Production Line 2", status: "Open" },
      { id: 4, issue: "Non-compliance with PTW lockouts", area: "Main Power Substation", status: "Open" }
    ],
    bodyPartInjuries: [
      { id: "head", name: "Head", count: 5 },
      { id: "face", name: "Face", count: 8 },
      { id: "hand", name: "Hand", count: 4 },
      { id: "finger", name: "Finger", count: 8 },
      { id: "leg", name: "Leg", count: 12 },
      { id: "foot", name: "Foot", count: 10 },
      { id: "others", name: "Others (Torso)", count: 5 }
    ],
    fireIncidents: { value: 9, change: "▼ 10% vs Apr 2025" },
    envIncidents: { value: 9, change: "▲ 0% vs Apr 2025" },
    committeeMeetings: [
      { label: "Meeting Done?", val: "Yes", textClass: "text-emerald-400 font-bold" },
      { label: "MOM Shared?", val: "Yes", textClass: "text-emerald-400 font-bold" },
      { label: "Monthly Points", val: "12", textClass: "text-slate-100 font-mono" },
      { label: "YTD Points", val: "45", textClass: "text-slate-100 font-mono" },
      { label: "Monthly Compliance %", val: "88%", textClass: "text-emerald-400 font-mono font-bold" },
      { label: "YTD Closure %", val: "90%", textClass: "text-emerald-400 font-mono font-bold" }
    ],
    trainingSessions: [
      { type: "Training Sessions", sessions: 6, headcount: 320 },
      { type: "Awareness Sessions", sessions: 4, headcount: 280 },
      { type: "Induction Sessions", sessions: 15, headcount: 75 }
    ],
    auditCompliance: [
      { title: "Ambulance Audit", percentage: 82, colorType: "cyan" },
      { title: "Wellness Room", percentage: 88, colorType: "emerald" },
      { title: "Bus Safety Audit", percentage: 76, colorType: "amber" },
      { title: "Conveyor Audit", percentage: 79, colorType: "purple" }
    ],
    mockDrills: [
      { label: "Drill Conducted", val: "Yes", valClass: "text-emerald-400 font-bold" },
      { label: "Drill Type", val: "Fire Evacuation", valClass: "text-slate-300 font-semibold" },
      { label: "Observation", val: "Evacuated in 4.2 min", valClass: "text-slate-400 text-[10px] leading-tight" },
      { label: "Attendance", val: "92%", valClass: "text-cyan-400 font-mono font-bold" }
    ],
    milestones: [
      "ZERO LTI for 3 consecutive months - 91 LTI-free days achieved",
      "MSI Score improved by 8 points vs previous month",
      "Fire evacuation drill completed with 100% headcount",
      "Wellness room utilization improved by 12%"
    ],
    lastUpdated: new Date().toISOString()
  };
}

// Automatically seed cache or restore persisted data on module load
try {
  if (fs.existsSync(STATE_FILE_PATH)) {
    const rawData = fs.readFileSync(STATE_FILE_PATH, "utf8");
    latestDashboardData = JSON.parse(rawData);
    console.log(`[Store] Successfully restored persisted EHS state from: ${STATE_FILE_PATH}`);
  } else {
    latestDashboardData = getInitialMockData();
    console.log("[Store] No persisted EHS state found. Initialized with default mock seed data.");
  }
} catch (error) {
  console.error("[Store] Failed to restore persisted state on load:", error);
  latestDashboardData = getInitialMockData();
}
