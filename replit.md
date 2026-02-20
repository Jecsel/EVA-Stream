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
- **Provider**: Google Gemini API (screen analysis, SOP/CRO generation), OpenAI Whisper via Replit AI Integrations (live audio transcription).
- **Communication**: HTTP for chat analysis, WebSocket for live observation.
- **Capabilities**: Screen analysis, conversation understanding, SOP generation, and post-meeting video transcription.
- **Live Transcription**: OpenAI Whisper (`gpt-4o-mini-transcribe`) via `/api/transcribe/whisper` endpoint. Frontend captures audio with MediaRecorder, sends base64 chunks to server, server converts with ffmpeg and transcribes via Whisper.
- **Post-Meeting Transcription**: Automated transcription and summarization of recorded meetings, including speaker identification and action items.

### Developer AI Agent
- **Provider**: Anthropic Claude (via Replit AI Integrations).
- **Model**: claude-sonnet-4-5.
- **UI**: Floating chat widget (`DevAgentWidget.tsx`) available on all pages.
- **Backend**: `server/dev-agent.ts` - Agent with tool use capabilities.
- **API Endpoint**: `POST /api/dev-agent/chat` - SSE streaming endpoint.
- **Tools**: read_file, list_files, search_code, query_database, get_database_schema, read_logs, get_project_overview.
- **Security**: Path traversal protection, safe shell execution (execFileSync), read-only DB queries.
- **Screen Context**: Sends current page URL/path for context-aware assistance.

### Meeting Agents System
The platform supports configurable AI agents and generators:
- **EVA Assistant**: An always-on assistant providing chat, notes, and screen observation.
- **SOP Generator**: Creates SOPs from meeting transcripts and/or screen observation.
- **CRO Generator**: Creates Core Role Outcomes (FABIUS structure) from meeting transcripts and/or screen observation.
- **AI Voice Assistant**: Utilizes 11Labs for voice-powered interactions, enabling EVA to speak responses and narrate documents.
- **Scrum Master Agent**: Aggressive AI Scrum Master that enforces standup discipline in real-time. Features: speaker timebox enforcement, rambling/scope creep detection, blocker severity classification (critical/high/medium/noise), action item enforcement with owners/deadlines, sprint goal tracking, cross-meeting pattern detection, and post-meeting summaries. Three modes: Observer (silent logging), Enforcer (active warnings), Hardcore (zero tolerance). Multiplexed through the EVA WebSocket (/ws/eva) using `scrum_` message prefix for real-time interventions. Engine: `server/scrum-master.ts`. UI: `client/src/components/ScrumMasterPanel.tsx`.
- **Scrum Meeting Record Generator**: Auto-generates a structured "Daily Scrum – Meeting Record" document (8 sections: Meeting Details, Carried-Over Items, Team Updates, Blockers, Decisions Made, Action Items, Risks/Concerns, Notes for Next Meeting) when scrum meetings end. Recurring meetings auto-link via `previousMeetingId`/`meetingSeriesId` fields and carry over unfinished items. Records stored in `scrumMeetingRecords` table. UI: `client/src/components/ScrumMeetingRecordTab.tsx` (tab in RecordingDetail page with copy/download/series navigation).

Generators can operate from transcript only or combine transcript and screen observation for real-time generation via WebSockets. Custom prompts are configurable via the Admin panel.

### Agent Team Coordination System
Inspired by Claude Code's "Agent Teams" concept. EVA acts as team lead coordinating multiple AI agents (SOP Generator, CRO Generator, Scrum Master) working in parallel.
- **Architecture**: `server/agent-team.ts` - AgentTeamOrchestrator with MessageBus (inter-agent communication), TaskManager (shared task tracking), and InputClassifier (Gemini-powered intelligent delegation).
- **Data Model**: `agentTeamTasks` and `agentTeamMessages` tables in PostgreSQL for persistent task/message storage.
- **Communication**: WebSocket-based real-time updates using `team_` message prefix. Message types: team_start, team_stop, team_get_state, team_get_tasks, team_status, team_task_update, team_agent_message, team_state, team_tasks.
- **UI**: `client/src/components/AgentTeamDashboard.tsx` - Dashboard with three sub-tabs: Tasks (shared task list with active/completed sections), Messages (inter-agent communication feed), and Flow (Mermaid diagram showing agent team architecture with live status colors).
- **Integration**: Available as "Agent Team" tab in the MeetingRoom EVA panel. Moderators can start/stop the team; agents are coordinated in parallel with EVA synthesizing a coordinated report on stop.

### Video Recording Storage
JaaS video recordings expire after 24 hours. To preserve them permanently:
- **Storage**: Replit App Storage (Google Cloud Storage) via `server/video-storage.ts`.
- **Automatic Backup**: When the `RECORDING_UPLOADED` webhook fires, the video is automatically downloaded from JaaS and uploaded to App Storage.
- **Manual Backup**: Users can trigger backup from the recording detail page via "Save Video" button.
- **Schema Fields**: `originalVideoUrl` (JaaS temporary link), `storageStatus` (pending/downloading/stored/failed), `storedVideoPath` (permanent path in App Storage).
- **Serving**: Stored videos are served via the object storage routes at `/objects/recordings/{id}.mp4`.

### Data Flow
User interaction initiates meeting creation/joining. Jitsi handles media streaming. Selected AI agents activate, with EVA connecting via WebSocket for real-time observation. AI responses update SOPs and flowchart visualizations. All meeting data is persisted to PostgreSQL.

## External Dependencies

### Database
- **PostgreSQL**: Primary data store.
- **ORM**: Drizzle ORM for schema management and migrations.

### Third-Party Services
- **Google Gemini API**: For AI analysis and SOP generation.
- **Jitsi Meet**: For video conferencing.
- **11Labs API**: For the AI Voice Assistant (EVA), providing text-to-speech capabilities and conversational voice interactions.
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
- `ELEVENLABS_AGENT_ID`: ID for the EVA voice agent.
- `EXTERNAL_API_KEY`: Optional API key for external meeting creation.
- `SENTRY_DSN`: Sentry DSN for error tracking (only active in production).

### External API
Provides RESTful endpoints for external systems to interact with VideoAI, including:
- `POST /api/external/create-meeting`: Programmatically create meetings.
- `POST /api/external/schedule-meeting`: Schedule meetings, with optional Google Calendar integration.
- `GET /api/external/meetings`: Retrieve meetings for a specific user.