# VideoAI - Collaborative Video Conferencing with AI

## Overview

VideoAI is a Jitsi-powered video conferencing platform with real-time AI context awareness. The application enables users to create and join video meetings while an AI assistant (EVA) observes the meeting, analyzes shared screens and conversations, and automatically generates Standard Operating Procedures (SOPs) documentation in real-time.

Key features:
- Video conferencing via Jitsi integration
- Real-time AI assistant (EVA) powered by Google Gemini
- WebSocket-based live AI communication
- Automatic SOP generation and flowchart visualization
- Meeting scheduling, recordings, and chat history

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
- **Provider**: Google Gemini API via `@google/genai`
- **Communication**: Dual-mode - HTTP for chat analysis, WebSocket for live observation
- **Capabilities**: Screen analysis, conversation understanding, SOP generation

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
- **Schema**: Defined in `shared/schema.ts` (users, meetings, recordings, chat messages)
- **Connection**: Uses `pg` driver with connection pooling

### Third-Party Services
- **Google Gemini API**: AI analysis and SOP generation (requires `GEMINI_API_KEY`)
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
- `GEMINI_API_KEY`: Google Gemini API key for AI features
- `JAAS_APP_ID`: JaaS Application ID (optional - starts with "vpaas-magic-cookie-...")
- `JAAS_API_KEY`: JaaS API Key ID (optional - format: "vpaas-magic-cookie-.../abc123")
- `JAAS_PRIVATE_KEY`: JaaS Private Key in PEM format (optional - used for JWT signing)