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
    const { event, fid, notificationDetails } = body;

    // Log the event for debugging (in production, store in database)
    console.log(
      "[Farcaster Webhook]",
      JSON.stringify({
        event,
        fid,
        notificationDetails: notificationDetails
          ? {
              url: notificationDetails.url,
              tokenPrefix: notificationDetails.token?.substring(0, 10) + "...",
            }
          : null,
        timestamp: new Date().toISOString(),
      })
    );

    switch (event) {
      case "miniapp_added":
        // User added the mini app
        // Store FID and notification token if provided
        if (notificationDetails?.token) {
          // TODO: Store in database
          // await storeNotificationToken(fid, notificationDetails.token, notificationDetails.url);
          console.log(
            `[Farcaster] User ${fid} added app with notifications enabled`
          );
        } else {
          console.log(
            `[Farcaster] User ${fid} added app without notifications`
          );
        }
        break;

      case "notifications_enabled":
        // User enabled notifications after previously disabling
        if (notificationDetails?.token) {
          // TODO: Update token in database
          // await updateNotificationToken(fid, notificationDetails.token, notificationDetails.url);
          console.log(`[Farcaster] User ${fid} enabled notifications`);
        }
        break;

      case "notifications_disabled":
        // User disabled notifications
        // TODO: Mark token as inactive in database
        // await disableNotificationToken(fid);
        console.log(`[Farcaster] User ${fid} disabled notifications`);
        break;

      case "miniapp_removed":
        // User removed the mini app
        // TODO: Remove or mark inactive in database
        // await removeUser(fid);
        console.log(`[Farcaster] User ${fid} removed app`);
        break;

      default:
        console.log(`[Farcaster] Unknown event: ${event}`);
    }

    // Always return 200 to acknowledge receipt
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Farcaster Webhook Error]", error);

    // Return 200 anyway to prevent retries for malformed requests
    return new Response(
      JSON.stringify({ success: true, error: "Processing error" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
