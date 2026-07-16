/**
 * PocketBase server-side Javascript Hook (pb_hooks) for Church Announcements.
 * Triggered on model creation in the "announcements" collection.
 *
 * This hook automatically detects when a new active announcement is published,
 * and broadcasts a high-priority push notification to all subscribed church members.
 */

onModelAfterCreate((e) => {
    const announcement = e.model;

    // Only trigger notifications for published, non-scheduled announcements in active state
    if (announcement.get("status") !== "Active") {
        return;
    }

    const title = "📢 New Announcement";
    const rawTitle = announcement.get("title") || "";
    
    // Truncate first 60 chars of announcement title for the push notification body
    let body = rawTitle;
    if (body.length > 60) {
        body = body.substring(0, 57) + "...";
    }

    const clickAction = "/announcements"; // Opens the announcement module in the client app
    const category = announcement.get("tag") || "General";

    // 1. Fetch all active app device/push tokens from the 'members' or 'subscriptions' collection
    const records = $app.dao().findRecordsByFilter(
        "subscriptions",
        "active = true",
        "-created",
        1000 // Limit to first 1000 subscribers per chunk
    );

    if (!records || records.length === 0) {
        return;
    }

    console.log(`[Push Hook] Broad-casting announcement "${rawTitle}" to ${records.length} subscribers.`);

    // 2. Prepare the payload according to standard PWA WebPush or FCM structure
    const payload = {
        title: title,
        body: body,
        badge: "/icons/icon-96.png",
        icon: "/icons/icon-192.png",
        tag: "church-announcement",
        data: {
            url: clickAction,
            announcementId: announcement.id,
            category: category
        }
    };

    // 3. Dispatch the push notification payloads concurrently
    for (let record of records) {
        const pushToken = record.get("pushToken");
        if (!pushToken) continue;

        try {
            // Under normal production, we delegate to external web-push or Firebase Cloud Messaging API
            $http.send({
                url: "https://fcm.googleapis.com/fcm/send",
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "key=" + $os.getenv("FCM_SERVER_KEY")
                },
                body: JSON.stringify({
                    to: pushToken,
                    notification: {
                        title: payload.title,
                        body: payload.body,
                        click_action: payload.data.url
                    },
                    data: payload.data
                })
            });
        } catch (err) {
            console.warn(`[Push Hook] Failed to deliver push to subscriber ${record.id}: ${err}`);
        }
    }
}, "announcements");
