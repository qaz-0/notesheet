// Sync routes

import { Hono } from "hono";
import type {
  Env,
  SyncRequest,
  SyncResponse,
  SyncAction,
  ActionRow,
} from "./types";
import {
  insertAction,
  getActionsSince,
  getAllActions,
  getLatestServerSeq,
} from "./db";

export const syncRoutes = new Hono<{ Bindings: Env }>();

// Main sync endpoint - push local actions, receive remote actions
syncRoutes.post("/", async (c) => {
  const auth = c.get("auth");

  try {
    const body = await c.req.json<SyncRequest>();
    const { actions = [], lastServerSeq = 0 } = body;

    const accepted: number[] = [];

    // Insert each action into the database
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];

      try {
        await insertAction(
          c.env.DB,
          auth.accountId,
          auth.deviceId,
          action.action,
          action.args,
          action.timestamp,
          action.vectorClock,
        );
        accepted.push(i);
      } catch (error) {
        console.error(`Failed to insert action ${i}:`, error);
        // Continue with other actions
      }
    }

    // Fetch new actions from other devices
    const newActionRows = await getActionsSince(
      c.env.DB,
      auth.accountId,
      lastServerSeq,
      auth.deviceId, // Exclude actions from this device
    );

    // Convert to SyncAction format
    const newActions: SyncAction[] = newActionRows.map((row) => ({
      action: row.action_type,
      args: JSON.parse(row.action_args),
      timestamp: row.client_timestamp,
      deviceId: row.device_id,
      vectorClock: JSON.parse(row.vector_clock),
      serverSeq: row.server_seq,
    }));

    // Get the latest server sequence number
    const latestServerSeq = await getLatestServerSeq(c.env.DB, auth.accountId);

    const response: SyncResponse = {
      accepted,
      newActions,
      latestServerSeq,
    };

    return c.json(response);
  } catch (error) {
    console.error("Sync error:", error);
    return c.json({ error: "Sync failed" }, 500);
  }
});

// Full sync - get all actions for account (for new devices or recovery)
syncRoutes.get("/full", async (c) => {
  const auth = c.get("auth");

  try {
    const allActionRows = await getAllActions(c.env.DB, auth.accountId);

    const actions: SyncAction[] = allActionRows.map((row) => ({
      action: row.action_type,
      args: JSON.parse(row.action_args),
      timestamp: row.client_timestamp,
      deviceId: row.device_id,
      vectorClock: JSON.parse(row.vector_clock),
      serverSeq: row.server_seq,
    }));

    const latestServerSeq =
      allActionRows.length > 0
        ? allActionRows[allActionRows.length - 1].server_seq
        : 0;

    return c.json({
      actions,
      serverSeq: latestServerSeq,
    });
  } catch (error) {
    console.error("Full sync error:", error);
    return c.json({ error: "Full sync failed" }, 500);
  }
});

// Status endpoint - check sync status
syncRoutes.get("/status", async (c) => {
  const auth = c.get("auth");

  try {
    const latestServerSeq = await getLatestServerSeq(c.env.DB, auth.accountId);

    return c.json({
      accountId: auth.accountId,
      deviceId: auth.deviceId,
      latestServerSeq,
    });
  } catch (error) {
    console.error("Status error:", error);
    return c.json({ error: "Status check failed" }, 500);
  }
});
