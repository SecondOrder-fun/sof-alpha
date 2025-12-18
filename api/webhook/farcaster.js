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

  // Return 200 immediately for Base App compatibility
  // Base App waits for webhook response before activating tokens
  try {
    const body = await request.json();

    // Log full payload for debugging
    console.log("[Webhook] Raw payload:", JSON.stringify(body));

    // Handle both signed (Base/Farcaster) and unsigned formats
    // Signed format has: header, payload, signature wrapping the event data
    // Unsigned format has: event, fid, notificationDetails directly

    let eventData;

    if (body.header && body.payload && body.signature) {
      // Signed webhook format - decode the payload
      try {
        const payloadStr = atob(body.payload);
        eventData = JSON.parse(payloadStr);
        console.log(
          "[Webhook] Decoded signed payload:",
          JSON.stringify(eventData)
        );
      } catch (decodeError) {
        console.error(
          "[Webhook] Failed to decode signed payload:",
          decodeError
        );
        // Still return 200 to not block the add
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    } else {
      // Direct format (legacy or test)
      eventData = body;
    }

    const event = eventData.event;
    const fid = eventData.fid;
    const notificationDetails = eventData.notificationDetails;

    console.log(
      "[Webhook] Event:",
      JSON.stringify({ event, fid, hasNotifications: !!notificationDetails })
    );

    switch (event) {
      case "miniapp_added":
        if (notificationDetails?.token) {
          console.log(`[Webhook] User ${fid} added app with notifications`);
        } else {
          console.log(`[Webhook] User ${fid} added app`);
        }
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

    // Return 200 to acknowledge receipt
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Webhook Error]", error);

    // Return 200 anyway - don't block the add operation
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}
