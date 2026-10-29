// functions/index.js - RVM Auto Push on new alert
const { onValueCreated } = require("firebase-functions/v2/database");
const admin = require("firebase-admin");

admin.initializeApp();

// Trigger: When a new alert is created at /alerts/{alertId}
exports.sendPushOnNewAlert = onValueCreated("/alerts/{alertId}", async (event) => {
  const alertData = event.data.val();
  const alertId = event.params.alertId;

  console.log(`New alert ${alertId}:`, alertData);

  if (!alertData) return;

  // Don't send push for expired or inactive
  if (alertData.active === false) {
    console.log("Alert inactive, skipping push");
    return;
  }

  const title = alertData.title || alertData.badgeStatus || `${alertData.route} Alert`;
  const body = alertData.message || alertData.description || "Check app for details";
  const route = alertData.route || "SYSTEM";

  // Get all FCM tokens
  const tokensSnap = await admin.database().ref("fcmTokens").once("value");
  const tokensObj = tokensSnap.val();

  if (!tokensObj) {
    console.log("No tokens found");
    return;
  }

  const tokens = Object.values(tokensObj).map(t => t.token).filter(Boolean);

  if (tokens.length === 0) {
    console.log("Token list empty");
    return;
  }

  console.log(`Sending push to ${tokens.length} devices`);

  // Build FCM message
  const message = {
    notification: {
      title: title,
      body: body,
    },
    data: {
      title: title,
      body: body,
      route: route.toString(),
      alertId: alertId,
      url: "/rvmapp/status.html",
      click_action: "FLUTTER_NOTIFICATION_CLICK"
    },
    tokens: tokens, // multicast
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`${response.successCount} sent, ${response.failureCount} failed`);

    // Clean up invalid tokens
    const failedTokens = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const error = resp.error;
        console.log(`Failed for ${tokens[idx]}:`, error.code);
        // If token invalid, remove it
        if (error.code === "messaging/invalid-registration-token" || 
            error.code === "messaging/registration-token-not-registered") {
          failedTokens.push(tokens[idx]);
        }
      }
    });

    // Remove bad tokens from DB
    if (failedTokens.length > 0) {
      const allTokensSnap = await admin.database().ref("fcmTokens").once("value");
      const all = allTokensSnap.val() || {};
      for (const [key, val] of Object.entries(all)) {
        if (failedTokens.includes(val.token)) {
          await admin.database().ref(`fcmTokens/${key}`).remove();
          console.log(`Removed invalid token ${key}`);
        }
      }
    }

    return;
  } catch (e) {
    console.error("Error sending multicast:", e);
  }
});

// Optional: Send to topic instead (simpler, no token management)
// To use topics, have clients subscribe: messaging.subscribeToTopic(token, "rvm-alerts")
// Then use this function:

/*
exports.sendPushToTopic = onValueCreated("/alerts/{alertId}", async (event) => {
  const alertData = event.data.val();
  if (!alertData || alertData.active === false) return;

  const title = alertData.title || `${alertData.route} Alert`;
  const body = alertData.message || "Check app";

  await admin.messaging().send({
    notification: { title, body },
    data: {
      route: (alertData.route || "SYSTEM").toString(),
      url: "/rvmapp/status.html"
    },
    topic: "rvm-alerts"
  });
});
*/
