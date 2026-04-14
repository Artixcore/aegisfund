import { ENV } from "./env";

export type NotificationPayload = {
  title: string;
  content: string;
};

const TITLE_MAX_LENGTH = 1200;
const CONTENT_MAX_LENGTH = 20000;

const trimValue = (value: string): string => value.trim();
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const validatePayload = (input: NotificationPayload): NotificationPayload => {
  if (!isNonEmptyString(input.title)) {
    throw new Error("Notification title is required.");
  }
  if (!isNonEmptyString(input.content)) {
    throw new Error("Notification content is required.");
  }

  const title = trimValue(input.title);
  const content = trimValue(input.content);

  if (title.length > TITLE_MAX_LENGTH) {
    throw new Error(`Notification title must be at most ${TITLE_MAX_LENGTH} characters.`);
  }

  if (content.length > CONTENT_MAX_LENGTH) {
    throw new Error(`Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`);
  }

  return { title, content };
};

/**
 * Sends a JSON payload to NOTIFICATION_WEBHOOK_URL when configured.
 * Otherwise logs and returns false (callers should not treat as fatal).
 */
export async function notifyOwner(payload: NotificationPayload): Promise<boolean> {
  const { title, content } = validatePayload(payload);
  const url = ENV.notificationWebhookUrl?.trim();

  if (!url) {
    console.warn("[Notification] NOTIFICATION_WEBHOOK_URL not set; skipping:", title);
    return false;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ title, content }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(`[Notification] Webhook ${response.status}: ${detail}`);
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Webhook error:", error);
    return false;
  }
}
