import { google, calendar_v3 } from "googleapis";
import crypto from "crypto";

function createOAuth2Client(redirectUri?: string) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
}

const oauth2Client = createOAuth2Client();

const pendingOAuthStates = new Map<string, { userId: string; redirectUri: string; expires: number }>();

export function getAuthUrl(userId: string, requestHost: string): string {
  const scopes = [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
  ];

  const state = crypto.randomBytes(32).toString("hex");
  
  // Build redirect URI dynamically from request host
  const protocol = requestHost.includes("localhost") ? "http" : "https";
  const redirectUri = `${protocol}://${requestHost}/api/google/callback`;
  
  pendingOAuthStates.set(state, { userId, redirectUri, expires: Date.now() + 10 * 60 * 1000 });

  pendingOAuthStates.forEach((value, key) => {
    if (value.expires < Date.now()) {
      pendingOAuthStates.delete(key);
    }
  });

  const dynamicClient = createOAuth2Client(redirectUri);
  return dynamicClient.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent",
    state,
  });
}

export function validateOAuthState(state: string): { userId: string; redirectUri: string } | null {
  const pending = pendingOAuthStates.get(state);
  if (!pending || pending.expires < Date.now()) {
    pendingOAuthStates.delete(state);
    return null;
  }
  pendingOAuthStates.delete(state);
  return { userId: pending.userId, redirectUri: pending.redirectUri };
}

export async function getTokensFromCode(code: string, redirectUri: string) {
  const dynamicClient = createOAuth2Client(redirectUri);
  const { tokens } = await dynamicClient.getToken(code);
  return tokens;
}

export function setCredentials(tokens: { access_token?: string | null; refresh_token?: string | null }) {
  oauth2Client.setCredentials(tokens);
}

export async function refreshAccessToken(refreshToken: string) {
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await oauth2Client.refreshAccessToken();
  return credentials;
}

interface CalendarEventParams {
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  attendeeEmails: string[];
  meetingLink: string;
  accessToken: string;
  refreshToken?: string;
  isAllDay?: boolean;
  recurrence?: "none" | "daily" | "weekly" | "monthly" | "annually" | "weekdays" | "custom";
}

function buildRecurrenceRule(recurrence: string, startTime: Date): string[] | undefined {
  if (!recurrence || recurrence === "none") {
    return undefined;
  }

  const dayOfWeek = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][startTime.getDay()];
  const dayOfMonth = startTime.getDate();
  const weekOfMonth = Math.ceil(dayOfMonth / 7);
  const month = startTime.getMonth() + 1;

  switch (recurrence) {
    case "daily":
      return ["RRULE:FREQ=DAILY"];
    case "weekly":
      return [`RRULE:FREQ=WEEKLY;BYDAY=${dayOfWeek}`];
    case "monthly":
      return [`RRULE:FREQ=MONTHLY;BYDAY=${weekOfMonth}${dayOfWeek}`];
    case "annually":
      return [`RRULE:FREQ=YEARLY;BYMONTH=${month};BYMONTHDAY=${dayOfMonth}`];
    case "weekdays":
      return ["RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"];
    case "custom":
      return undefined;
    default:
      return undefined;
  }
}

export async function createCalendarEvent(params: CalendarEventParams): Promise<calendar_v3.Schema$Event> {
  const { title, description, startTime, endTime, attendeeEmails, meetingLink, accessToken, refreshToken, isAllDay, recurrence } = params;

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  const recurrenceRule = buildRecurrenceRule(recurrence || "none", startTime);

  const event: calendar_v3.Schema$Event = {
    summary: title,
    description: description || `Join the meeting: ${meetingLink}`,
    start: isAllDay
      ? { date: startTime.toISOString().split("T")[0] }
      : { dateTime: startTime.toISOString(), timeZone: "UTC" },
    end: isAllDay
      ? { date: endTime.toISOString().split("T")[0] }
      : { dateTime: endTime.toISOString(), timeZone: "UTC" },
    attendees: attendeeEmails.map((email) => ({ email })),
    conferenceData: {
      entryPoints: [
        {
          entryPointType: "video",
          uri: meetingLink,
          label: "Join VideoAI Meeting",
        },
      ],
      conferenceSolution: {
        key: { type: "addOn" },
        name: "VideoAI Meeting",
      },
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: "email", minutes: 60 },
        { method: "popup", minutes: 10 },
      ],
    },
    ...(recurrenceRule && { recurrence: recurrenceRule }),
  };

  const response = await calendar.events.insert({
    calendarId: "primary",
    requestBody: event,
    sendUpdates: "all",
  });

  return response.data;
}

export async function getUserInfo(accessToken: string) {
  oauth2Client.setCredentials({ access_token: accessToken });
  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const { data } = await oauth2.userinfo.get();
  return data;
}
