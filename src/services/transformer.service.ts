/**
 * Google Sheet to Dashboard Analytics Transformer Utility
 * 
 * Provides type-safe parsing, structural cleaning, and validation layers
 * to translate raw, potentially malformed rows from Google Sheet webhooks
 * into structured EHS dashboard states.
 */

import { 
  DashboardData, 
  KPICardData, 
  IncidentCategoryBreakdown,
  MonthlyTrendData, 
  MSIParameterData, 
  GembaWalkData, 
  CriticalIssue, 
  BodyPartInjury, 
  CommitteeMeetingRow, 
  TrainingRow, 
  AuditGaugeData, 
  MockDrillRow 
} from "../types/index.js";

/**
 * Standard interface for raw data received from Google Sheets
 */
export interface RawSheetPayload {
  sheetName: string;
  sheetData: Array<Record<string, any>>;
  lastUpdatedBy?: string;
  timestamp?: string;
}

/**
 * Safely parses numbers from string or raw values with a fallback default.
 */
export function safeNumber(value: any, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "number") {
    return isNaN(value) ? fallback : value;
  }
  const parsed = parseFloat(String(value).replace(/[^0-9.-]/g, ""));
  return isNaN(parsed) ? fallback : parsed;
}

/**
 * Safely parses strings with trim and fallback.
 */
export function safeString(value: any, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

/**
 * Safely parses boolean values from various sheet notations.
 */
export function safeBoolean(value: any, fallback = false): boolean {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  const str = String(value).trim().toLowerCase();
  return str === "true" || str === "yes" || str === "y" || str === "1";
}

/**
 * Transforms KPI Card Rows from raw sheet data into clean, typed KPICardData array.
 */
export function parseKPIStats(rows: any[]): KPICardData[] {
  if (!Array.isArray(rows)) return [];
  
  return rows.map((row): KPICardData => {
    const title = safeString(row.title || row.name || row.kpi || row.Metric, "Unknown KPI");
    const rawVal = row.value !== undefined ? row.value : row.Val;
    
    let value: string | number = 0;
    if (typeof rawVal === "string" && rawVal.includes("%")) {
      value = safeString(rawVal, "0%");
    } else {
      value = safeNumber(rawVal, 0);
    }

    const change = safeString(row.change || row.diff || row.Trend, "");
    
    let changeType: "increase" | "decrease" = "decrease";
    const rawChangeType = safeString(row.changeType || row.type || row.direction).toLowerCase();
    if (rawChangeType.includes("inc") || rawChangeType.includes("up") || change.includes("▲")) {
      changeType = "increase";
    }

    const comparisonText = safeString(row.comparisonText || row.comparedTo || row.period, "vs last period");

    let isGoodTrend: "positive" | "negative" = "positive";
    const lowerTitle = title.toLowerCase();
    const isIncidentMetric = lowerTitle.includes("incident") || lowerTitle.includes("accident") || lowerTitle.includes("injury") || lowerTitle.includes("miss") || lowerTitle.includes("first aid");
    
    if (isIncidentMetric) {
      isGoodTrend = changeType === "decrease" ? "positive" : "negative";
    } else {
      isGoodTrend = changeType === "increase" ? "positive" : "negative";
    }

    let iconColorClass = "text-cyan-400";
    let iconBgClass = "bg-cyan-950/20 border-cyan-500/20";
    if (lowerTitle.includes("incident") || lowerTitle.includes("lti") || lowerTitle.includes("fatality")) {
      iconColorClass = "text-rose-400";
      iconBgClass = "bg-rose-950/20 border-rose-500/20";
    } else if (lowerTitle.includes("compliance") || lowerTitle.includes("audit")) {
      iconColorClass = "text-emerald-400";
      iconBgClass = "bg-emerald-950/20 border-emerald-500/20";
    } else if (lowerTitle.includes("first aid")) {
      iconColorClass = "text-amber-400";
      iconBgClass = "bg-amber-950/20 border-amber-500/20";
    } else if (lowerTitle.includes("near miss")) {
      iconColorClass = "text-orange-400";
      iconBgClass = "bg-orange-950/20 border-orange-500/20";
    } else if (lowerTitle.includes("training") || lowerTitle.includes("hour")) {
      iconColorClass = "text-indigo-400";
      iconBgClass = "bg-indigo-950/20 border-indigo-500/20";
    }

    return {
      title,
      value,
      change,
      changeType,
      comparisonText,
      isGoodTrend,
      iconColorClass,
      iconBgClass
    };
  }).filter(kpi => kpi.title !== "Unknown KPI");
}

/**
 * Transforms incident segment rows into clean typed Pie Chart Breakdown array.
 */
export function parseIncidentBreakdown(rows: any[]): IncidentCategoryBreakdown[] {
  if (!Array.isArray(rows)) return [];
  
  const colors = ["#EF4444", "#F97316", "#10B981", "#06B6D4", "#8B5CF6", "#EAB308", "#EC4899", "#3B82F6"];
  
  return rows.map((row, index): IncidentCategoryBreakdown => {
    return {
      name: safeString(row.name || row.category || row.type || row.label, "Unclassified"),
      value: Math.max(0, safeNumber(row.value || row.count || row.qty, 0)),
      color: safeString(row.color || colors[index % colors.length])
    };
  }).filter(item => item.name !== "Unclassified");
}

/**
 * Transforms monthly trend rows into clean MonthlyTrendData array.
 */
export function parseIncidentTrend(rows: any[]): MonthlyTrendData[] {
  if (!Array.isArray(rows)) return [];
  
  return rows.map((row): MonthlyTrendData => {
    return {
      name: safeString(row.name || row.month || row.timeline || row.period, "Unknown Month"),
      Fatality: Math.max(0, safeNumber(row.Fatality || row.fatality || row.fatalities, 0)),
      LTI: Math.max(0, safeNumber(row.LTI || row.lti || row.lostTime || row.lost_time, 0)),
      FirstAid: Math.max(0, safeNumber(row.FirstAid || row.firstAid || row.first_aid || row.fa, 0)),
      NearMiss: Math.max(0, safeNumber(row.NearMiss || row.nearMiss || row.near_miss || row.nm, 0)),
      UnsafeAct: Math.max(0, safeNumber(row.UnsafeAct || row.unsafeAct || row.unsafe_act || row.ua, 0)),
      UnsafeCond: Math.max(0, safeNumber(row.UnsafeCond || row.unsafeCond || row.unsafe_cond || row.uc, 0))
    };
  }).filter(item => item.name !== "Unknown Month");
}

/**
 * Transforms MSI Parameter Checklist items with compliance score calculation.
 */
export function parseMSIParameters(rows: any[]): MSIParameterData[] {
  if (!Array.isArray(rows)) return [];

  return rows.map((row): MSIParameterData => {
    const title = safeString(row.title || row.parameter || row.item, "Unknown Parameter");
    const percentage = Math.min(100, Math.max(0, safeNumber(row.percentage || row.compliance || row.pct || row.score_pct, 100)));
    
    let score = safeString(row.score || row.val);
    if (!score) {
      score = `${(percentage / 10).toFixed(percentage % 10 === 0 ? 0 : 1)}/10`;
    }

    return {
      title,
      score,
      percentage
    };
  }).filter(item => item.title !== "Unknown Parameter");
}

/**
 * Transforms Gemba Walk reports and parses historical data cleanly.
 */
export function parseGembaData(rows: any[]): GembaWalkData {
  const summaryRow = rows.find(r => r.walksCount !== undefined || r.mtdObs !== undefined) || {};
  const trendRows = rows.filter(r => r.Observations !== undefined || r.closed !== undefined);

  return {
    walksCount: Math.max(0, safeNumber(summaryRow.walksCount || summaryRow.walks || summaryRow.count, 24)),
    compliance: Math.min(100, Math.max(0, safeNumber(summaryRow.compliance || summaryRow.compliance_pct, 96))),
    mtdObs: Math.max(0, safeNumber(summaryRow.mtdObs || summaryRow.mtd_observations, 12)),
    ytdObs: Math.max(0, safeNumber(summaryRow.ytdObs || summaryRow.ytd_observations, 110)),
    closurePct: Math.min(100, Math.max(0, safeNumber(summaryRow.closurePct || summaryRow.closure || summaryRow.closed_pct, 91))),
    trend: trendRows.map((t) => {
      return {
        name: safeString(t.name || t.month || t.timeline || t.period, ""),
        Observations: Math.max(0, safeNumber(t.Observations || t.observations || t.obs, 0)),
        Closed: Math.max(0, safeNumber(t.Closed || t.closed || t.resolved, 0))
      };
    }).filter(t => t.name !== "")
  };
}

/**
 * Transforms critical issue tables with status normalization.
 */
export function parseCriticalIssues(rows: any[]): CriticalIssue[] {
  if (!Array.isArray(rows)) return [];

  return rows.map((row, idx): CriticalIssue => {
    const id = safeNumber(row.id || row.index, idx + 1);
    const issue = safeString(row.issue || row.description || row.detail || row.concern, "Unspecified hazard identified");
    const area = safeString(row.area || row.location || row.facility || row.department, "Plant General");
    
    let status = safeString(row.status || row.state, "Open");
    const lowerStatus = status.toLowerCase();
    if (lowerStatus.includes("op")) status = "Open";
    else if (lowerStatus.includes("prog") || lowerStatus.includes("work")) status = "In Progress";
    else if (lowerStatus.includes("close") || lowerStatus.includes("done") || lowerStatus.includes("resolv")) status = "Closed";

    return {
      id,
      issue,
      area,
      status
    };
  }).filter(item => item.issue !== "Unspecified hazard identified");
}

/**
 * Transforms anatomical injury lists.
 */
export function parseBodyPartInjuries(rows: any[]): BodyPartInjury[] {
  if (!Array.isArray(rows)) return [];

  const validBodyParts = ["head", "face", "hand", "finger", "leg", "foot", "others"];

  return rows.map((row): BodyPartInjury => {
    const rawId = safeString(row.id || row.bodyPart || row.part || row.partId).toLowerCase();
    let id = rawId;
    if (!validBodyParts.includes(id)) {
      if (id.includes("torso") || id.includes("chest") || id.includes("back") || id.includes("shoulder")) {
        id = "others";
      } else {
        const matched = validBodyParts.find(p => id.includes(p));
        id = matched || "others";
      }
    }

    const name = safeString(row.name || row.partName || id.charAt(0).toUpperCase() + id.slice(1), "Others");

    return {
      id,
      name,
      count: Math.max(0, safeNumber(row.count || row.incidents || row.injuries, 0))
    };
  });
}

/**
 * Transforms EHS Committee meetings log.
 */
export function parseCommitteeMeetings(rows: any[]): CommitteeMeetingRow[] {
  if (!Array.isArray(rows)) return [];

  return rows.map((row): CommitteeMeetingRow => {
    const label = safeString(row.label || row.item || row.name, "General Parameter");
    const val = safeString(row.val || row.value || row.status, "N/A");
    
    let textClass = safeString(row.textClass || row.class);
    if (!textClass) {
      const lowerVal = val.toLowerCase();
      if (lowerVal === "yes" || lowerVal === "true" || lowerVal === "compliant" || val.includes("%") && safeNumber(val) > 85) {
        textClass = "text-emerald-400 font-bold";
      } else if (lowerVal === "no" || lowerVal === "false" || lowerVal === "delayed") {
        textClass = "text-rose-400 font-bold";
      } else if (/\d/.test(val)) {
        textClass = "text-slate-100 font-mono";
      } else {
        textClass = "text-slate-300 font-semibold";
      }
    }

    return {
      label,
      val,
      textClass
    };
  });
}

/**
 * Transforms training matrix.
 */
export function parseTrainingSessions(rows: any[]): TrainingRow[] {
  if (!Array.isArray(rows)) return [];

  return rows.map((row): TrainingRow => {
    return {
      type: safeString(row.type || row.course || row.category || row.session, "Safety Training"),
      sessions: Math.max(0, safeNumber(row.sessions || row.classes || row.count, 0)),
      headcount: Math.max(0, safeNumber(row.headcount || row.attendance || row.students, 0))
    };
  });
}

/**
 * Transforms Safety compliance audits list.
 */
export function parseAuditCompliance(rows: any[]): AuditGaugeData[] {
  if (!Array.isArray(rows)) return [];

  return rows.map((row): AuditGaugeData => {
    const title = safeString(row.title || row.audit || row.area, "Safety Audit");
    const percentage = Math.min(100, Math.max(0, safeNumber(row.percentage || row.compliance || row.score || row.pct, 100)));
    
    let colorType = safeString(row.colorType || row.color || row.theme).toLowerCase();
    if (!["cyan", "emerald", "amber", "purple"].includes(colorType)) {
      if (percentage >= 90) colorType = "emerald";
      else if (percentage >= 80) colorType = "cyan";
      else if (percentage >= 70) colorType = "purple";
      else colorType = "amber";
    }

    return {
      title,
      percentage,
      colorType
    };
  });
}

/**
 * Transforms Mock evacuation drills rows.
 */
export function parseMockDrills(rows: any[]): MockDrillRow[] {
  if (!Array.isArray(rows)) return [];

  return rows.map((row): MockDrillRow => {
    const label = safeString(row.label || row.criterion || row.item, "Observation Detail");
    const val = safeString(row.val || row.value || row.detail, "N/A");
    
    let valClass = safeString(row.valClass || row.class);
    if (!valClass) {
      const lowerVal = val.toLowerCase();
      if (lowerVal === "yes" || lowerVal === "conducted" || lowerVal.includes("100") || lowerVal.includes("99")) {
        valClass = "text-emerald-400 font-bold";
      } else if (lowerVal.includes("min") || lowerVal.includes("sec") || lowerVal.includes("%")) {
        valClass = "text-cyan-400 font-mono font-bold";
      } else {
        valClass = "text-slate-300 font-semibold";
      }
    }

    return {
      label,
      val,
      valClass
    };
  });
}

/**
 * Complete, safe parser orchestrator. 
 */
export function transformSheetWebhook(payload: RawSheetPayload, currentStore: DashboardData): DashboardData {
  const sheetName = safeString(payload.sheetName).toLowerCase();
  const rows = payload.sheetData || [];

  const updatedData: DashboardData = { ...currentStore };

  try {
    if (sheetName.includes("kpi") || sheetName.includes("stats")) {
      const parsedKpi = parseKPIStats(rows);
      if (parsedKpi.length > 0) updatedData.kpiStats = parsedKpi;
      
    } else if (sheetName.includes("breakdown") || sheetName.includes("pie") || sheetName.includes("category")) {
      const parsedBreakdown = parseIncidentBreakdown(rows);
      if (parsedBreakdown.length > 0) updatedData.incidentBreakdown = parsedBreakdown;
      
    } else if (sheetName.includes("trend") || sheetName.includes("line")) {
      const parsedTrend = parseIncidentTrend(rows);
      if (parsedTrend.length > 0) updatedData.incidentTrend = parsedTrend;
      
    } else if (sheetName.includes("msi") || sheetName.includes("parameter")) {
      const parsedParams = parseMSIParameters(rows);
      if (parsedParams.length > 0) updatedData.msiParameters = parsedParams;

      const scoreItem = rows.find(r => r.msiScore !== undefined || r.totalScore !== undefined || r.finalScore !== undefined);
      if (scoreItem) {
        updatedData.msiScore = Math.min(100, Math.max(0, safeNumber(scoreItem.msiScore || scoreItem.totalScore || scoreItem.finalScore, 90)));
      }

    } else if (sheetName.includes("gemba")) {
      const parsedGemba = parseGembaData(rows);
      if (parsedGemba.walksCount !== 24 || parsedGemba.trend.length > 0) {
        updatedData.gembaData = parsedGemba;
      }

    } else if (sheetName.includes("critical") || sheetName.includes("issue")) {
      const parsedIssues = parseCriticalIssues(rows);
      if (parsedIssues.length > 0) updatedData.criticalIssues = parsedIssues;

    } else if (sheetName.includes("body") || sheetName.includes("injury") || sheetName.includes("anatomical")) {
      const parsedBody = parseBodyPartInjuries(rows);
      if (parsedBody.length > 0) updatedData.bodyPartInjuries = parsedBody;

    } else if (sheetName.includes("fire") || sheetName.includes("environment")) {
      const fireRow = rows.find(r => r.metric?.toLowerCase().includes("fire") || r.title?.toLowerCase().includes("fire"));
      const envRow = rows.find(r => r.metric?.toLowerCase().includes("env") || r.title?.toLowerCase().includes("env"));
      
      if (fireRow) {
        updatedData.fireIncidents = {
          value: Math.max(0, safeNumber(fireRow.value || fireRow.count, 9)),
          change: safeString(fireRow.change || fireRow.trend, "▼ 10% vs Apr 2025")
        };
      }
      if (envRow) {
        updatedData.envIncidents = {
          value: Math.max(0, safeNumber(envRow.value || envRow.count, 9)),
          change: safeString(envRow.change || envRow.trend, "▲ 0% vs Apr 2025")
        };
      }

    } else if (sheetName.includes("meeting") || sheetName.includes("committee")) {
      const parsedMeetings = parseCommitteeMeetings(rows);
      if (parsedMeetings.length > 0) updatedData.committeeMeetings = parsedMeetings;

    } else if (sheetName.includes("training") || sheetName.includes("learn")) {
      const parsedTraining = parseTrainingSessions(rows);
      if (parsedTraining.length > 0) updatedData.trainingSessions = parsedTraining;

    } else if (sheetName.includes("audit") || sheetName.includes("compliance")) {
      const parsedAudits = parseAuditCompliance(rows);
      if (parsedAudits.length > 0) updatedData.auditCompliance = parsedAudits;

    } else if (sheetName.includes("drill")) {
      const parsedDrills = parseMockDrills(rows);
      if (parsedDrills.length > 0) updatedData.mockDrills = parsedDrills;

    } else if (sheetName.includes("milestone") || sheetName.includes("achievement")) {
      const parsedMilestones = rows.map(r => safeString(r.milestone || r.achievement || r.text || r.val)).filter(Boolean);
      if (parsedMilestones.length > 0) updatedData.milestones = parsedMilestones;
    }

    updatedData.lastUpdated = new Date().toISOString();

  } catch (error) {
    console.error(`[Transformer Error] Failed to parse sheet ${sheetName}:`, error);
  }

  return updatedData;
}
