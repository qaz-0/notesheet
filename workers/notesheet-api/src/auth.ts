// Authentication routes

import { Hono } from "hono";
import type {
  Env,
  DeviceRegistrationRequest,
  DeviceRegistrationResponse,
  PairRequest,
  LinkResponse,
} from "./types";
import {
  generateToken,
  hashToken,
  createAccount,
  createDevice,
  createPairingCode,
  getPairingCode,
  deletePairingCode,
  mergeAccounts,
  getDeviceByTokenHash,
} from "./db";

export const authRoutes = new Hono<{ Bindings: Env }>();

// Register a new device
// Creates a new account if this is a fresh device
authRoutes.post("/device", async (c) => {
  try {
    const body = await c.req.json<DeviceRegistrationRequest>();

    if (!body.deviceId) {
      return c.json({ error: "deviceId is required" }, 400);
    }

    // Create a new account for this device
    const account = await createAccount(c.env.DB);

    // Generate auth token
    const token = generateToken();
    const tokenHash = await hashToken(token);

    // Create device linked to the new account
    await createDevice(
      c.env.DB,
      body.deviceId,
      account.id,
      tokenHash,
      body.name,
    );

    const response: DeviceRegistrationResponse = {
      token,
      accountId: account.id,
    };

    return c.json(response, 201);
  } catch (error) {
    console.error("Device registration error:", error);
    return c.json({ error: "Failed to register device" }, 500);
  }
});

// Generate a pairing code for linking another device
// Requires authentication
authRoutes.post("/link", async (c) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const token = authHeader.slice(7);
  const tokenHash = await hashToken(token);
  const device = await getDeviceByTokenHash(c.env.DB, tokenHash);

  if (!device) {
    return c.json({ error: "Invalid token" }, 401);
  }

  try {
    const code = await createPairingCode(c.env.DB, device.account_id);
    const expiresAt = Date.now() + 10 * 60 * 1000;

    const response: LinkResponse = {
      code,
      expiresAt,
    };

    return c.json(response);
  } catch (error) {
    console.error("Link code generation error:", error);
    return c.json({ error: "Failed to generate pairing code" }, 500);
  }
});

// Pair a device with an existing account using a code
// Requires authentication (device must already be registered)
authRoutes.post("/pair", async (c) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const token = authHeader.slice(7);
  const tokenHash = await hashToken(token);
  const device = await getDeviceByTokenHash(c.env.DB, tokenHash);

  if (!device) {
    return c.json({ error: "Invalid token" }, 401);
  }

  try {
    const body = await c.req.json<PairRequest>();

    if (!body.code) {
      return c.json({ error: "Pairing code is required" }, 400);
    }

    // Look up the pairing code
    const pairingCode = await getPairingCode(c.env.DB, body.code.toUpperCase());

    if (!pairingCode) {
      return c.json({ error: "Invalid or expired pairing code" }, 400);
    }

    // Check if already on the same account
    if (device.account_id === pairingCode.account_id) {
      await deletePairingCode(c.env.DB, pairingCode.code);
      return c.json({
        accountId: device.account_id,
        message: "Already linked to this account",
      });
    }

    // Merge current device's account into the target account
    await mergeAccounts(c.env.DB, device.account_id, pairingCode.account_id);

    // Delete the used pairing code
    await deletePairingCode(c.env.DB, pairingCode.code);

    return c.json({
      accountId: pairingCode.account_id,
      message: "Device paired successfully",
    });
  } catch (error) {
    console.error("Pairing error:", error);
    return c.json({ error: "Failed to pair device" }, 500);
  }
});
