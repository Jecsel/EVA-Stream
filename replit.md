# VideoAI - Collaborative Video Conferencing with AI

## Overview

VideoAI is a Jitsi-powered video conferencing platform with real-time AI context awareness. The application enables users to create and join video meetings while an AI assistant (EVA) observes the meeting, analyzes shared screens and conversations, and automatically generates Standard Operating Procedures (SOPs) documentation in real-time.

Key features:
- Video conferencing via Jitsi JaaS (8x8.vc) integration
- Real-time AI assistant (EVA) powered by OpenAI gpt-5 via Replit AI Integrations
- WebSocket-based live AI communication
- Automatic SOP generation with version history and rollback
- Meeting scheduling, recordings, and chat history
- Real-time speech-to-text transcription via OpenAI Whisper

## User Preferences

Preferred communication style: Simple, everyday language.

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
- **Primary Provider**: OpenAI gpt-5 via Replit AI Integrations (no API key required, billed to credits)
- **Fallback Provider**: Google Gemini API via `@google/genai` (legacy)
- **Communication**: Dual-mode - HTTP for chat analysis, WebSocket for live observation
- **STT**: OpenAI gpt-4o-mini-transcribe for speech-to-text
- **Capabilities**: Screen analysis, conversation understanding, SOP generation, version control

### Session Controller Architecture
The Session Controller (`server/sessionController.ts`) manages per-meeting AI orchestration:
- Initializes SOP documents when meetings start
- Buffers transcript segments for batch analysis
- Triggers automatic SOP updates based on conversation
- Handles version numbering (integer-based) and rollback
- Integrates with OpenAI for chat and transcription

### Data Flow
1. User creates/joins meeting via Dashboard
2. Jitsi handles video/audio streaming
3. EVA connects via WebSocket for real-time observation
4. AI responses update SOP document and flowchart visualization
5. Meeting data persisted to PostgreSQL

## External Dependencies

### Database
- **PostgreSQL**: Primary data store
- **ORM**: Drizzle ORM with `drizzle-kit` for migrations
- **Schema**: Defined in `shared/schema.ts` including:
  - users, meetings, recordings, chat messages, transcript segments
  - sop_documents (tracks current version per meeting)
  - sop_versions (content, mermaid diagrams, change summaries, integer versioning)
  - conversations, messages (for OpenAI integration)
- **Connection**: Uses `pg` driver with connection pooling

### Third-Party Services
- **OpenAI via Replit AI Integrations**: Primary AI provider (gpt-5 for chat, gpt-4o-mini-transcribe for STT)
  - No API key required - uses `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL`
  - Billed to Replit credits
- **Google Gemini API**: Legacy fallback (requires `GEMINI_API_KEY`)
- **Jitsi JaaS (8x8)**: Video conferencing via JaaS (Jitsi as a Service) with JWT authentication
  - Uses `8x8.vc` domain when JaaS credentials are configured
  - Falls back to public `meet.jit.si` if not configured
  - JWT generation uses RS256 algorithm with proper claims (aud, context, exp, iat, iss, nbf, room, sub)

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
- `AI_INTEGRATIONS_OPENAI_API_KEY`: Auto-provided by Replit AI Integrations
- `AI_INTEGRATIONS_OPENAI_BASE_URL`: Auto-provided by Replit AI Integrations
- `GEMINI_API_KEY`: Google Gemini API key (optional - legacy fallback)
- `JAAS_APP_ID`: JaaS Application ID (optional - starts with "vpaas-magic-cookie-...")
- `JAAS_API_KEY`: JaaS API Key ID (optional - format: "vpaas-magic-cookie-.../abc123")
- `JAAS_PRIVATE_KEY`: JaaS Private Key in PEM format (optional - used for JWT signing)

## Recent Changes (Jan 2026)
- Added OpenAI integration via Replit AI Integrations (gpt-5 for chat, gpt-4o-mini-transcribe for STT)
- Implemented SOP versioning with sop_documents and sop_versions tables
- Created Session Controller for per-meeting AI orchestration
- Added API routes for SOP management, transcription, and EVA chat
- Integer-based version numbering for stable SOP history
- Rollback functionality sets currentVersionId directly (no duplicate creation)