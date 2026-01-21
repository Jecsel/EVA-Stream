import { google, calendar_v3 } from "googleapis";
import crypto from "crypto";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || "http://localhost:5000/api/google/callback"
);

const pendingOAuthStates = new Map<string, { userId: string; expires: number }>();

export function getAuthUrl(userId: string): string {
  const scopes = [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
  ];

  const state = crypto.randomBytes(32).toString("hex");
  pendingOAuthStates.set(state, { userId, expires: Date.now() + 10 * 60 * 1000 });

  pendingOAuthStates.forEach((value, key) => {
    if (value.expires < Date.now()) {
      pendingOAuthStates.delete(key);
    }
  });

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent",
    state,
  });
}

export function validateOAuthState(state: string): string | null {
  const pending = pendingOAuthStates.get(state);
  if (!pending || pending.expires < Date.now()) {
    pendingOAuthStates.delete(state);
    return null;
  }
  pendingOAuthStates.delete(state);
  return pending.userId;
}

export async function getTokensFromCode(code: string) {
  const { tokens } = await oauth2Client.getToken(code);
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
}

export async function createCalendarEvent(params: CalendarEventParams): Promise<calendar_v3.Schema$Event> {
  const { title, description, startTime, endTime, attendeeEmails, meetingLink, accessToken, refreshToken } = params;

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  const event: calendar_v3.Schema$Event = {
    summary: title,
    description: description || `Join the meeting: ${meetingLink}`,
    start: {
      dateTime: startTime.toISOString(),
      timeZone: "UTC",
    },
    end: {
      dateTime: endTime.toISOString(),
      timeZone: "UTC",
    },
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
