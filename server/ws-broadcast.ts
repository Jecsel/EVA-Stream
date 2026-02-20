import { WebSocket } from "ws";

// Shared WebSocket connection registry — used by index.ts (to manage connections)
// and routes.ts (to push reanalysis progress) without circular imports.

const meetingConnections = new Map<string, Set<WebSocket>>();

export function registerMeetingConnection(meetingId: string, ws: WebSocket): void {
  if (!meetingConnections.has(meetingId)) {
    meetingConnections.set(meetingId, new Set());
  }
  meetingConnections.get(meetingId)!.add(ws);
}

export function unregisterMeetingConnection(meetingId: string, ws: WebSocket): void {
  const connections = meetingConnections.get(meetingId);
  if (connections) {
    connections.delete(ws);
    if (connections.size === 0) {
      meetingConnections.delete(meetingId);
    }
  }
}

export function broadcastToMeeting(meetingId: string, message: object): void {
  const connections = meetingConnections.get(meetingId);
  if (connections) {
    const data = JSON.stringify(message);
    connections.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }
}

export function getMeetingConnectionCount(meetingId: string): number {
  return meetingConnections.get(meetingId)?.size ?? 0;
}
