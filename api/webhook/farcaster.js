/**
 * Farcaster Mini App Webhook Handler
 * Receives events when users add the app, enable/disable notifications
 *
 * Events:
 * - miniapp_added: User added the mini app
 * - notifications_enabled: User enabled notifications
 * - notifications_disabled: User disabled notifications
 * - miniapp_removed: User removed the mini app
 */

import { parseWebhookEvent } from "@farcaster/miniapp-node";

// Simple verification function that accepts all app keys (for development)
// In production, use verifyAppKeyWithNeynar with a Neynar API key
async function verifyAppKey(fid, appKey) {
  // Accept all keys for now - in production, verify with Neynar
  return true;
}

export default async function handler(request) {
  // Only accept POST requests
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const requestJson = await request.json();

    // Log raw payload for debugging
    console.log("[Webhook] Raw:", JSON.stringify(requestJson));

    // Parse the webhook event using the official SDK
    let data;
    try {
      data = await parseWebhookEvent(requestJson, verifyAppKey);
    } catch (parseError) {
      console.error("[Webhook] Parse error:", parseError.message);
      // Still return 200 to not block the add
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const fid = data.fid;
    const appFid = data.appFid;
    const event = data.event;

    console.log(
      "[Webhook] Parsed - fid:",
      fid,
      "appFid:",
      appFid,
      "event:",
      event?.event
    );

    // Handle different event types
    switch (event?.event) {
      case "miniapp_added":
        console.log(`[Webhook] User ${fid} added app to client ${appFid}`);
        if (event.notificationDetails) {
          console.log("[Webhook] Notifications enabled");
        }
        break;
      case "miniapp_removed":
        console.log(`[Webhook] User ${fid} removed app from client ${appFid}`);
        break;
      case "notifications_enabled":
        console.log(
          `[Webhook] User ${fid} enabled notifications on client ${appFid}`
        );
        break;
      case "notifications_disabled":
        console.log(
          `[Webhook] User ${fid} disabled notifications on client ${appFid}`
        );
        break;
      default:
        console.log(`[Webhook] Unknown event type: ${event?.event}`);
    }

    // Return 200 to acknowledge receipt - Base App waits for this
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Webhook] Error:", error.message);
    // Return 200 anyway - don't block the add operation
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}
