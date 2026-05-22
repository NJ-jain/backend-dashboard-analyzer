"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
/**
 * Standardized Centralized Error Handler Middleware
 * Masks internal stack traces in production to prevent leakage, while reporting descriptive logs.
 */
const errorHandler = (err, req, res, _next) => {
    const statusCode = err.status || err.statusCode || 500;
    const isProduction = process.env.NODE_ENV === "production";
    // Log detailed error internally
    console.error(`[Error Handler] [${req.method} ${req.path}] Status ${statusCode}:`, err.stack || err.message || err);
    res.status(statusCode).json({
        success: false,
        error: statusCode === 500 ? "Internal Server Error" : (err.name || "Error"),
        message: statusCode === 500 && isProduction
            ? "An unexpected error occurred on the telemetry server."
            : (err.message || "Unknown error occurred."),
        ...(isProduction ? {} : { stack: err.stack })
    });
};
exports.errorHandler = errorHandler;
