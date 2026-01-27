# VideoAI - Collaborative Video Conferencing with AI

## Overview

VideoAI is a Jitsi-powered video conferencing platform with real-time AI context awareness. The application enables users to create and join video meetings while an AI assistant (EVA) observes the meeting, analyzes shared screens and conversations, and automatically generates Standard Operating Procedures (SOPs) documentation in real-time.

Key features:
- Video conferencing via Jitsi integration
- Real-time AI assistant (EVA) powered by Google Gemini
- WebSocket-based live AI communication
- Automatic SOP generation and flowchart visualization
- Meeting scheduling, recordings, and chat history
- Admin panel for user and prompt management

## User Preferences

Preferred communication style: Simple, everyday language.

**Important Note:** Every feature, UI/UX and design should be mobile-first.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight router)
- **State Management**: TanStack React Query for server state
- **Styling**: Tailwind CSS v4 with custom dark theme (Google Meet-inspired)
- **UI Components**: shadcn/ui component library with Radix UI primitives
- **Build Tool**: Vite with custom plugins for Replit integration

The frontend follows a component-based architecture with pages in `client/src/pages/` and reusable components in `client/src/components/`. Custom hooks handle WebSocket connections for real-time AI communication.

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ESM modules
- **API Style**: RESTful endpoints under `/api/`
- **Real-time**: WebSocket server at `/ws/eva` for AI live streaming

The server uses a storage abstraction layer (`server/storage.ts`) implementing the `IStorage` interface, allowing database operations to be centralized and testable.

### AI Integration
- **Provider**: Google Gemini API via `@google/genai`
- **Communication**: Dual-mode - HTTP for chat analysis, WebSocket for live observation
- **Capabilities**: Screen analysis, conversation understanding, SOP generation, post-meeting video transcription

### Post-Meeting AI Transcription
When a meeting recording is uploaded (via JaaS webhook), the system automatically:
1. Sends the video URL to Gemini for audio analysis
2. Generates a full transcript with speaker identification and timestamps
3. Creates a meeting summary, action items, and key topics
4. Saves transcript segments to the database for display

Users can also manually trigger transcription from the Recording Detail page using the "Generate Transcript" button.

### Meeting Agents System
The platform supports multiple AI agents that can be enabled/disabled per meeting:

| Agent | Type | Functionality |
|-------|------|---------------|
| **EVA Assistant** | eva | Unified AI assistant with tabbed interface: Chat (real-time Q&A), Notes (meeting key points), Observe (screen analysis and SOP generation) |
| **Meeting Transcriber** | transcription | Real-time speech-to-text with speaker identification |
| **Flowchart Builder** | flowchart | Auto-generates visual flowcharts from SOP content using Mermaid.js (updates in real-time as SOP changes) |

Each agent:
- Only runs when explicitly selected in the meeting
- Uses its own custom prompt (configurable in Admin panel)
- EVA Assistant uses a unified tabbed panel (EVAPanel.tsx) instead of separate panels
- Properly starts/stops when toggled during a live meeting

### Data Flow
1. User creates/joins meeting via Dashboard
2. Jitsi handles video/audio streaming
3. Selected agents activate based on user's agent choices
4. EVA connects via WebSocket for real-time observation (if EVA agent selected)
5. AI responses update SOP document and flowchart visualization
6. Meeting data persisted to PostgreSQL

## External Dependencies

### Database
- **PostgreSQL**: Primary data store
- **ORM**: Drizzle ORM with `drizzle-kit` for migrations
- **Schema**: Defined in `shared/schema.ts` (users, meetings, recordings, chat messages, prompts)
- **Connection**: Uses `pg` driver with connection pooling

### Admin Panel
- **Route**: `/admin` - accessible via Settings icon in header
- **User Management**: Full CRUD with role (admin/user) and status (active/inactive/suspended)
- **Prompt Management**: Configure AI prompts by type (chat, summary, analysis, eva)
- **Security**: Bcrypt password hashing, passwords never returned in API responses

### Third-Party Services
- **Google Gemini API**: AI analysis and SOP generation (requires `GEMINI_API_KEY`)
- **Jitsi Meet**: Video conferencing (uses public `meet.jit.si` or JaaS with JWT)

### Key NPM Dependencies
- `@jitsi/react-sdk`: Jitsi video integration
- `@tanstack/react-query`: Data fetching and caching
- `react-markdown` + `remark-gfm`: Markdown rendering for AI responses
- `mermaid`: Flowchart visualization for SOPs
- `framer-motion`: UI animations
- `zod` + `drizzle-zod`: Schema validation
- `ws`: WebSocket server implementation

### Environment Variables Required
- `DATABASE_URL`: PostgreSQL connection string
- `GEMINI_API_KEY`: Google Gemini API key for AI features
- `EXTERNAL_API_KEY`: (Optional) API key to protect the external meeting creation endpoint

## External API

### POST /api/external/create-meeting

Creates a new meeting and returns a shareable link. Other systems can call this endpoint to programmatically generate meeting links.

**Authentication**: If `EXTERNAL_API_KEY` is configured, requests must include:
```
Authorization: Bearer <your-api-key>
```

**Request Body** (optional):
```json
{
  "title": "Meeting Title",
  "scheduledDate": "2026-01-20T14:00:00.000Z"
}
```

**Response**:
```json
{
  "success": true,
  "meeting": {
    "id": "uuid",
    "title": "Meeting Title",
    "roomId": "abc-defg-hij",
    "status": "live",
    "scheduledDate": "2026-01-15T10:00:00.000Z",
    "createdAt": "2026-01-15T10:00:00.000Z"
  },
  "link": "https://your-domain.replit.dev/meeting/abc-defg-hij"
}