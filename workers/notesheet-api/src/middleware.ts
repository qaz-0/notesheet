// Authentication middleware

import type { Context, Next } from "hono";
import type { Env, AuthContext } from "./types";
import { hashToken, getDeviceByTokenHash, updateDeviceLastSeen } from "./db";

// Extend Hono context with auth info
declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

export async function authMiddleware(
  c: Context<{ Bindings: Env }>,
  next: Next,
) {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  const token = authHeader.slice(7); // Remove 'Bearer ' prefix

  if (!token) {
    return c.json({ error: "Missing token" }, 401);
  }

  try {
    const tokenHash = await hashToken(token);
    const device = await getDeviceByTokenHash(c.env.DB, tokenHash);

    if (!device) {
      return c.json({ error: "Invalid token" }, 401);
    }

    // Update last seen timestamp (fire and forget)
    c.executionCtx.waitUntil(updateDeviceLastSeen(c.env.DB, device.id));

    // Set auth context
    c.set("auth", {
      accountId: device.account_id,
      deviceId: device.id,
    });

    await next();
  } catch (error) {
    console.error("Auth error:", error);
    return c.json({ error: "Authentication failed" }, 500);
  }
}
