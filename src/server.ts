import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import streamRouter from "./routes/stream.route.js";
import updateRouter from "./routes/update.route.js";
import { startHeartbeat, stopHeartbeat } from "./services/heartbeat.service.js";
import { sseClients } from "./services/store.service.js";
import { errorHandler } from "./middleware/errorHandler.js";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// 1. Security Headers via Helmet
// Relax contentSecurityPolicy to avoid SSE streaming issues or console warnings
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);

// 2. Cross-Origin Resource Sharing (CORS) Configuration
const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  process.env.FRONTEND_URL || ""
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or server-to-server)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes("*") || process.env.CORS_ALLOW_ALL === "true") {
        return callback(null, true);
      } else {
        console.warn(`[CORS] Request blocked from origin: ${origin}`);
        return callback(new Error("Blocked by CORS policy"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

// 3. Body Parsing Middleware
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

// 4. API Endpoints Mounting
app.use("/api", streamRouter);
app.use("/api", updateRouter);

// Health check endpoint for container platform (Railway, Nixpacks)
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "UP",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    connectionsCount: sseClients.size
  });
});

// Root greeting endpoint
app.get("/", (_req, res) => {
  res.status(200).send("EHS Realtime Telemetry Platform Node Backend (Railway Active)");
});

// 5. Centralized Error Handler (Must be registered last)
app.use(errorHandler);

// 6. Start Server and Initialize Heartbeat Ping Loop
const server = app.listen(PORT, () => {
  console.log(`===========================================================`);
  console.log(`🚀 EHS Telemetry server running on: http://localhost:${PORT}`);
  console.log(`⚙️  Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`📦 SSE Heartbeat rate: 25s`);
  console.log(`===========================================================`);
  
  startHeartbeat();
});

// 7. Graceful Shutdown handlers
const gracefulShutdown = (signal: string) => {
  console.log(`[${signal}] Initiating graceful shutdown sequence...`);
  stopHeartbeat();
  
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
