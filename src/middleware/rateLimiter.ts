/**
 * sliding-window / fixed-window rate limiter middleware for Webhook POST API.
 * Keeps track of requests per IP in memory, resetting keys after the window closes,
 * and includes automated garbage collection to avoid memory leaks.
 */

import { Request, Response, NextFunction } from "express";

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitRecord>();

const WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_REQUESTS = 30; // Max 30 requests per minute per IP

/**
 * Checks if a given IP has exceeded its request threshold in the current window.
 * Returns true if the IP is rate limited.
 */
function isRateLimited(ip: string): { limited: boolean; limit: number; remaining: number; resetTime: number } {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record) {
    const resetTime = now + WINDOW_MS;
    rateLimitMap.set(ip, {
      count: 1,
      resetTime
    });
    return { limited: false, limit: MAX_REQUESTS, remaining: MAX_REQUESTS - 1, resetTime };
  }

  // Reset the window if it has expired
  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + WINDOW_MS;
    return { limited: false, limit: MAX_REQUESTS, remaining: MAX_REQUESTS - 1, resetTime: record.resetTime };
  }

  record.count++;
  const limited = record.count > MAX_REQUESTS;
  return {
    limited,
    limit: MAX_REQUESTS,
    remaining: Math.max(0, MAX_REQUESTS - record.count),
    resetTime: record.resetTime
  };
}

/**
 * Clears expired records from memory to prevent memory bloat over time.
 */
export function pruneRateLimitMap(): void {
  const now = Date.now();
  let prunedCount = 0;
  
  for (const [ip, record] of rateLimitMap.entries()) {
    if (now > record.resetTime) {
      rateLimitMap.delete(ip);
      prunedCount++;
    }
  }
  
  if (prunedCount > 0) {
    console.log(`[RateLimiter] Background prune completed. Removed ${prunedCount} expired records.`);
  }
}

// Register background pruning every 5 minutes
const pruningInterval = setInterval(() => {
  try {
    pruneRateLimitMap();
  } catch (err) {
    console.error("[RateLimiter] Error running pruning interval:", err);
  }
}, 5 * 60 * 1000);

if (typeof pruningInterval.unref === "function") {
  pruningInterval.unref();
}

/**
 * Express middleware to rate limit incoming requests
 */
export const rateLimiter = (req: Request, res: Response, next: NextFunction): void => {
  // Extract client IP address safely, checking x-forwarded-for if behind proxies
  const forwarded = req.headers["x-forwarded-for"];
  const ip = typeof forwarded === "string" 
    ? forwarded.split(",")[0].trim() 
    : req.socket.remoteAddress || "unknown-ip";

  const { limited, limit, remaining, resetTime } = isRateLimited(ip);

  // Set standard rate limit headers
  res.setHeader("X-RateLimit-Limit", limit);
  res.setHeader("X-RateLimit-Remaining", remaining);
  res.setHeader("X-RateLimit-Reset", Math.ceil(resetTime / 1000));

  if (limited) {
    console.warn(`[RateLimiter] IP ${ip} throttled. Threshold exceeded (${limit} req/min)`);
    res.status(429).json({
      success: false,
      error: "Too Many Requests",
      message: "API rate limit exceeded. Please try again later.",
      retryAfterSeconds: Math.ceil((resetTime - Date.now()) / 1000)
    });
    return;
  }

  next();
};
