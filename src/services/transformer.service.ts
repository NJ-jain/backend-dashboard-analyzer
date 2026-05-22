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
 * Resolves a value from an object using a list of target keys case-insensitively and space-insensitively.
 */
export function getLooseValue(row: any, targetKeys: string[], fallback: any = undefined): any {
  if (!row || typeof row !== "object") return fallback;
  
  // 1. Try exact match first
  for (const tk of targetKeys) {
    if (tk in row && row[tk] !== undefined && row[tk] !== null) {
      return row[tk];
    }
  }
  
  // 2. Try normalized exact match (e.g. lowercase space-stripped)
  const rowKeys = Object.keys(row);
  const normalizedTargets = targetKeys.map(k => k.toLowerCase().replace(/[^a-z0-9]/g, ""));
  
  for (const rk of rowKeys) {
    const normRk = rk.toLowerCase().replace(/[^a-z0-9]/g, "");
    const matchIndex = normalizedTargets.findIndex(nt => normRk === nt);
    if (matchIndex !== -1 && row[rk] !== undefined && row[rk] !== null) {
      return row[rk];
    }
  }

  // 3. Try loose partial match (e.g. contains or is contained in target keys)
  for (const rk of rowKeys) {
    const normRk = rk.toLowerCase().replace(/[^a-z0-9]/g, "");
    const matchIndex = normalizedTargets.findIndex(nt => normRk.includes(nt) || nt.includes(normRk));
    if (matchIndex !== -1 && row[rk] !== undefined && row[rk] !== null) {
      return row[rk];
    }
  }
  
  return fallback;
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
 * High-Density Flat Ingest Parser.
 * Translates a single-row high-density EHS flat table from Google Sheets
 * into the complete multi-faceted DashboardData telemetry cache state.
 */
export function parseFlatSheetRow(row: any, currentStore: DashboardData): DashboardData {
  if (!row || typeof row !== "object") return currentStore;

  const facility = safeString(getLooseValue(row, ["facility", "site", "location"]), currentStore.facility || "Kalash NDC");
  const region = safeString(getLooseValue(row, ["region", "area", "zone"]), currentStore.region || "North");
  const reportMonth = safeString(getLooseValue(row, ["reportMonth", "month", "report_month"]), currentStore.reportMonth || "May 2026");
  const reportDate = safeString(getLooseValue(row, ["reportDate", "date", "report_date"]), currentStore.reportDate || "2026-05-18");
  const siteGM = safeString(getLooseValue(row, ["siteGM", "siteGm", "site_gm", "gm", "siteManager"]), currentStore.siteGM || "Naman");
  const siteLead = safeString(getLooseValue(row, ["siteLead", "site_lead", "lead"]), currentStore.siteLead || "Naman");
  const ehsLead = safeString(getLooseValue(row, ["ehsLead", "ehs_lead", "ehslead", "ehsLeadOfficer", "ehsOfficer"]), currentStore.ehsLead || "Naman");

  // 1. KPI Stats
  const nearMiss = safeNumber(getLooseValue(row, ["nearMiss", "near_miss", "nearmiss", "nearMisses"]), 10);
  const firstAid = safeNumber(getLooseValue(row, ["firstAid", "first_aid", "firstaid", "firstAidCases"]), 10);
  const lostTimeAccident = safeNumber(getLooseValue(row, ["lostTimeAccident", "lost_time_accident", "losttimeaccident", "lti", "lostTime"]), 10);
  const fatality = safeNumber(getLooseValue(row, ["fatality", "fatalities", "deaths"]), 10);
  const seriousAccident = safeNumber(getLooseValue(row, ["seriousAccident", "serious_accident", "seriousaccident", "unsafeAct", "unsafe_act"]), 10);
  const totalIncidents = nearMiss + firstAid + lostTimeAccident + fatality + seriousAccident;
  const finalMSIScore = safeNumber(getLooseValue(row, ["finalMSIScore", "final_msi_score", "msiScore", "msi", "finalscore"]), 90);
  const trainingHeadcount = safeNumber(getLooseValue(row, ["trainingHeadcount", "training_headcount", "headcount", "trainingHours", "trainingh"]), 320);

  const kpiStats: KPICardData[] = [
    {
      title: "Total Incidents",
      value: totalIncidents,
      change: "12% vs Apr 2025",
      changeType: "decrease",
      comparisonText: "vs Apr 2025",
      isGoodTrend: "positive",
      iconColorClass: "text-rose-400",
      iconBgClass: "bg-rose-950/20 border-rose-500/20"
    },
    {
      title: "LTIFR (Lost Time)",
      value: lostTimeAccident,
      change: "8% vs Apr 2025",
      changeType: "decrease",
      comparisonText: "vs Apr 2025",
      isGoodTrend: "positive",
      iconColorClass: "text-emerald-400",
      iconBgClass: "bg-emerald-950/20 border-emerald-500/20"
    },
    {
      title: "First Aid Cases",
      value: firstAid,
      change: "16% vs Apr 2025",
      changeType: "decrease",
      comparisonText: "vs Apr 2025",
      isGoodTrend: "positive",
      iconColorClass: "text-amber-400",
      iconBgClass: "bg-amber-950/20 border-amber-500/20"
    },
    {
      title: "Near Miss Track",
      value: nearMiss,
      change: "11% vs Apr 2025",
      changeType: "decrease",
      comparisonText: "vs Apr 2025",
      isGoodTrend: "positive",
      iconColorClass: "text-orange-400",
      iconBgClass: "bg-orange-950/20 border-orange-500/20"
    },
    {
      title: "Safety Compliance",
      value: `${finalMSIScore}%`,
      change: "3% vs Apr 2025",
      changeType: "increase",
      comparisonText: "vs Apr 2025",
      isGoodTrend: "positive",
      iconColorClass: "text-cyan-400",
      iconBgClass: "bg-cyan-950/20 border-cyan-500/20"
    },
    {
      title: "Training Hours",
      value: trainingHeadcount,
      change: "10% vs Apr 2025",
      changeType: "increase",
      comparisonText: "vs Apr 2025",
      isGoodTrend: "positive",
      iconColorClass: "text-indigo-400",
      iconBgClass: "bg-indigo-950/20 border-indigo-500/20"
    }
  ];

  // 2. Incident Breakdown
  const incidentBreakdown: IncidentCategoryBreakdown[] = [
    { name: "Fatality", value: fatality, color: "#EF4444" },
    { name: "LTI (Lost Time Injury)", value: lostTimeAccident, color: "#F97316" },
    { name: "First Aid", value: firstAid, color: "#10B981" },
    { name: "Near Miss", value: nearMiss, color: "#06B6D4" },
    { name: "Unsafe Act", value: seriousAccident, color: "#8B5CF6" },
    { name: "Unsafe Cond.", value: safeNumber(getLooseValue(row, ["otherInjuries", "other_injuries", "otherinjuries", "others", "torso"]), 10), color: "#EAB308" }
  ];

  // 3. Incident Trend (Monthly YTD)
  const incidentTrend = [...currentStore.incidentTrend];
  let monthKey = "May-25";
  const parts = reportMonth.split(/[\s-]+/);
  if (parts.length >= 2) {
    const monthName = parts[0].slice(0, 3);
    const shortYear = parts[1].slice(-2);
    monthKey = `${monthName}-${shortYear}`;
  } else {
    monthKey = reportMonth;
  }
  const trendIndex = incidentTrend.findIndex(item => item.name.toLowerCase() === monthKey.toLowerCase());
  const newTrendRow = {
    name: monthKey,
    Fatality: fatality,
    LTI: lostTimeAccident,
    FirstAid: firstAid,
    NearMiss: nearMiss,
    UnsafeAct: seriousAccident,
    UnsafeCond: safeNumber(getLooseValue(row, ["otherInjuries", "other_injuries", "otherinjuries", "others", "torso"]), 10)
  };
  if (trendIndex !== -1) {
    incidentTrend[trendIndex] = newTrendRow;
  } else {
    if (incidentTrend.length > 0) {
      incidentTrend[incidentTrend.length - 1] = newTrendRow;
    } else {
      incidentTrend.push(newTrendRow);
    }
  }

  // 4. MSI Parameters (12 key parameters)
  const msiMap = [
    { title: "Accident Mgmt", col: ["accidentManagement", "accident_management"] },
    { title: "Permit to Work (PTW)", col: ["ptwLoto", "ptw_loto", "ptwloto"] },
    { title: "Electrical Safety", col: ["electricalSafety", "electrical_safety", "electrical"] },
    { title: "PIT / Forklifts", col: ["pits", "pit_forklift"] },
    { title: "Chemical Safety", col: ["materialHandling", "material_handling", "chemical", "chemicalSafety"] },
    { title: "Machine Guarding", col: ["machineSafety", "machine_safety", "machine"] },
    { title: "EHS Committee Meetings", col: ["employeeWelfare", "employee_welfare", "committee"] },
    { title: "Gemba Walks Compliance", col: ["monitoringReview", "monitoring_review", "gembaWalks"] },
    { title: "EHS Training Compliance", col: ["trainingAwareness", "training_awareness", "training"] },
    { title: "Mock Drills Auditing", col: ["fireSafety", "fire_safety", "drills"] },
    { title: "EHS Legal Compliance", col: ["dockSafety", "dock_safety", "legal"] },
    { title: "Waste Management Plan", col: ["rackSafety", "rack_safety", "waste"] }
  ];

  const msiParameters: MSIParameterData[] = msiMap.map(item => {
    const val = safeNumber(getLooseValue(row, item.col), 90);
    const score = `${(val / 10).toFixed(val % 10 === 0 ? 0 : 1)}/10`;
    return {
      title: item.title,
      score,
      percentage: val
    };
  });

  // 5. Gemba Walks
  const gembaWalkCount = safeNumber(getLooseValue(row, ["gembaWalkCount", "walksCount", "gembaWalks", "walks"]), 24);
  const gembaCompliance = safeNumber(getLooseValue(row, ["gembaCompliance", "compliance"]), 96);
  const gembaMTDObservation = safeNumber(getLooseValue(row, ["gembaMTDObservation", "mtdObs", "observations"]), 12);
  const gembaYTDObservation = safeNumber(getLooseValue(row, ["gembaYTDObservation", "ytdObs", "ytdObservations"]), 110);
  const gembaClosureCompliance = safeNumber(getLooseValue(row, ["gembaClosureCompliance", "closurePct", "closure"]), 91);

  // Gemba trend update
  const gembaTrend = currentStore.gembaData?.trend ? [...currentStore.gembaData.trend] : [];
  let gembaMonthKey = "May";
  if (parts.length >= 1) {
    gembaMonthKey = parts[0].slice(0, 3);
  }
  const gembaTrendIndex = gembaTrend.findIndex(item => item.name.toLowerCase() === gembaMonthKey.toLowerCase());
  const newGembaTrendRow = {
    name: gembaMonthKey,
    Observations: gembaMTDObservation,
    Closed: Math.round(gembaMTDObservation * gembaClosureCompliance / 100)
  };
  if (gembaTrendIndex !== -1) {
    gembaTrend[gembaTrendIndex] = newGembaTrendRow;
  } else {
    if (gembaTrend.length > 0) {
      gembaTrend[gembaTrend.length - 1] = newGembaTrendRow;
    } else {
      gembaTrend.push(newGembaTrendRow);
    }
  }

  const gembaData: GembaWalkData = {
    walksCount: gembaWalkCount,
    compliance: gembaCompliance,
    mtdObs: gembaMTDObservation,
    ytdObs: gembaYTDObservation,
    closurePct: gembaClosureCompliance,
    trend: gembaTrend
  };

  // 6. Critical Issues
  const criticalIssues: CriticalIssue[] = [];
  const ci1 = getLooseValue(row, ["criticalIssue1", "critical_issue_1", "issue1"]);
  const ci2 = getLooseValue(row, ["criticalIssue2", "critical_issue_2", "issue2"]);
  const ci3 = getLooseValue(row, ["criticalIssue3", "critical_issue_3", "issue3"]);
  if (ci1) {
    criticalIssues.push({ id: 1, issue: safeString(ci1), area: "Chemical Store A", status: "Open" });
  }
  if (ci2) {
    criticalIssues.push({ id: 2, issue: safeString(ci2), area: "Work Area C", status: "Open" });
  }
  if (ci3) {
    criticalIssues.push({ id: 3, issue: safeString(ci3), area: "Main Power Substation", status: "Open" });
  }
  if (criticalIssues.length === 0) {
    criticalIssues.push(
      { id: 1, issue: "Non-compliance with LOTO / PTW isolation check in Area-C maintenance hangar today", area: "Work Area C", status: "Open" },
      { id: 2, issue: "Improper storage of flammable chemicals near electrical cabinets", area: "Chemical Store A", status: "Open" }
    );
  }

  // 7. Body Part Injuries (Direct Visual-Anatomical Mapping)
  const bodyPartInjuries: BodyPartInjury[] = [
    { id: "head", name: "Head", count: safeNumber(getLooseValue(row, ["headInjuries", "head_injuries", "headinjuries", "head"]), 0) },
    { id: "face", name: "Face", count: safeNumber(getLooseValue(row, ["faceInjuries", "face_injuries", "faceinjuries", "face"]), 0) },
    { id: "hand", name: "Hand", count: safeNumber(getLooseValue(row, ["handInjuries", "hand_injuries", "handinjuries", "hand"]), 0) },
    { id: "finger", name: "Finger", count: safeNumber(getLooseValue(row, ["fingerInjuries", "finger_injuries", "fingerinjuries", "finger"]), 0) },
    { id: "leg", name: "Leg", count: safeNumber(getLooseValue(row, ["legInjuries", "leg_injuries", "leginjuries", "leg"]), 0) },
    { id: "foot", name: "Foot", count: safeNumber(getLooseValue(row, ["footInjuries", "foot_injuries", "footinjuries", "foot"]), 0) },
    { id: "others", name: "Others (Torso)", count: safeNumber(getLooseValue(row, ["otherInjuries", "other_injuries", "otherinjuries", "others", "torso"]), 0) }
  ];

  // 8. Fire & Environmental telemetry
  const fireCount = safeNumber(getLooseValue(row, ["fireIncidents", "fire_incidents", "fire", "fireSafety"]), 0);
  const fireIncidents = {
    value: fireCount,
    change: fireCount > 0 ? "Active alert" : "Nominal"
  };
  const envMajor = safeNumber(getLooseValue(row, ["environmentMajor", "environment_major", "envMajor"]), 0);
  const envMinor = safeNumber(getLooseValue(row, ["environmentMinor", "environment_minor", "envMinor"]), 0);
  const envIncidents = {
    value: envMajor + envMinor,
    change: "Monitored"
  };

  // 9. Committee Meetings
  const cMeetingDone = safeString(getLooseValue(row, ["committeeMeetingDone", "committee_meeting_done", "committeeMeeting", "meetingDone"]), "Yes");
  const cMomShared = safeString(getLooseValue(row, ["committeeMomShared", "committee_mom_shared", "momShared", "mom"]), "Yes");
  const committeeMeetings: CommitteeMeetingRow[] = [
    { label: "Meeting Done?", val: cMeetingDone, textClass: cMeetingDone.toLowerCase() === "yes" ? "text-emerald-400 font-bold" : "text-rose-400 font-bold" },
    { label: "MOM Shared?", val: cMomShared, textClass: cMomShared.toLowerCase() === "yes" ? "text-emerald-400 font-bold" : "text-rose-400 font-bold" },
    { label: "Monthly Points", val: safeString(getLooseValue(row, ["committeeMonthlyPoints", "committee_monthly_points", "monthlyPoints"]), "12"), textClass: "text-slate-100 font-mono" },
    { label: "YTD Points", val: safeString(getLooseValue(row, ["committeeYTDPoints", "committee_ytd_points", "ytdPoints"]), "45"), textClass: "text-slate-100 font-mono" },
    { label: "Monthly Compliance %", val: `${safeNumber(getLooseValue(row, ["committeeClosureCompliance", "closureCompliance", "compliance"]), 88)}%`, textClass: "text-emerald-400 font-mono font-bold" },
    { label: "YTD Closure %", val: `${safeNumber(getLooseValue(row, ["committeeClosureCompliance", "closureCompliance", "compliance"]), 90)}%`, textClass: "text-emerald-400 font-mono font-bold" }
  ];

  // 10. Training matrix
  const tSessions = safeNumber(getLooseValue(row, ["trainingSessions", "training_sessions", "sessions"]), 6);
  const tHeadcount = safeNumber(getLooseValue(row, ["trainingHeadcount", "training_headcount", "headcount", "trainingh"]), 320);
  const aSessions = safeNumber(getLooseValue(row, ["awarenessSessions", "awareness_sessions", "awareness"]), 4);
  const aHeadcount = safeNumber(getLooseValue(row, ["awarenessHeadcount", "awareness_headcount"]), 280);
  const iSessions = safeNumber(getLooseValue(row, ["inductionSessions", "induction_sessions", "induction"]), 15);
  const iHeadcount = safeNumber(getLooseValue(row, ["inductionHeadcount", "induction_headcount"]), 75);
  
  const trainingSessions: TrainingRow[] = [
    { type: "Training Sessions", sessions: tSessions, headcount: tHeadcount },
    { type: "Awareness Sessions", sessions: aSessions, headcount: aHeadcount },
    { type: "Induction Sessions", sessions: iSessions, headcount: iHeadcount }
  ];

  // 11. Safety compliance audits
  const auditCompliance: AuditGaugeData[] = [
    { title: "Ambulance Audit", percentage: safeNumber(getLooseValue(row, ["ambulanceAuditScore", "ambulanceAudit", "ambulance"]), 82), colorType: "cyan" },
    { title: "Wellness Room", percentage: safeNumber(getLooseValue(row, ["wellnessAuditScore", "wellnessAudit", "wellnessRoom"]), 88), colorType: "emerald" },
    { title: "Bus Safety Audit", percentage: safeNumber(getLooseValue(row, ["busAuditScore", "busAudit", "busSafety"]), 76), colorType: "amber" },
    { title: "Conveyor Audit", percentage: safeNumber(getLooseValue(row, ["conveyorAuditScore", "conveyorAudit", "conveyor"]), 79), colorType: "purple" }
  ];

  // 12. Mock Drills
  const mDrillDone = safeString(getLooseValue(row, ["mockDrillDone", "drillConducted", "drillDone"]), "Yes");
  const mDrillTopic = safeString(getLooseValue(row, ["mockDrillTopic", "drillType", "drillTopic"]), "Fire Evacuation");
  const mDrillObs1 = safeString(getLooseValue(row, ["mockDrillObservation1", "drillObservation1", "observation1"]), "Evacuated in 4.2 min");
  const mDrillObs2 = safeString(getLooseValue(row, ["mockDrillObservation2", "drillObservation2", "observation2"]), "Communication delay observed");
  const mockDrills: MockDrillRow[] = [
    { label: "Drill Conducted", val: mDrillDone, valClass: mDrillDone.toLowerCase() === "yes" ? "text-emerald-400 font-bold" : "text-rose-400 font-bold" },
    { label: "Drill Type", val: mDrillTopic, valClass: "text-slate-300 font-semibold" },
    { label: "Observation 1", val: mDrillObs1, valClass: "text-slate-400 text-[10px] leading-tight" },
    { label: "Observation 2", val: mDrillObs2, valClass: "text-slate-400 text-[10px] leading-tight" }
  ];

  // 13. Achievements & Milestones
  const milestones: string[] = [];
  const ach1 = getLooseValue(row, ["achievement1", "achievement_1", "achievement", "milestone1"]);
  const ach2 = getLooseValue(row, ["achievement2", "achievement_2", "milestone2"]);
  if (ach1) milestones.push(safeString(ach1));
  if (ach2) milestones.push(safeString(ach2));
  if (milestones.length === 0) {
    milestones.push(
      "ZERO LTI for 3 consecutive months - 91 LTI-free days achieved",
      "MSI Score improved by 8 points vs previous month"
    );
  }

  return {
    facility,
    region,
    reportMonth,
    reportDate,
    siteGM,
    siteLead,
    ehsLead,
    kpiStats,
    incidentBreakdown,
    incidentTrend,
    msiParameters,
    msiScore: finalMSIScore,
    gembaData,
    criticalIssues,
    bodyPartInjuries,
    fireIncidents,
    envIncidents,
    committeeMeetings,
    trainingSessions,
    auditCompliance,
    mockDrills,
    milestones,
    lastUpdated: new Date().toISOString()
  };
}

/**
 * Complete, safe parser orchestrator. 
 */
export function transformSheetWebhook(payload: RawSheetPayload, currentStore: DashboardData): DashboardData {
  const sheetName = safeString(payload.sheetName).toLowerCase();
  const rows = payload.sheetData || [];

  const firstRow = rows[0];
  let isFlatFormat = false;
  if (firstRow && typeof firstRow === "object") {
    const keys = Object.keys(firstRow).map(k => k.toLowerCase().replace(/[^a-z0-9]/g, ""));
    isFlatFormat = (
      keys.includes("ehslead") ||
      keys.includes("nearmiss") ||
      keys.includes("headinjuries") ||
      keys.includes("finalmsiscore") ||
      keys.includes("sitegm") ||
      keys.includes("losttimeaccident") ||
      keys.includes("reportmonth") ||
      keys.includes("facility")
    );
  }

  if (isFlatFormat) {
    console.log(`[Transformer] Flat high-density EHS sheet format detected in payload (sheet: "${payload.sheetName}"). Processing ${rows.length} rows...`);
    try {
      const parsedRecords = rows.map(row => parseFlatSheetRow(row, currentStore));
      const activeState = { ...parsedRecords[0] };
      activeState.records = parsedRecords;
      return activeState;
    } catch (err) {
      console.error("[Transformer Error] Failed to parse flat EHS sheet rows:", err);
      return currentStore;
    }
  }

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
