# StudyOS

A calm, private, self-hosted study workspace. StudyOS combines a Notion-style notes workspace, an adaptable study calendar, a searchable resource library, and a document-grounded AI tutor in one Docker-deployable application.

## What’s included

- **Dashboard:** today’s focus, weekly progress, study streaks, quick capture, recent materials, and upcoming sessions.
- **Study schedule:** month, week, and agenda views, manual sessions, completion tracking, drag-to-reschedule, and personalized schedule generation with spaced review and active recall.
- **Notes & docs:** searchable, reorderable pages with favorites, autosave, Markdown formatting, preview, and split view.
- **Files & resources:** drag-and-drop uploads for PDF, TXT, Markdown, PNG/JPEG/WebP, DOCX, PPTX, and XLSX. Images are indexed with OCR.
- **PDF viewer:** continuous scrolling with nearby-page rendering, page navigation, zoom, rotation, full-screen mode, selectable text, cross-page search, match navigation, and highlighting.
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

The production React build and forty-two backend tests and ten frontend tests pass. Tests cover signup/login, notes, private document access, indexing and cited retrieval, schedule generation, invalid AI schedule fallback, disabling registration, agent key permissions/expiry/revocation, helper uploads/scheduling, subject folder lifecycle/privacy, and existing database upgrades. Browser checks covered PDF selection and saved highlights, nested folder navigation, the month calendar, and both notes/sidebar collapse controls. Docker image execution requires Docker Engine or Docker Desktop and was not verified in the development environment.

- PDF text highlights are saved to the workspace database, remain aligned through zoom/rotation, and can be revisited or removed in the highlights panel. Freehand drawing and embedding annotations into downloaded PDF files are not implemented.
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


The resource library now supports nested folders, a searchable tree, breadcrumbs, and searchable file/folder move dialogs. Deleting a folder moves its direct files to Unfiled and promotes its immediate subfolders one level. Existing folders become root folders during the additive upgrade. The schedule Month view supports date navigation, session creation/editing/completion, and dragging sessions between days; crowded days link to the agenda. Notes has a toolbar control for collapsing its page list, and the workspace collapse arrow stays above adjacent panels.


### Highlighting PDF text

Open a PDF, select text, and click **Save highlight** (or the highlighter toolbar button). The saved-highlight panel lists excerpts by page and lets you jump to or remove them. Highlights persist across sessions and stay private to the account owning the PDF. Continuous scrolling renders pages near the viewport to keep memory use reasonable on a Pi. The original PDF download remains unchanged; annotations live in the database and are included in data-volume backups.


## AI-created Markdown notes and LaTeX

In AI study tutor, select **Create note** and describe what to write, or send `/note Create a revision guide from my materials`. Generated notes are saved automatically to Notes & docs with source links and an **Open saved Markdown note** button. Any existing assistant response also has **Save as note**. Repeatedly saving the same response reopens the same note rather than duplicating it. Deleting a chat keeps its saved notes. If the provider is unavailable, readable uploaded material can be saved as clearly labeled source excerpts; no note is created when neither material nor a working provider is available.

Notes open in rendered preview by default. Use **Edit** or **⌘+E** (Mac) / **Ctrl+E** (Windows/Linux) to toggle editing and preview. Inline math uses `$E=mc^2$`. Put `$$` on separate lines around display equations, for example:

```markdown
$$
\int_0^1 x^2\,dx = \frac{1}{3}
$$
```

LaTeX math is rendered locally with KaTeX in notes, the tutor, and Markdown file previews; no external rendering service is used. Raw HTML is not enabled, and unsafe KaTeX extensions are disabled. The download button exports the current Markdown draft as `.md` (including its LaTeX source). Persistent notes remain in SQLite and are included in the existing data-volume backup. Authenticated API clients can export saved notes at `/api/notes/{id}/file`. Agent note creation requires both `ai` and `notes` permissions.


## Calendar sessions from the tutor

Choose **Create session**, use `/session`, or send an explicit request such as “Schedule biology tomorrow at 18:00 for 45 minutes.” Dates use your browser's local date and timezone. The optional date/time/minutes fields override details in your message. The tutor writes one real calendar session, returns its saved details, and provides **Open calendar** to open that session for editing. Missing/ambiguous details or a conflicting session produce a clarification rather than an unexpected calendar entry. For a whole study plan, use Schedule → Generate plan. With no provider key, the tutor can parse simple today/tomorrow/ISO-date requests with 24-hour or am/pm times; complete structured details always work without AI. These are calendar entries, not timed Telegram notifications.

Files & resources opens a full responsive grid of root folders, with no capped inner scrolling list. The cross-folder All files view has been removed; documents appear in their subject folder or Unfiled. Root uploads go to Unfiled. Very large folder collections can still require ordinary page scrolling.

PDF highlighting has **Undo last highlight**, also available with **⌘/Ctrl+Z** while focus is inside the viewer (outside text inputs). It removes the most recently saved highlight action from the current viewer session, including all its pages. Search fields retain their normal text undo. Double-click a note's rendered preview to enter edit mode; links retain their normal behavior. Preview remains the default on opening a note.
