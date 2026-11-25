# AI Learning Management System (AI LMS)

A full-stack **AI Learning Management System** built as an npm monorepo with **Next.js 15** (App Router, React 19, Tailwind CSS, Radix UI) on the frontend and an **Express 4** TypeScript REST API on the backend. Persistence runs on **Neon PostgreSQL** with `pgvector` via **Prisma ORM**, authentication is handled by **Clerk**, and AI workflows combine **Google Gemini** (`gemini-3.1-flash-lite` & `gemini-embedding-001`) with **Groq Whisper** (`whisper-large-v3-turbo`) for lecture audio transcription.

- **Live Frontend (Vercel):** [https://ai-learning-mgmt.vercel.app](https://ai-learning-mgmt.vercel.app)
- **Live Backend (Render):** [https://ai-learning-mgmt.onrender.com/health](https://ai-learning-mgmt.onrender.com/health)

---

## Core Capabilities

- **Course Management & Enrollment:** Create courses as an instructor/owner, edit or delete owned courses, search public courses in Explore, enroll with one click, and leave enrolled courses cleanly.
- **File Uploads & Manual `Write Note` Editor:**
  - Drag-and-drop upload for `PDF`, `DOCX`, `DOC`, `TXT` (up to `50 MB`) and lecture audio (`MP3`, `WAV`, `M4A`, `OGG`, `WEBM`, `AAC`, `FLAC` up to `25 MB`).
  - Built-in **Write Note** editor to write or paste lecture notes and study outlines directly without needing a local file.
  - Background text extraction (`pdfjs-dist`, `mammoth`, Groq Whisper transcription), recursive chunking, and 768-dim vector embedding (`pgvector`) with inline **View Note / Transcript** preview and retry on failed jobs.
- **Structured Document Summaries:** Generates detailed Markdown study guides sampled across the full document (Key Concepts, Terms & Definitions, Key Takeaways) with caching and one-click **Regenerate**.
- **Unified `Ask AI` Tab:** Switch seamlessly between **Notes Only** (strict RAG answers with inline cited source snippets) and **Tutor Mode** (step-by-step guided explanations with multi-turn follow-up context), scoped to all materials or a single selected file.
- **Practice Quizzes (`1–25` Questions):** Generate customizable MCQs with optional **Difficulty** (`easy` / `medium` / `hard`) and **Topic** focus. Quizzes generate asynchronously in the background while keeping the workspace responsive, strip answers during attempts, support **Last Results** review with explanations, and let owners delete quizzes.
- **Personalized Study Planner:** Builds structured weekly schedules and task breakdowns informed by course materials, weekly available hours, target exam dates, and topics missed on past quizzes.
- **Assignment Evaluator:** Submit text drafts or attach `PDF` / `DOCX` / `TXT` documents for rubric grading out of 10 with strengths, weaknesses, revision suggestions, submitted-work viewer, and submission deletion.
- **Learning Analytics Dashboard:** Tracks courses, uploaded materials, quiz attempts, evaluated assignments, average scores, recent score charts (Recharts), per-course completion progress, quick course cards, and cold-start wake notices.

---

## Project Structure

```text
├── client/                  # Next.js 15 App Router frontend (React 19, Tailwind, Clerk, Recharts)
│   └── src/
│       ├── app/             # Landing page, auth routes, Dashboard, Courses, Explore
│       ├── components/      # MaterialUploader (Upload + Write Note), MaterialList, CourseChat (Ask AI),
│       │                    # CourseQuizzes, CourseStudyPlan, CourseAssignments, UI primitives
│       └── lib/api.ts       # Typed API client with Clerk Bearer token attachment
├── server/                  # Express 4 TypeScript REST API
│   ├── prisma/              # Prisma schema, migrations, and deterministic seed script
│   ├── scripts/             # Automated API & Phase 3 verification suites
│   └── src/
│       ├── controllers/     # Auth, Course, Material, Chat, Tutor, Quiz, StudyPlan, Assignment, Progress
│       ├── middleware/      # Clerk JWT auth, Zod request validation, Multer disk upload, error handler
│       ├── routes/          # Express routers under /api/*
│       └── services/        # RAG vector search, Gemini AI, Groq Whisper, background recovery, analytics
└── package.json             # npm workspaces root scripts (dev, build, lint, test, seed)
```

---

## Environment Configuration

### 1. Backend (`server/.env`)

```env
# Server Configuration
PORT=8000
NODE_ENV=development
# Single origin or comma-separated origins allowed by CORS
CLIENT_URL=http://localhost:3000

# Database (Neon Postgres with pgvector)
DATABASE_URL="postgresql://user:password@ep-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require"
DIRECT_URL="postgresql://user:password@ep-direct.us-east-2.aws.neon.tech/neondb?sslmode=require"

# Clerk Authentication (Server Secret Key)
CLERK_SECRET_KEY="sk_test_..."

# Google Gemini AI (Embeddings & Chat / Summaries / Quizzes / Study Plan / Grading)
GEMINI_API_KEY="AIzaSy..."

# Groq Cloud (Audio transcription via whisper-large-v3-turbo)
GROQ_API_KEY="gsk_..."

# File Storage & Upload Limits
UPLOAD_DIR=./uploads
MAX_FILE_SIZE_MB=50
MAX_AUDIO_FILE_SIZE_MB=25
```

### 2. Frontend (`client/.env.local`)

```env
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."

# Backend API URL
NEXT_PUBLIC_API_URL="http://localhost:8000"
```

---

## Running Locally

```bash
# 1. Install dependencies across client and server workspaces
npm install

# 2. Apply database migrations and generate Prisma client
cd server && npx prisma migrate deploy && npx prisma generate && cd ..

# 3. Seed demo users, courses, and sample materials (optional)
npm run seed

# 4. Run frontend (port 3000) and backend (port 8000) concurrently
npm run dev
```

Available workspace scripts from the repository root:

- `npm run dev` — Start both Next.js and Express dev servers
- `npm run build` — Run `prisma generate && tsc` on `server` and `next build` on `client`
- `npm run lint` — Type-check server (`tsc --noEmit`) and lint client (`next lint`)
- `npm test` — Run all backend verification suites (`test-api.ts` and `test-phase3.ts`)

---

## Verification & Testing

Run all automated tests from the root directory:

```bash
npm test
```

Or run each suite individually:

```bash
# Core permissions, upload validation, Write Note disk fallback, and unenroll checks
npm run test:api -w server

# End-to-end HTTP routes & Gemini integration (quizzes 1-25, review/delete, Ask AI, file assignment eval)
npm run test:phase3 -w server
```

Manual REST testing can also be run via `server/api.http`. To grab a live Clerk JWT in development, sign in on `http://localhost:3000`, open DevTools Console, and run `await window.Clerk.session.getToken()`.

---

## API Reference

### Health & Auth
- `GET /health` — Server and Postgres connection status (`{ status, database, timestamp }`)
- `GET /api/auth/me` — Resolves and upserts the authenticated user record from Clerk

### Courses & Enrollment
- `GET /api/courses` — List courses owned or enrolled by the current user (includes `isOwner`)
- `GET /api/courses/explore` — List available courses the user has not joined yet
- `POST /api/courses` — Create a course (`{ title, description? }`)
- `GET /api/courses/:id` — Fetch course details, owner, and materials (owner or enrolled only)
- `PUT /api/courses/:id` — Update course details (owner only)
- `DELETE /api/courses/:id` — Delete course and cascade materials/quizzes (owner only)
- `POST /api/courses/:id/enroll` — Enroll in a course (non-owner only)
- `DELETE /api/courses/:id/enroll` — Unenroll / leave an enrolled course (non-owner only)

### Materials & Notes
- `GET /api/materials/:courseId` — List all materials in a course (owner or enrolled)
- `GET /api/materials/file/:materialId` — Stream or download a material (with `transcript` fallback for written notes)
- `POST /api/materials/:courseId/upload` — Upload a document (`<= 50 MB`) or audio file (`<= 25 MB`) via `multipart/form-data`
- `POST /api/materials/:courseId/text` — Create a manual text note (`{ title, content }`) and index it cleanly
- `POST /api/materials/:materialId/summary` — Generate or fetch structured summary (`{ force?: boolean }`)
- `POST /api/materials/:materialId/reprocess` — Retry background processing for failed/pending materials
- `DELETE /api/materials/:materialId` — Delete a material and stored file (uploader or course owner)

### Ask AI, Quizzes, Study Plans, Assignments & Progress
- `POST /api/courses/:id/chat` — Unified Ask AI (`{ question, materialId?, mode?: 'strict' | 'tutor', history? }`)
- `POST /api/courses/:id/tutor` — Dedicated Tutor endpoint (`{ question, history? }`, kept for API compatibility)
- `POST /api/courses/:id/quizzes/generate` — Generate `1–25` MCQs (`{ materialId?, numQuestions?, difficulty?, topic? }`)
- `GET /api/courses/:id/quizzes` — List quizzes with the student's latest attempt summary
- `GET /api/quizzes/:id` — Fetch sanitized quiz questions without answer keys
- `POST /api/quizzes/:id/attempt` — Submit answers (`-1` for skipped), score server-side, and return explanations
- `GET /api/quizzes/:id/attempt/latest` — View full graded breakdown of the student's latest attempt
- `DELETE /api/quizzes/:id` — Delete quiz (course owner only)
- `POST /api/courses/:id/study-plan` — Generate or replace personalized weekly plan (`{ hoursPerWeek, examDate?, goal? }`)
- `GET /api/courses/:id/study-plan` — Fetch current study plan for the user & course
- `POST /api/courses/:id/assignments` — Evaluate assignment draft via text (`{ title?, text }`) or file (`PDF` / `DOCX` / `TXT`)
- `GET /api/courses/:id/assignments` — List past evaluated submissions
- `DELETE /api/courses/:id/assignments/:assignmentId` — Delete a submission (submitter or course owner)
- `GET /api/progress` — Fetch platform counts, average quiz score, recent chart scores, recent courses, and per-course completion

---

## Deployment Architecture

- **Frontend (Vercel):** Deployed from `client/` (`Root Directory: client`) with `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, and `CLERK_SECRET_KEY`.
- **Backend (Render):** Deployed from `server/` (`Root Directory: server`) using `npm install --include=dev && npm run build` and `npx prisma migrate deploy && npm start`, backed by Neon PostgreSQL (`DATABASE_URL` + `DIRECT_URL`).
