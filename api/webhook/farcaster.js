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

// Decode base64url encoded string (per Base template)
function decodeBase64Url(encoded) {
  // Convert base64url to base64
  let base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  // Add padding if needed
  while (base64.length % 4) {
    base64 += "=";
  }
  return JSON.parse(atob(base64));
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
    const body = await request.json();

    // Log raw payload for debugging
    console.log("[Webhook] Raw:", JSON.stringify(body));

    let eventData;
    let headerData;

    // Check for signed format (Base App / Farcaster signed webhooks)
    // Format: { header: base64url, payload: base64url, signature: string }
    if (body.header && body.payload) {
      try {
        headerData = decodeBase64Url(body.header);
        eventData = decodeBase64Url(body.payload);
        console.log("[Webhook] Header:", JSON.stringify(headerData));
        console.log("[Webhook] Event:", JSON.stringify(eventData));
      } catch (decodeError) {
        console.error("[Webhook] Decode error:", decodeError.message);
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    } else {
      // Direct format (legacy or test)
      eventData = body;
      console.log("[Webhook] Direct format:", JSON.stringify(eventData));
    }

    const event = eventData.event;
    const fid = headerData?.fid || eventData.fid;
    const notificationDetails = eventData.notificationDetails;

    console.log(
      "[Webhook] Parsed:",
      JSON.stringify({ event, fid, hasNotifications: !!notificationDetails })
    );

    switch (event) {
      case "miniapp_added":
        console.log(
          `[Webhook] User ${fid} added app${
            notificationDetails ? " with notifications" : ""
          }`
        );
        break;
      case "notifications_enabled":
        console.log(`[Webhook] User ${fid} enabled notifications`);
        break;
      case "notifications_disabled":
        console.log(`[Webhook] User ${fid} disabled notifications`);
        break;
      case "miniapp_removed":
        console.log(`[Webhook] User ${fid} removed app`);
        break;
      default:
        console.log(`[Webhook] Unknown event: ${event}`);
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
