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

export const config = {
  runtime: "edge",
};

export default async function handler(request) {
  // Only accept POST requests
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await request.json();

    // Log the full payload
    console.log("[Webhook] Body:", JSON.stringify(body));

    const { event, fid, notificationDetails } = body;

    if (event === "miniapp_added") {
      console.log(`[Webhook] User ${fid} added app`);
    } else if (event === "notifications_enabled") {
      console.log(`[Webhook] User ${fid} enabled notifications`);
    } else if (event === "notifications_disabled") {
      console.log(`[Webhook] User ${fid} disabled notifications`);
    } else if (event === "miniapp_removed") {
      console.log(`[Webhook] User ${fid} removed app`);
    } else {
      console.log(`[Webhook] Event: ${event}, fid: ${fid}`);
    }

    // Return 200 to acknowledge receipt
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Webhook] Error:", error.message);
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}
