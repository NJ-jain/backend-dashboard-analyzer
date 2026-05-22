"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const dotenv_1 = __importDefault(require("dotenv"));
const stream_route_js_1 = __importDefault(require("./routes/stream.route.js"));
const update_route_js_1 = __importDefault(require("./routes/update.route.js"));
const heartbeat_service_js_1 = require("./services/heartbeat.service.js");
const store_service_js_1 = require("./services/store.service.js");
const errorHandler_js_1 = require("./middleware/errorHandler.js");
// Load environment variables
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
// 1. Security Headers via Helmet
// Relax contentSecurityPolicy to avoid SSE streaming issues or console warnings
app.use((0, helmet_1.default)({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));
// 2. Cross-Origin Resource Sharing (CORS) Configuration
const allowedOrigins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    process.env.FRONTEND_URL || ""
].filter(Boolean);
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, or server-to-server)
        if (!origin)
            return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes("*") || process.env.CORS_ALLOW_ALL === "true") {
            return callback(null, true);
        }
        else {
            console.warn(`[CORS] Request blocked from origin: ${origin}`);
            return callback(new Error("Blocked by CORS policy"));
        }
    },
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));
// 3. Body Parsing Middleware
app.use(express_1.default.json({ limit: "5mb" }));
app.use(express_1.default.urlencoded({ extended: true, limit: "5mb" }));
// 4. API Endpoints Mounting
app.use("/api", stream_route_js_1.default);
app.use("/api", update_route_js_1.default);
// Health check endpoint for container platform (Railway, Nixpacks)
app.get("/health", (_req, res) => {
    res.status(200).json({
        status: "UP",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        connectionsCount: store_service_js_1.sseClients.size
    });
});
// Root greeting endpoint
app.get("/", (_req, res) => {
    res.status(200).send("EHS Realtime Telemetry Platform Node Backend (Railway Active)");
});
// 5. Centralized Error Handler (Must be registered last)
app.use(errorHandler_js_1.errorHandler);
// 6. Start Server and Initialize Heartbeat Ping Loop
const server = app.listen(PORT, () => {
    console.log(`===========================================================`);
    console.log(`🚀 EHS Telemetry server running on: http://localhost:${PORT}`);
    console.log(`⚙️  Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`📦 SSE Heartbeat rate: 25s`);
    console.log(`===========================================================`);
    (0, heartbeat_service_js_1.startHeartbeat)();
});
// 7. Graceful Shutdown handlers
const gracefulShutdown = (signal) => {
    console.log(`[${signal}] Initiating graceful shutdown sequence...`);
    (0, heartbeat_service_js_1.stopHeartbeat)();
    server.close(() => {
        console.log("Telemetry database connection and Express server closed.");
        process.exit(0);
    });
    // Force close after 10s if sockets remain open
    setTimeout(() => {
        console.error("Force shutting down telemetry server (sockets remained open).");
        process.exit(1);
    }, 10000);
};
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
