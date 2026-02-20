# Product Requirements Document (PRD)
# EVA Stream - AI-Powered Video Conferencing & SOP Platform

**Version:** 1.0
**Last Updated:** February 5, 2026
**Product Name:** EVA Stream (VideoAI)

---

## 1. Product Overview

EVA Stream is a Jitsi-powered video conferencing platform enhanced with a real-time AI assistant called EVA. The platform observes video meetings, analyzes shared screens and conversations, and automatically generates Standard Operating Procedures (SOPs) and Core Role Outcome (CRO) documents in real-time. It enables seamless meeting documentation, intelligent collaboration, and third-party integration through a comprehensive external API.

### 1.1 Vision

Eliminate the manual effort of documenting meeting outcomes and operational procedures by providing an always-on AI assistant that observes, understands, and structures knowledge into actionable documents during live meetings.

### 1.2 Target Users

- **Business owners** who need to document processes and delegate tasks
- **Operations managers** building standard operating procedures
- **Meeting moderators** who want automated documentation
- **Third-party platforms** integrating meeting capabilities via API
- **Team members** who need real-time visibility into meeting documentation

---

## 2. Core Features

### 2.1 Video Conferencing

| Requirement | Description |
|---|---|
| Video/Audio Calls | Full-featured video conferencing powered by Jitsi (JaaS) |
| Room-Based Meetings | Unique room IDs in `xxx-xxxx-xxx` format |
| JWT Authentication | Jitsi tokens with moderator/participant role distinction |
| Meeting Status | Lifecycle management: scheduled → live → completed |
| Meeting Duration | Real-time timer tracking meeting duration |
| Copy Meeting Link | One-click sharing of meeting invitation links |

### 2.2 EVA AI Assistant

| Requirement | Description |
|---|---|
| Real-Time Chat | Users can ask EVA questions during meetings via text chat |
| Screen Observation | EVA captures and analyzes shared screen content every 10 seconds |
| Transcript Analysis | EVA processes live meeting transcripts to extract procedural content |
| Context Awareness | EVA understands screen content, conversation context, and meeting agenda |
| Voice Interaction | Natural voice commands and responses via ElevenLabs integration |
| Wake Word Detection | "Hey EVA" triggers voice assistant activation |
| Push-to-Talk | Manual voice input mode for noisy environments |

### 2.3 SOP Generator

| Requirement | Description |
|---|---|
| Automatic Generation | Creates SOPs from screen observations and/or meeting transcripts |
| Real-Time Updates | SOP content updates live as the meeting progresses |
| Structured Format | SOPs include Objective, Prerequisites, Tools/Systems, and numbered Procedure Steps |
| Live Editing | Moderators can edit SOP content in real-time during meetings |
| Export Options | Download as PDF or Markdown file |
| Flowchart Visualization | Automatic Mermaid.js flowchart generation from SOP steps |
| Configurable Prompts | Admin-customizable AI prompts for SOP generation style |
| Generator Controls | Start/Pause/Resume/Stop controls for the SOP generation process |
| Observation Sync | Eye icon button and panel controls stay synchronized |

### 2.4 CRO Generator (Core Role Outcomes)

| Requirement | Description |
|---|---|
| FABIUS Framework | Generates CRO documents using the 5-part framework: Purpose, Context, Agenda, Responsibilities, Outcomes |
| Three Artifacts | Produces Core Role Objective Document, Delegation Candidate List, and Process Identification List |
| Transcript-Based | Analyzes meeting conversations to identify bottlenecks and delegation opportunities |
| Fail-Safe Rules | Flags missing information and unclear tasks instead of guessing |
| Configurable Prompts | Admin-customizable AI prompts for CRO generation |
| Generator Controls | Independent Start/Pause/Resume/Stop controls |

### 2.5 Live SOP Broadcasting

| Requirement | Description |
|---|---|
| Real-Time Broadcast | All meeting participants receive live SOP updates via WebSocket |
| Connection Tracking | Server tracks all WebSocket connections per meeting room |
| Moderator View | Full controls with editing, observation, and generator management |
| Participant View | Read-only live SOP document with update status indicators |
| CRO Broadcasting | CRO updates also broadcast to all connected participants |

### 2.6 Meeting Management

| Requirement | Description |
|---|---|
| Instant Meetings | Create and join meetings immediately |
| Scheduled Meetings | Schedule meetings with specific date/time |
| Recurring Meetings | Support for daily, weekly, monthly, annually, and weekday recurrence |
| All-Day Events | Support for all-day meeting events |
| Event Types | Meetings can be events or tasks |
| Meeting End | Graceful meeting ending with SOP content preservation |
| Moderator System | Meeting creator becomes moderator with elevated controls |
| Moderator Code | Secret code allows moderator access without login |

### 2.7 Meeting Recordings & Transcription

| Requirement | Description |
|---|---|
| Recording Storage | Store meeting recordings with metadata (title, duration, summary) |
| AI Transcription | Post-meeting transcription of recorded videos via Google Gemini |
| Speaker Identification | Identify different speakers in transcriptions |
| Action Items | Extract action items from meeting transcripts |
| AI Summary | Generate meeting summaries with key topics, decisions, and open questions |
| SOP from Transcript | Generate SOPs from post-meeting transcription content |

### 2.8 SOP Sharing

| Requirement | Description |
|---|---|
| Share Token | Unique token-based URLs for secure public SOP sharing |
| Public SOP View | Standalone page for viewing shared SOPs without authentication |
| Flowchart View | Shared SOPs include Mermaid flowchart visualization |
| PDF Download | Public viewers can download SOP as PDF |
| Markdown Download | Public viewers can download SOP as Markdown |

### 2.9 EVA Meeting Assistant Features

| Requirement | Description |
|---|---|
| Meeting Notes | Capture and manage meeting notes with importance flags |
| Meeting Agenda | Create and track agenda items with completion status |
| Rich Text Agenda | HTML-based rich text editor for agenda content |
| File Uploads | Upload documents for AI context during meetings |
| Meeting Summary | AI-generated summary with key topics, decisions, and open questions |
| Audio Summary | Text-to-speech narration of meeting summaries |

### 2.10 Live Transcription

| Requirement | Description |
|---|---|
| Real-Time STT | Speech-to-text transcription during live meetings |
| Speaker Labels | Identify speakers in live transcript |
| Transcript Panel | Dedicated UI panel showing live transcript entries |
| Transcript Storage | Persist transcript segments to database |
| SOP Integration | Transcript content feeds into SOP and CRO generation |

### 2.11 Voice Assistant (ElevenLabs)

| Requirement | Description |
|---|---|
| EVA Meeting Agent | Voice-powered AI assistant for general meeting queries |
| SOP Voice Agent | Specialized agent for SOP-related voice interactions |
| CRO Interview Agent | Voice agent for conducting CRO interviews |
| Text-to-Speech | Convert EVA responses to spoken audio |
| Streaming TTS | Real-time audio streaming for long responses |
| Voice Selection | Configurable voice options from ElevenLabs library |
| Signed URLs | Secure WebSocket connections for voice agent sessions |

---

## 3. External API

### 3.1 Authentication

| Requirement | Description |
|---|---|
| API Key Auth | Bearer token authentication via `Authorization: Bearer <key>` header |
| Key Management | Create, list, and revoke API keys via admin panel |
| Key Prefix Display | Show only key prefix (`sk-xxxx...`) for security |
| Usage Tracking | Track last-used timestamp for each API key |

### 3.2 Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/external/create-meeting` | POST | Create instant meetings with optional title, schedule date, and moderator code |
| `/api/external/schedule-meeting` | POST | Schedule meetings with attendees, recurrence, and Google Calendar integration |
| `/api/external/meetings` | GET | Retrieve meetings filtered by userId or userEmail with pagination |

### 3.3 API Response

All external API responses include:
- Meeting details (id, title, roomId, status, dates)
- Direct meeting link for participants
- Moderator link with embedded moderator code
- Calendar event status (for scheduled meetings)

---

## 4. Admin Panel

### 4.1 User Management

| Requirement | Description |
|---|---|
| User CRUD | Create, read, update, and delete user accounts |
| Role Management | Assign admin or user roles |
| Status Management | Set user status: active, inactive, or suspended |
| Google Integration | View and manage Google account linkage per user |

### 4.2 Prompt Management

| Requirement | Description |
|---|---|
| Prompt CRUD | Create, edit, and delete AI prompts |
| Prompt Types | Support SOP, CRO, summary, chat, and analysis prompt types |
| Version History | Track all prompt versions with changelog |
| Version Rollback | Revert to any previous prompt version |
| Active Toggle | Enable/disable prompts without deletion |

### 4.3 Agent Management

| Requirement | Description |
|---|---|
| Agent CRUD | Create, read, update, and delete AI agents |
| Agent Types | Support SOP, flowchart, analysis, transcription, and EVA agent types |
| Capabilities | Define agent capabilities as arrays |
| Prompt Linking | Link agents to specific AI prompts |
| Default Selection | Mark agents as default for new meetings |
| Status Toggle | Activate or deactivate agents |

### 4.4 API Key Management

| Requirement | Description |
|---|---|
| Key Generation | Generate secure random API keys (`sk_` prefix) |
| Key Display | Show full key only at creation time |
| Key Revocation | Revoke/delete existing API keys |
| Usage Monitoring | View last-used timestamps |

### 4.5 API Documentation

| Requirement | Description |
|---|---|
| Interactive Docs | In-app API documentation with example requests/responses |
| Endpoint Reference | Complete reference for all external API endpoints |
| Authentication Guide | Instructions for using API key authentication |

---

## 5. Google Calendar Integration

| Requirement | Description |
|---|---|
| OAuth2 Flow | Google OAuth2 authorization with PKCE security |
| Calendar Events | Create Google Calendar events for scheduled meetings |
| Attendee Sync | Sync attendee emails to calendar invitations |
| Meeting Links | Include meeting join links in calendar events |
| Disconnect | Ability to unlink Google account |
| Recurrence Support | Map meeting recurrence to Google Calendar patterns |

---

## 6. Authentication & Security

| Requirement | Description |
|---|---|
| Firebase Auth | User authentication via Firebase with Google Sign-In |
| Moderator Verification | Firebase Admin SDK verifies moderator token claims |
| Moderator Code | Alternative moderator access via secret URL parameter (`?mod=code`) |
| API Key Security | Hashed API key storage, prefix-only display |
| Share Tokens | UUID-based tokens for secure public SOP sharing |
| JWT Tokens | Jitsi JaaS JWT tokens with role-based permissions |

---

## 7. Data Model

### 7.1 Core Entities

| Entity | Description |
|---|---|
| Users | User accounts with roles, status, and Google OAuth tokens |
| Meetings | Meeting records with scheduling, agents, attendees, and moderator info |
| Recordings | Meeting recordings with AI summaries and SOP content |
| Chat Messages | Per-meeting chat history (user and AI messages) |
| Transcript Segments | Live speech-to-text segments with speaker labels |
| Meeting Transcriptions | Full post-meeting transcriptions with parsed content and action items |

### 7.2 AI & Documentation Entities

| Entity | Description |
|---|---|
| Prompts | Configurable AI prompt templates with version history |
| Prompt Versions | Version tracking with changelog and full content snapshots |
| Agents | AI agent configurations with capabilities and prompt links |
| SOPs | Structured SOP documents with decision points, exceptions, and flowcharts |
| SOP Versions | Version tracking for SOP change history |
| Observation Sessions | 3-phase workflow: observe → structure → instruct |
| Observations | Captured screen and transcript observations |
| Clarifications | Smart questions EVA needs answered |

### 7.3 Meeting Assistant Entities

| Entity | Description |
|---|---|
| Meeting Agendas | Agenda items with completion tracking and rich text content |
| Meeting Notes | User-triggered notes with importance flags |
| Meeting Files | Uploaded documents with extracted text for AI context |
| Meeting Summaries | AI-generated summaries with audio narration URLs |
| EVA Settings | Per-user preferences for voice, wake word, and auto-summary |

### 7.4 System Entities

| Entity | Description |
|---|---|
| API Keys | External API access keys with usage tracking |
| Webhook Events | JaaS webhook event tracking for idempotency |

---

## 8. Technical Architecture

### 8.1 Frontend

- **Framework:** React 18 with TypeScript
- **Routing:** Wouter
- **State Management:** TanStack React Query
- **Styling:** Tailwind CSS v4 (dark theme, Google Meet-inspired)
- **UI Components:** shadcn/ui + Radix UI
- **Build Tool:** Vite
- **Real-Time:** WebSocket client for live AI communication
- **Design:** Mobile-first responsive layout

### 8.2 Backend

- **Runtime:** Node.js with Express
- **Language:** TypeScript with ESM modules
- **API Style:** RESTful endpoints
- **Real-Time:** WebSocket server (`ws` library) for EVA live streaming
- **Database:** PostgreSQL with Drizzle ORM
- **Validation:** Zod schemas from drizzle-zod

### 8.3 AI Stack

- **Primary AI:** Google Gemini (gemini-2.5-flash)
- **Voice AI:** ElevenLabs (TTS, conversational agents)
- **Communication:** HTTP for chat analysis, WebSocket for live observation
- **Capabilities:** Screen analysis, transcript processing, SOP/CRO generation, flowchart generation

### 8.4 Third-Party Services

- **Jitsi (JaaS):** Video conferencing infrastructure
- **Google Gemini:** AI analysis and document generation
- **ElevenLabs:** Voice assistant and text-to-speech
- **Firebase:** User authentication
- **Google Calendar:** Meeting scheduling integration
- **Sentry:** Error tracking (production only)

---

## 9. Key User Flows

### 9.1 Moderator Meeting Flow

1. Create or join a meeting (becomes moderator)
2. Select AI agents (SOP Generator, CRO Generator)
3. Start screen observation via eye icon or Start button
4. EVA captures screen and transcript, generates SOP in real-time
5. Review, edit, and finalize SOP content
6. End meeting — SOP is saved as a recording
7. Share SOP via public link

### 9.2 Participant Meeting Flow

1. Join meeting via shared link
2. Participate in video conference
3. View live SOP updates in read-only panel (broadcast from moderator)
4. Interact with EVA via chat

### 9.3 External API Flow

1. Obtain API key from admin panel
2. Call `POST /api/external/create-meeting` with optional parameters
3. Receive meeting link and moderator link
4. Share links with participants
5. Moderator opens moderator link — automatically gets elevated controls
6. SOP generation runs automatically during meeting

### 9.4 Post-Meeting Flow

1. Meeting ends, SOP content saved to recording
2. Optionally trigger AI transcription of recorded video
3. View recording with summary, transcript, and action items
4. Share SOP via token-based public link
5. Download SOP as PDF or Markdown

---

## 10. Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `GEMINI_API_KEY` | Google Gemini API key for AI features |
| `ELEVENLABS_API_KEY` | ElevenLabs API key for voice features |
| `ELEVENLABS_AGENT_ID` | EVA Meeting Assistant voice agent ID |
| `ELEVENLABS_SOP_AGENT_ID` | SOP Voice Agent ID |
| `ELEVENLABS_CRO_INTERVIEW_AGENT_ID` | CRO Interview Agent ID |
| `EXTERNAL_API_KEY` | Legacy API key for external meeting creation |
| `SENTRY_DSN` | Sentry DSN for error tracking (production only) |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Firebase Admin SDK credentials |

---

## 11. Pages & Routes

| Route | Page | Description |
|---|---|---|
| `/` | Dashboard | Meeting management, upcoming/past meetings, quick actions |
| `/login` | Login | Firebase authentication with Google Sign-In |
| `/meeting/:roomId` | Meeting Room | Full meeting experience with video, EVA panel, and SOP |
| `/calendar` | Calendar | Meeting calendar view and scheduling |
| `/admin` | Admin | User, prompt, agent, and API key management |
| `/recording/:id` | Recording Detail | View recording with summary, transcript, and SOP |
| `/sop/:id` | SOP View | Public SOP view via share token |

---

## 12. Non-Functional Requirements

| Requirement | Description |
|---|---|
| Mobile-First | All UI/UX designed mobile-first |
| Dark Theme | Google Meet-inspired dark color scheme |
| Real-Time Performance | WebSocket updates delivered within seconds |
| Scalability | WebSocket connection tracking per meeting room |
| Error Handling | Sentry integration for production error monitoring |
| Security | API key auth, Firebase auth, JWT tokens, share tokens |
| Data Persistence | All meeting data persisted to PostgreSQL |
| Graceful Degradation | System continues if AI services are unavailable |
