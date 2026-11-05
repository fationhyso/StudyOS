# StudyOS

A calm, private, self-hosted study workspace. StudyOS combines a Notion-style notes workspace, an adaptable study calendar, a searchable resource library, and a document-grounded AI tutor in one Docker-deployable application.

## What’s included

- **Dashboard:** today’s focus, weekly progress, study streaks, quick capture, recent materials, and upcoming sessions.
- **Study schedule:** week and agenda views, manual sessions, completion tracking, drag-to-reschedule, and personalized schedule generation with spaced review and active recall.
- **Notes & docs:** searchable, reorderable pages with favorites, autosave, Markdown formatting, preview, and split view.
- **Files & resources:** drag-and-drop uploads for PDF, TXT, Markdown, PNG/JPEG/WebP, DOCX, PPTX, and XLSX. Images are indexed with OCR.
- **PDF viewer:** page navigation, zoom, rotation, full-screen mode, selectable text, cross-page search, match navigation, and highlighting.
- **AI tutor:** persistent conversations, document scoping, source citations, and direct links to referenced files.
- **Private accounts:** JWT authentication, bcrypt password hashing, per-user authorization, and isolated documents, notes, conversations, and schedules.
- **Light and dark themes**, responsive navigation, keyboard-friendly dialogs, and reduced-motion support.

The app works without external AI credentials. Offline mode provides lexical document retrieval, cited source passages, and a deterministic learning-science planner. An optional OpenAI-compatible provider enables synthesized tutoring responses and LLM-generated schedules; the local planner remains a fallback if the provider is unavailable.

## Quick start with Docker

### 1. Configure the environment

```bash
cp .env.example .env
```

StudyOS can start with the defaults. For a production or shared deployment, generate a stable JWT secret:

```bash
openssl rand -hex 32
```

Put the result in `.env` as `JWT_SECRET=...`. If omitted, a cryptographically random secret is generated with owner-only permissions and persisted in the data volume.

To enable enhanced AI, also set:

```dotenv
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

`OPENAI_BASE_URL` can point to any OpenAI-compatible chat-completions endpoint, including a suitably configured local model server. Documents and prompts are sent to that provider only when a key is configured.

### 2. Build and run

```bash
docker compose up --build
```

Open **http://localhost:8000**, create your local account, and upload a syllabus or notes. To use another host port, set `PORT=8080` in `.env` and open `http://localhost:8080`.

Run in the background with:

```bash
docker compose up --build -d
docker compose logs -f studyos
```

Stop the app without deleting data:

```bash
docker compose down
```

### 3. Persistent data and backups

The `studyos_data` named volume mounted at `/app/data` contains:

- `studyos.db` — accounts, notes, schedules, conversations, extracted text, and search chunks;
- `uploads/` — original uploaded files;
- `.jwt_secret` — the automatically generated signing key when `JWT_SECRET` is empty.

Back up the volume while the container is stopped:

```bash
docker compose down
docker run --rm -v studyos_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/studyos-backup.tar.gz -C /data .
docker compose up -d
```

Do not use `docker compose down -v` unless you intentionally want to delete all workspace data.

## Project structure

```text
.
├── Dockerfile                    # Multi-stage React build + non-root Python runtime
├── docker-compose.yml            # App, environment, health check, persistent volume
├── .env.example                  # Safe configuration template
├── backend/
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py               # FastAPI setup, security headers, SPA hosting
│   │   ├── config.py             # Environment and storage configuration
│   │   ├── database.py           # SQLAlchemy engine/session and SQLite safeguards
│   │   ├── models.py             # Users, documents, notes, sessions, chat models
│   │   ├── schemas.py            # Validated API request/response contracts
│   │   ├── security.py           # bcrypt and JWT helpers
│   │   ├── deps.py               # Authenticated-user dependency
│   │   ├── routers/
│   │   │   ├── auth.py           # Signup, login, profile
│   │   │   ├── documents.py      # Private uploads, content, download, deletion
│   │   │   ├── notes.py          # Notes CRUD, search, favorites, ordering
│   │   │   ├── schedule.py       # Session CRUD and schedule generation
│   │   │   ├── ai.py             # Grounded chat and persistent conversations
│   │   │   └── dashboard.py      # Live workspace statistics
│   │   └── services/
│   │       ├── documents.py      # PDF/Office/image extraction and chunk indexing
│   │       ├── ai.py             # RAG-lite retrieval and OpenAI-compatible client
│   │       └── planner.py        # Offline spaced-repetition study planner
│   └── tests/                    # API integration tests
└── frontend/
    ├── src/
    │   ├── components/           # Sidebar, modals, PDF/document viewers, planners
    │   ├── context/              # Authentication, theme, toast providers
    │   ├── lib/                  # Typed API client and date/format helpers
    │   ├── pages/                # Dashboard, Schedule, Notes, Files, AI Tutor
    │   └── types/                # Shared TypeScript contracts
    ├── package.json
    └── vite.config.ts
```

## Local development

Requirements: Python 3.12+, Node.js 22+, and Tesseract OCR (only required for image indexing).

### Backend

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements-dev.txt
cd backend
uvicorn app.main:app --reload
```

The API is available at `http://localhost:8000`; interactive OpenAPI docs are at `http://localhost:8000/docs`. Local backend data defaults to `backend/data`.

### Frontend

In a second terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` requests to the backend on port 8000.

### Verification

```bash
# From backend/
pytest -q

# From frontend/
npm run build
```

## Deployment notes

- The container runs as an unprivileged user and includes a health check.
- For internet-facing use, put StudyOS behind an HTTPS reverse proxy and set a strong `JWT_SECRET`.
- Each account is private to its user, but anyone who can reach the app can create an account. After creating your account, set `ALLOW_SIGNUP=false` in `.env` and recreate the container to disable new registrations.
- Uploads are limited to 25 MB by default (`MAX_UPLOAD_MB`) and stored outside the application source tree.
- SQLite is a deliberate single-container default. For many concurrent users, set `DATABASE_URL` to a SQLAlchemy-compatible database URL and install the appropriate database driver.
- AI calls have a 75-second timeout. If a provider fails or returns an invalid schedule, StudyOS falls back to local behavior rather than losing the request.

## Verification and current limits

The production React build and twenty-six backend tests pass. Tests cover signup/login, notes, private document access, indexing and cited retrieval, schedule generation, invalid AI schedule fallback, disabling registration, agent key permissions/expiry/revocation, helper uploads/scheduling, subject folder lifecycle/privacy, and existing database upgrades. The served login screen was also checked in a browser. Docker image execution requires Docker Engine or Docker Desktop and was not verified in the development environment.

- PDF highlighting marks search results; saved freehand or selection annotations are not implemented.
- PDF extraction reads embedded text. Scanned PDFs need OCR before upload; image uploads use Tesseract OCR.
- Notes use Markdown editing with reorderable pages, rather than a full Notion block editor.
- Offline tutoring returns source passages. Synthesized answers require a configured AI provider.
- The default deployment uses one API process, in-process indexing, and SQLite; it is intended for a personal or small shared server.

## Telegram / Hermes agent integration

Open **Agent connections** to create an expiring, scoped API key for your existing agent. The included Hermes skill and dependency-free Python helper support creating/listing/completing sessions, uploading files, generating plans, and asking the tutor. See [the complete setup guide](docs/TELEGRAM_AGENT.md). This adds calendar entries; timed Telegram reminders remain the responsibility of your agent.


## Subject folders

Organize files into subject folders in Files & resources. Create/rename/delete folders, filter by subject, upload directly into the selected folder, and move files using their folder selector. Removing a folder keeps its files in Unfiled. Existing uploads are preserved during the automatic database upgrade. Agents with `documents` permission can manage folders through the API or included Hermes helper; see [folder commands](docs/TELEGRAM_AGENT.md#subject-folders-notability-style-organization).


## DeepSeek API

DeepSeek is supported for both the document tutor and study schedule generation. In your server's `.env`, set:

```dotenv
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=your-deepseek-api-key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-flash
```

Create a key in [DeepSeek's platform](https://platform.deepseek.com/). `deepseek-flash` is the current default from [DeepSeek's API documentation](https://api-docs.deepseek.com/); `deepseek-v4-pro` can also be selected through `DEEPSEEK_MODEL`. StudyOS explicitly disables thinking mode to keep answer latency/output budgets predictable. No model runs on your Raspberry Pi; the Pi handles the app, storage, and document extraction and calls DeepSeek over the internet.

Apply the new source and configuration:

```sh
sudo docker compose up --build -d
```

The tutor displays the selected provider/model. This indicates configuration, not a successful connectivity/balance check. When its API is unavailable, times out, or returns invalid/empty output, the existing offline retrieval/planner fallback is used. Keys stay on the backend. Questions, conversation context, and retrieved excerpts (or schedule material excerpts) are sent to the selected provider when you use AI features.

`AI_PROVIDER=openai` preserves the existing `OPENAI_*` configuration. `AI_PROVIDER=offline` disables all external AI requests even if keys are present. Only the selected provider's key is used; failures do not forward your material to another provider. This setting controls StudyOS's tutor/planner; it does not change the model used by your separate Hermes Telegram agent. DeepSeek integration is verified with mocked API responses, not a paid live request.
