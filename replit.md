# VideoAI - Collaborative Video Conferencing with AI

## Overview

VideoAI is a Jitsi-powered video conferencing platform with real-time AI context awareness. The application enables users to create and join video meetings while an AI assistant (EVA) observes the meeting, analyzes shared screens and conversations, and automatically generates Standard Operating Procedures (SOPs) documentation in real-time.

Key features:
- Video conferencing via Jitsi integration
- Real-time AI assistant (EVA) powered by Google Gemini
- AI Voice Assistant powered by 11Labs for natural voice interactions
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
The platform supports AI agents and generators that can be enabled/disabled per meeting:

| Component | Type | Functionality |
|-----------|------|---------------|
| **EVA Assistant** | eva | Always-on AI assistant with unified tabbed interface: Chat (real-time Q&A), Notes (meeting key points), Observe (screen analysis) |
| **SOP Generator** | generator | Creates Standard Operating Procedures from meeting transcript and/or screen observation |
| **CRO Generator** | generator | Creates Core Role Outcomes (FABIUS structure) from meeting transcript and/or screen observation |
| **AI Voice Assistant** | voice_11labs | Voice-powered AI meeting assistant using 11Labs - enables natural voice interactions |

Generator Features:
- Both SOP and CRO generators work from **transcript only** (no screen sharing needed) OR with screen observation
- When screen observer is enabled, generators combine both transcript and screen data
- Real-time generation as meeting progresses via WebSocket
- Custom prompts configurable in Admin panel (types: sop, cro)

Agent Behavior:
- EVA Assistant is always on during meetings
- Generators can be toggled independently via the "Generators" dropdown
- EVA panel only appears after the user has joined the meeting (not in the pre-join lobby)

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
- `ELEVENLABS_API_KEY`: 11Labs API key for AI Voice Assistant
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
```

## AI Meeting Assistant (11Labs)

### Overview

The AI Meeting Assistant powered by 11Labs brings natural voice capabilities to VideoAI meetings. This feature enables EVA to speak responses aloud, read SOPs and meeting notes via text-to-speech, and provide a more immersive AI-assisted meeting experience.

### Key Capabilities

| Capability | Description |
|------------|-------------|
| **Voice Responses** | EVA speaks answers and insights during meetings instead of text-only responses |
| **SOP Narration** | Converts generated SOPs to natural speech for hands-free review |
| **Meeting Summaries** | Audio playback of meeting summaries and action items |
| **Custom Voice Selection** | Choose from multiple AI voice options to match your preference |
| **Real-time Synthesis** | Low-latency voice generation for natural conversation flow |

### How It Works

1. **Enable the Agent**: Select "AI Voice Assistant" when creating or joining a meeting
2. **Voice Output**: EVA's responses are synthesized using 11Labs' voice AI technology
3. **Audio Controls**: Play, pause, or skip voice responses as needed
4. **Text Fallback**: All voiced content remains visible as text in the EVA panel

### Technical Integration

- **Provider**: 11Labs Conversational AI / Text-to-Speech API
- **Communication**: Audio streams delivered via WebSocket for real-time playback
- **Voice Models**: Supports 11Labs' multilingual voice models
- **Latency**: Optimized for sub-second response times using streaming synthesis

### Configuration

#### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ELEVENLABS_API_KEY` | Yes | Your 11Labs API key for voice synthesis |
| `ELEVENLABS_VOICE_ID` | No | Default voice ID (uses 11Labs default if not set) |
| `ELEVENLABS_MODEL_ID` | No | Voice model to use (default: `eleven_turbo_v2_5`) |

#### Admin Panel Settings

Navigate to **Admin > Prompts** to configure the AI Voice Assistant prompt. This controls how EVA responds when the voice agent is active, optimizing responses for spoken delivery (shorter sentences, clearer phrasing).

### Voice Options

11Labs provides various voice profiles:

- **Professional**: Clear, neutral tone suitable for business meetings
- **Friendly**: Warm, approachable tone for team discussions
- **Custom**: Clone or create custom voices via 11Labs dashboard

### Usage Tips

- Keep responses concise for better voice delivery
- Use headphones to prevent audio feedback during meetings
- The voice agent works best with a stable internet connection
- Combine with Meeting Transcriber for complete audio-to-text and text-to-audio coverage

### Troubleshooting

| Issue | Solution |
|-------|----------|
| No audio playback | Check browser audio permissions and volume settings |
| Voice cuts out | Verify stable internet connection; voice uses streaming |
| High latency | Switch to `eleven_turbo_v2_5` model for faster synthesis |
| API errors | Confirm `ELEVENLABS_API_KEY` is set correctly in Secrets |