// Main entry point for the Notesheet API Worker

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import { authMiddleware } from "./middleware";
import { authRoutes } from "./auth";
import { syncRoutes } from "./sync";

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for all origins (adjust in production)
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["Content-Length"],
    maxAge: 86400,
  }),
);

// Health check endpoint
app.get("/", (c) => {
  return c.json({
    name: "Notesheet Sync API",
    version: "1.0.0",
    status: "ok",
  });
});

// Auth routes (no auth middleware - these handle registration)
app.route("/api/auth", authRoutes);

// Sync routes (require authentication)
app.use("/api/sync/*", authMiddleware);
app.route("/api/sync", syncRoutes);

// 404 handler
app.notFound((c) => {
  return c.json({ error: "Not found" }, 404);
});

// Error handler
app.onError((error, c) => {
  console.error("Unhandled error:", error);
  return c.json({ error: "Internal server error" }, 500);
});

export default app;
