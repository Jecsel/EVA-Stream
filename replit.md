# VideoAI - Collaborative Video Conferencing with AI

## Overview

VideoAI is a Jitsi-powered video conferencing platform enhanced with a real-time AI assistant (EVA). Its primary purpose is to observe video meetings, analyze shared screens and conversations, and automatically generate Standard Operating Procedures (SOPs) and other documentation in real-time. This aims to streamline meeting outcomes, improve documentation efficiency, and provide an intelligent assistant for collaborative sessions.

Key capabilities include:
- Real-time AI context awareness through Google Gemini.
- AI Voice Assistant for natural voice interactions.
- WebSocket-based live AI communication.
- Automatic SOP generation and flowchart visualization.
- Meeting scheduling, recordings, and chat history.
- An admin panel for user and AI prompt management.

## User Preferences

Preferred communication style: Simple, everyday language.

Every feature, UI/UX and design should be mobile-first.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript.
- **Routing**: Wouter.
- **State Management**: TanStack React Query.
- **Styling**: Tailwind CSS v4 with a dark theme (Google Meet-inspired).
- **UI Components**: shadcn/ui and Radix UI.
- **Build Tool**: Vite.
- **Architecture**: Component-based, with custom hooks for WebSocket connections.

### Backend
- **Runtime**: Node.js with Express.
- **Language**: TypeScript with ESM modules.
- **API Style**: RESTful endpoints.
- **Real-time**: WebSocket server for AI live streaming.
- **Data Storage**: Uses a storage abstraction layer for database operations.

### AI Integration
- **Provider**: Google Gemini API.
- **Communication**: HTTP for chat analysis, WebSocket for live observation.
- **Capabilities**: Screen analysis, conversation understanding, SOP generation, and post-meeting video transcription.
- **Post-Meeting Transcription**: Automated transcription and summarization of recorded meetings, including speaker identification and action items.

### Meeting Agents System
The platform supports configurable AI agents and generators:
- **EVA Assistant**: An always-on assistant providing chat, notes, and screen observation.
- **SOP Generator**: Creates SOPs from meeting transcripts and/or screen observation.
- **CRO Generator**: Creates Core Role Outcomes (FABIUS structure) from meeting transcripts and/or screen observation.
- **AI Voice Assistant**: Utilizes 11Labs for voice-powered interactions, enabling EVA to speak responses and narrate documents.

Generators can operate from transcript only or combine transcript and screen observation for real-time generation via WebSockets. Custom prompts are configurable via the Admin panel.

### Data Flow
User interaction initiates meeting creation/joining. Jitsi handles media streaming. Selected AI agents activate, with EVA connecting via WebSocket for real-time observation. AI responses update SOPs and flowchart visualizations. All meeting data is persisted to PostgreSQL.

## External Dependencies

### Database
- **PostgreSQL**: Primary data store.
- **ORM**: Drizzle ORM for schema management and migrations.

### Third-Party Services
- **Google Gemini API**: For AI analysis and SOP generation.
- **Jitsi Meet**: For video conferencing.
- **11Labs API**: For the AI Voice Assistant, providing text-to-speech capabilities and specialized voice agents (EVA Meeting Assistant, SOP Voice Agent, CRO Interview Agent).
- **Sentry**: Production-only error tracking and monitoring for both frontend and backend.

### Key NPM Dependencies
- `@jitsi/react-sdk`: Jitsi integration.
- `@tanstack/react-query`: Data fetching.
- `react-markdown` + `remark-gfm`: Markdown rendering.
- `mermaid`: Flowchart visualization.
- `framer-motion`: UI animations.
- `zod` + `drizzle-zod`: Schema validation.
- `ws`: WebSocket server.

### Environment Variables
- `DATABASE_URL`: PostgreSQL connection string.
- `GEMINI_API_KEY`: Google Gemini API key.
- `ELEVENLABS_API_KEY`: 11Labs API key.
- `ELEVENLABS_AGENT_ID`, `ELEVENLABS_SOP_AGENT_ID`, `ELEVENLABS_CRO_INTERVIEW_AGENT_ID`: IDs for specific 11Labs voice agents.
- `EXTERNAL_API_KEY`: Optional API key for external meeting creation.
- `SENTRY_DSN`: Sentry DSN for error tracking (only active in production).

### External API
Provides RESTful endpoints for external systems to interact with VideoAI, including:
- `POST /api/external/create-meeting`: Programmatically create meetings.
- `POST /api/external/schedule-meeting`: Schedule meetings, with optional Google Calendar integration.
- `GET /api/external/meetings`: Retrieve meetings for a specific user.