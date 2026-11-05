# Conversational AI — POC

Chat app (ChatGPT-like) → FastAPI backend → AWS Bedrock AgentCore agent that captures customer intent.

| Folder      | What                              | Owner  |
|-------------|-----------------------------------|--------|
| `frontend/` | React (Vite + TS) chat UI         | Vinod  |
| `backend/`  | FastAPI + Postgres                | Rajesh |
| `agent/`    | AgentCore agent (needs R Systems AWS + AgentCore access) | TBD |

## API contract (FE ↔ BE)

`POST /api/chat`
```json
// request
{ "session_id": "string", "message": "string" }
// response
{ "session_id": "string", "reply": "string", "intent": "string | null", "message_id": "integer | null" }
```
`message_id` is the id of the assistant message created for this reply, and it is the id to rate with the feedback
endpoint below. It is always an integer today. Clients that don't use it can ignore it.

`POST /api/messages/{message_id}/feedback`: rate one assistant message. Submitting again for the same message replaces
the earlier feedback.
```json
// request: rating is required; reason (only with "down") and comment (max 1000 chars) are optional
{ "rating": "up | down", "reason": "incorrect | unclear | wanted_a_person | other", "comment": "string" }
// response 200 (created or replaced)
{ "message_id": 42, "rating": "down", "reason": "string | null", "comment": "string | null",
  "trace_id": null, "created_at": "ISO-8601", "updated_at": "ISO-8601" }
```
`trace_id` is always `null` until agent tracing exists, and the reason list is provisional (pending approval).
Invalid input returns 400 `{"detail": "<message>"}` and stores nothing: a `message_id` that isn't a positive whole
number, a body that isn't a JSON object, a bad `rating`, `reason` or `comment`, `reason` with `"up"`, or a user
message (only assistant messages can be rated). An unknown message returns 404 `{"detail": "message not found"}`.
See `specs/002-answer-feedback/contracts/feedback-api.md` for the exact messages.

`GET /api/chat/{session_id}/history`: every message in the session, oldest first. An unknown session returns `"messages": []`.
```json
{ "session_id": "string",
  "messages": [ { "id": 1, "role": "user | assistant", "content": "string",
                  "intent": "string | null", "latency_ms": "number | null",
                  "source": "agent | mock | null", "created_at": "ISO-8601" } ] }
```

`GET /api/sessions?ids=<id>&ids=<id>…`: summaries of the given sessions for the sidebar, most recently active first.
The frontend sends the session IDs this browser has used. Unknown IDs are skipped, and more than 200 IDs returns
400 `{"detail": "too many session ids (max 200)"}`.
```json
{ "sessions": [ { "session_id": "string", "title": "first user message (max 80 chars + …)",
                  "created_at": "ISO-8601", "last_active_at": "ISO-8601" } ] }
```

`GET /api/health` → `{ "status": "ok" }`

The backend calls the agent with `{ "prompt": "<message>", "session_id": "..." }` and expects
`{ "reply": "...", "intent": "..." }` back. Until AgentCore access is ready, the backend returns a mock reply.

## Run locally

```bash
# Postgres + backend
docker compose up --build        # backend on http://localhost:8000

# Frontend
cd frontend && npm install && npm run dev   # http://localhost:5173 (proxies /api to :8000)

# Agent (once AWS access is set up)
cd agent && uv run agent.py      # local AgentCore runtime on http://localhost:8080
```

## Backend: run and test

```bash
# Run (Postgres + backend; migrations run on startup)
docker compose up --build

# Test (no Postgres needed; uses in-memory SQLite)
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
pytest
```

## Agent: local wealth agent (Strands + Ollama)

Spec: `specs/005-wealth-agent/`. Runs fully locally against Ollama (`llama3.2` by default); synthetic data, read-only tools.

```bash
ollama pull llama3.2 && ollama serve          # http://localhost:11434
cd agent
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
pytest                                        # unit tests, no Ollama needed
PYTHONPATH=src python -m wealth_agent         # interactive chat
PYTHONPATH=src python evals/run_eval.py       # live golden-case eval (needs Ollama)
```

Config: `WEALTH_AGENT_PROVIDER` (only `ollama`), `OLLAMA_HOST`, `OLLAMA_MODEL`.

## Frontend: test

```bash
cd frontend && npm install && npm test   # vitest + jsdom, fetch is mocked (no backend needed)
```

## Frontend: UI kit and theme

The UI follows the Figma file *WPI Day 1.5 (P&A and P&E)*, by way of the Alfred mock UI built from it.
The chat is the full-page Alfred layout (Figma frame A9): header, left icon rail, a History panel for past chats,
and the "Good morning" welcome (frame S1) on an empty chat.

- **Design tokens** (colors, type scale, radii, shadows, gradients) live only in `frontend/src/styles/theme.css`,
  as a Tailwind v4 `@theme`. Tailwind's default palette is removed, so classes like `bg-primary`, `text-navy` and
  `shadow-card` always match the design. No hex colors anywhere else; a test enforces this. Light theme only.
- **Font:** the design uses FS Elliot Pro (licensed). The app falls back to Source Sans 3 (`@fontsource`).
- **Reusable components** live in `frontend/src/components/` and are plain React + Tailwind, with unstyled
  [Radix UI](https://www.radix-ui.com) primitives where behavior matters (tabs, toggle groups):

  | Component | Use |
  |---|---|
  | `Button` | `primary`, `secondary`, `link`, `ai` (gradient), `ghost`; sizes `sm`, `md`, `lg`, `icon` |
  | `AiButton` | Alfred's full-width gradient call to action (welcome cards) |
  | `Chip`, `ChoiceChips` | Alfred quick replies; pick-one chip group (a radio group for screen readers) |
  | `TextField`, `Textarea` | Labelled inputs with error state |
  | `Card`, `StatusTag`, `ProgressBar`, `KeyValueList`, `Tabs` | Dashboard building blocks for the next screens |
  | `PrincipalLogo`, `PrincipalMark`, `AlfredOrb` | Brand assets from Figma (`src/assets/brand/`) |

- **Chat screens** live in `frontend/src/chat/`, and the demo sign-in in `frontend/src/auth/`.
- **Sign-in is a demo:** any username and password are accepted, only the username is kept (in `localStorage`),
  and nothing is checked or sent to the backend. Replace `src/auth/user.ts` with real authentication later.
- Answer feedback: thumbs up/down, an optional reason and a comment under each reply, sent to
  `POST /api/messages/{message_id}/feedback` (spec 002). Ratings are shown for the current visit only;
  history does not return them yet. See `specs/004-answer-feedback-ui/`.

## Feature development (Spec Kit)

New features use [Spec Kit](https://github.com/github/spec-kit), in Claude Code, from the repo root.
Project rules live in `.specify/memory/constitution.md`, and each feature's artifacts are written to `specs/<feature>/`.

1. `/speckit-specify <what you want and why>`: writes the feature spec to `specs/<feature>/spec.md`. Create your feature branch first.
2. `/speckit-clarify` (optional): answers open questions in the spec.
3. `/speckit-plan <tech notes>`: produces the implementation plan and checks it against the constitution.
4. `/speckit-tasks`: breaks the plan into ordered tasks. Run `/speckit-analyze` (optional) to check consistency.
5. `/speckit-implement`: builds the feature from the tasks.

Review the generated spec and plan before moving to the next step. If an API contract changes, update the contract section above in the same PR.
