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

// Decode base64url to JSON
function decodeBase64Url(str) {
  // Replace base64url chars with base64 chars
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  // Add padding
  while (base64.length % 4) {
    base64 += "=";
  }
  // Decode
  const decoded = atob(base64);
  return JSON.parse(decoded);
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

    // Log raw payload
    console.log("[Webhook] Raw body:", JSON.stringify(body));

    let event, fid, notificationDetails;

    // Check if this is a signed payload (has header + payload fields)
    if (body.header && body.payload) {
      // Signed format - decode the base64url encoded parts
      const headerData = decodeBase64Url(body.header);
      const payloadData = decodeBase64Url(body.payload);

      console.log("[Webhook] Header:", JSON.stringify(headerData));
      console.log("[Webhook] Payload:", JSON.stringify(payloadData));

      fid = headerData.fid;
      event = payloadData.event;
      notificationDetails = payloadData.notificationDetails;
    } else {
      // Direct format
      event = body.event;
      fid = body.fid;
      notificationDetails = body.notificationDetails;
    }

    console.log("[Webhook] Event:", event, "FID:", fid);

    // Return 200 immediately - Base App requires fast response
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Webhook] Error:", error.message);
    // Still return 200 to not block the add
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}
