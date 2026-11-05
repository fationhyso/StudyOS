# Connect your Telegram agent to StudyOS

This guide assumes **Hermes Agent by Nous Research** already receives your Telegram messages. Other agents can use the same HTTP API. StudyOS does not run a second Telegram bot or require your Telegram bot token.

## What happens

1. You message your existing bot: “Schedule biology tomorrow at 18:00 for 45 minutes.”
2. Hermes loads the included StudyOS skill, resolves the date/time, and runs its Python helper.
3. The helper sends an authenticated request to your StudyOS server.
4. StudyOS checks the key, permissions, and account ownership, then saves the session in SQLite.
5. Hermes replies with the saved details. Refresh the Schedule page to see the session.

For files: Telegram attachment → gateway downloads it → helper uploads the local file → StudyOS extracts/indexes it → Hermes checks indexing status. You can then request a plan or ask the tutor about it. Telegram and your existing agent still process your messages/attachments; “self-hosted” refers to StudyOS storage. StudyOS's external AI provider receives retrieved material when configured and used.

**Calendar scheduling is implemented. Timed Telegram reminders and arbitrary background jobs are not provided by StudyOS.** Use Hermes's own scheduling/reminder features for those. No live Telegram connection has been configured or tested on your behalf.

## 1. Start/update StudyOS

```sh
docker compose up --build -d
```

Existing databases are preserved; the new agent_keys table is created automatically at startup. Sign in and open **Agent connections** in the sidebar. Create a key with Schedule and Documents permissions. Add AI if you want to call the document tutor; Notes is optional. Copy the key immediately—it is only shown once. Keys expire in 90 days in the UI (API supports 1–365 days), can be revoked at any time, and are stored as SHA-256 hashes. Each selected area grants read/write/delete access within your account. Keys cannot change accounts or create more keys.

## 2. Install the skill on the Hermes machine

Copy the `integrations/hermes/studyos` directory from this project to the machine running Hermes. From the copied project root:

```sh
mkdir -p ~/.hermes/skills/productivity
cp -R integrations/hermes/studyos ~/.hermes/skills/productivity/studyos
```

If the target already exists, review/replace that skill deliberately. Python 3 is required; the helper has no pip dependencies. Ensure Hermes has terminal/tool execution available for Telegram and the skill is enabled for that platform.

## 3. Configure the gateway environment locally

Add these values to Hermes's local `~/.hermes/.env` (or your gateway's secret/environment configuration):

```dotenv
STUDYOS_URL=http://127.0.0.1:8000
STUDYOS_API_KEY=studyos_REPLACE_WITH_YOUR_KEY
```

Do not paste the key into Telegram or agent prompts. Restart your Hermes gateway/service after configuration. The skill declares both environment variables so supported Hermes sandboxes pass them through. If your gateway uses a custom environment mechanism, verify both variables reach its terminal execution environment.

Choose a URL reachable **from the helper's execution environment**:

| Agent location | StudyOS URL |
| --- | --- |
| Same host, no agent sandbox | `http://127.0.0.1:8000` |
| Same Docker network | `http://studyos:8000` (join the StudyOS Compose network) |
| Docker Desktop agent reaching host | `http://host.docker.internal:8000` |
| Other server or remote sandbox | Your HTTPS domain or reachable private VPN address |

`localhost` inside an agent container refers to that container. Browser access from your laptop does not prove the agent can reach the server. Use HTTPS for remote connections; keep the integration restricted to trusted Telegram users through your existing gateway configuration. A shared bot using one key operates as that key's account.

## 4. Verify from the agent execution environment

With environment variables loaded, run:

```sh
python3 ~/.hermes/skills/productivity/studyos/scripts/studyos.py files
```

A JSON array (including `[]`) confirms authenticated access. Then send your bot:

> Use the studyos skill. Schedule biology tomorrow at 18:00 for 45 minutes, using Europe/Athens time.

> Upload this attached syllabus to StudyOS, wait until it is indexed, and tell me the document ID.

> Generate a study plan from that syllabus for next week, weekdays at 18:00, 90 minutes per day.

Hermes should resolve actual dates, inspect existing sessions for conflicts, and report returned IDs. StudyOS saves wall-clock dates/times; it does not store a timezone per session. Tell Hermes your timezone. Changes appear on the next page load/refresh; there is no live push connection.

## Direct HTTP API (works with any agent)

All protected routes accept `Authorization: Bearer <agent-key>`. Keep the key in environment/secret storage. For example, with shell environment variables already configured:

```sh
curl --fail-with-body "$STUDYOS_URL/api/schedule" \
  -H "Authorization: Bearer $STUDYOS_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Biology revision","date":"2026-11-06","start_minutes":1080,"duration_minutes":45}'

curl --fail-with-body "$STUDYOS_URL/api/documents" \
  -H "Authorization: Bearer $STUDYOS_API_KEY" \
  -F 'file=@/absolute/path/syllabus.pdf'
```

These dates are examples. `start_minutes` is minutes after midnight: 18×60=1080. Uploads use multipart field `file`, not JSON/base64. Receipt returns `201` with a document ID and processing status. Poll `GET /api/documents/{id}` until `ready` or `error` before generating a plan. Default upload limit is 25 MB; the helper also limits uploads to 25 MB. PDF, TXT, MD, PNG/JPEG/WebP, DOCX/PPTX/XLSX are supported. Scanned PDFs need embedded text or preprocessing.

| Action | Method and path | Key permission |
| --- | --- | --- |
| List calendar | `GET /api/schedule?start=YYYY-MM-DD&end=YYYY-MM-DD` | schedule |
| Create session | `POST /api/schedule` | schedule |
| Move/complete session | `PATCH /api/schedule/{id}` | schedule |
| Generate plan | `POST /api/schedule/generate` | schedule |
| Upload/list files | `POST /api/documents`, `GET /api/documents` | documents |
| File indexing status | `GET /api/documents/{id}` | documents |
| Read extracted content | `GET /api/documents/{id}/content` | documents |
| Grounded tutor | `POST /api/ai/chat` | ai |
| Create note | `POST /api/notes` | notes |

The `schedule` and `ai` permissions can use your existing documents as context; grant them only to agents you trust with your study materials. Full schemas: your running server's `/docs` and `/openapi.json`. Login JWTs still work, but agent keys avoid password sharing and can be individually revoked.

## Troubleshooting

- Connection refused: start StudyOS and fix the URL/network visible to the gateway or sandbox.
- 401: key is missing, expired, or revoked. Create a replacement in Agent connections.
- 403: create a key with the needed permission. Existing keys cannot expand their own permissions.
- File absent on disk: download through your Telegram gateway first; the helper cannot upload a Telegram file ID or remote URL.
- Still indexing/error: inspect status; extraction may fail for damaged, encrypted, or image-only PDFs.
- Timeout after a write: check sessions/files before retrying; writes are not idempotent.
- No reminder arrives: saving a calendar session does not install a timed Telegram notification.

Hermes references: [skill format and environment passthrough](https://hermes-agent.nousresearch.com/docs/developer-guide/creating-skills), [using/enabling skills](https://hermes-agent.nousresearch.com/docs/guides/work-with-skills).


## Subject folders (Notability-style organization)

In **Files & resources**, choose **New folder**, enter a subject such as Biology, and select that folder. New uploads go into the selected folder. Each file has a folder selector for moving it. All files shows the whole library; Unfiled shows files with no subject. Folder cards show file counts and rename/delete controls. Deleting a folder **keeps its files in Unfiled**; it does not delete documents or their indexes. Folders are one level deep.

Your existing `documents` agent permission includes folders. Update the installed Hermes skill/helper by copying the latest `integrations/hermes/studyos` directory to the agent machine again. Then say:

> Create a Biology folder in StudyOS and upload this attachment into it.

> Move my algebra syllabus into Mathematics.

> Delete the Biology folder, keeping its files.

The agent lists folders, resolves their IDs, then calls the relevant endpoint. Duplicate folder names are allowed; the skill asks you to disambiguate. The API checks that both the file and destination belong to the authenticated user.

| Action | API |
| --- | --- |
| List/create folders | `GET /api/folders`, `POST /api/folders` with `{"name":"Biology"}` |
| Rename folder | `PATCH /api/folders/3` with `{"name":"Molecular Biology"}` |
| Delete folder, preserve files | `DELETE /api/folders/3` |
| Upload into folder | `POST /api/documents?folder_id=3` (multipart field `file`) |
| List subject files | `GET /api/documents?folder_id=3` |
| List Unfiled | `GET /api/documents?unfiled=true` |
| Move file | `PATCH /api/documents/7` with `{"folder_id":3}` |
| Remove file from folder | `PATCH /api/documents/7` with `{"folder_id":null}` |

All routes above require the `documents` agent permission. Existing installations automatically add a nullable folder link on startup; existing uploads remain Unfiled. Back up your persistent volume before upgrading as usual.
