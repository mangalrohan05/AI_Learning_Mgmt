# AI Learning Management System (AI LMS)

A modern, full-stack AI Learning Management System built as an npm monorepo with Next.js 15 (App Router, Tailwind CSS, shadcn/ui) on the frontend and an Express 4 REST API with strict TypeScript on the backend. Data persistence is managed with Prisma ORM on Neon Lakebase Postgres with `pgvector` for vector similarity search, while user authentication and RBAC session security are powered by Clerk. AI capabilities leverage Google Gemini (`gemini-2.5-flash-lite`, `text-embedding-004`) for semantic RAG document search, patient AI tutoring, automated quiz generation, personalized study planning, and assignment evaluation, combined with Groq Whisper (`whisper-large-v3-turbo`) for high-speed lecture audio transcription.

---

## Environment Configuration

### 1. Backend (`server/.env`)
```env
# Server Configuration
PORT=8000
NODE_ENV=development
CLIENT_URL=http://localhost:3000

# Database (Neon Lakebase Postgres)
DATABASE_URL="postgresql://user:password@ep-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require"
DIRECT_URL="postgresql://user:password@ep-direct.us-east-2.aws.neon.tech/neondb?sslmode=require"

# Clerk Authentication (Server Secret Key)
CLERK_SECRET_KEY="sk_test_..."

# Google Gemini AI (RAG, Tutor, Quizzes, Study Plans, Summaries)
GEMINI_API_KEY="AIzaSy..."

# Groq Cloud (Lecture Audio Transcription via whisper-large-v3-turbo)
GROQ_API_KEY="gsk_..."

# File Storage & Limits
UPLOAD_DIR=./uploads
MAX_FILE_SIZE_MB=50
MAX_AUDIO_FILE_SIZE_MB=25
```

### 2. Frontend (`client/.env.local`)
```env
# Clerk Authentication (Publishable Key)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."

# Backend API URL
NEXT_PUBLIC_API_URL="http://localhost:8000"
```

---

## Exact Commands to Run Locally

```bash
# 1. Install dependencies across the monorepo
npm install

# 2. Deploy database migrations and generate Prisma client
cd server && npx prisma migrate deploy && npx prisma generate && cd ..

# 3. Seed deterministic demo data (Alice, Bob, sample courses & materials)
npm run seed

# 4. Start frontend and backend concurrently
npm run dev
```

The frontend will be available at [http://localhost:3000](http://localhost:3000) and the Express API at [http://localhost:8000](http://localhost:8000).

---

## Verification & Testing

### Running the Automated API Test Suite
The backend includes a comprehensive automated test script (`server/scripts/test-api.ts`) that validates permission boundaries, upload limits, and edge cases against the database with automatic artifact cleanup:
```bash
npm run test:api -w server
```

Validated test cases:
1. `401` Unauthorized when request lacks a valid token
2. `403` Forbidden when non-member accesses private course details
3. `403` Forbidden when non-member accesses course materials
4. `400` Bad Request when owner attempts to enroll in their own course
5. `400` Bad Request on duplicate course enrollment
6. `403` Forbidden when non-owner modifies or deletes a course
7. `403` Forbidden when non-owner / non-uploader deletes a material
8. Rejected invalid file extensions & MIME types (e.g. `.exe`, `.js`)
9. Rejected oversized documents (`> 50MB`)
10. Rejected oversized audio recordings (`> 200MB`)
11. Accepted valid documents (`PDF`, `DOCX`, `TXT`) and audio (`MP3`, `WAV`, `M4A`)
12. Resilient file deletion (does not crash when seed file has no physical disk artifact)
13. Explore courses lists available un-enrolled courses
14. Explore courses excludes courses the user is already enrolled in or owns
15. Safe cleanup via `try/finally` preserving seeded rows

### Manual HTTP Testing via `server/api.http`
You can test all endpoints using the [VS Code REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) or JetBrains HTTP Client with `server/api.http`.

#### How to Obtain a Clerk Session Token:
1. Start the app with `npm run dev` and open `http://localhost:3000` in your browser.
2. Sign in or sign up.
3. Open your browser Developer Tools Console (`F12`) and run:
   ```javascript
   await window.Clerk.session.getToken()
   ```
4. Copy the resulting JWT string and replace `@token = ...` in `server/api.http`.

---

## Core API Endpoints

### Health Check
- `GET /health` - Minimal database connectivity and health probe (returns `{ status: "ok", database: "connected", timestamp }`)

### Auth & User Profile
- `GET /api/auth/me` - Resolves DB user from Clerk session; automatically provisions user record on first login via `prisma.user.upsert`

### Courses
- `GET /api/courses` - List courses the user owns or is enrolled in
- `GET /api/courses/explore` - List available courses for enrollment (excludes owned/enrolled)
- `POST /api/courses` - Create a course (creator becomes owner)
- `GET /api/courses/:id` - Course details with student count, material count, and owner info (owner or enrolled only)
- `PUT /api/courses/:id` - Update title/description (owner only)
- `DELETE /api/courses/:id` - Delete course with cascade cleanup (owner only)
- `POST /api/courses/:id/enroll` - Enroll in course (non-owner only; prevents duplicates)

### Course Materials
- `GET /api/materials/:courseId` - List materials for a course (owner or enrolled)
- `GET /api/materials/file/:materialId` - Stream / download material file with proper headers (owner or enrolled)
- `POST /api/materials/:courseId/upload` - Upload file (multipart/form-data via Multer disk streaming; 50MB documents, 200MB audio)
- `DELETE /api/materials/:materialId` - Delete material record and underlying storage file (uploader or course owner only)

### AI & Document Intelligence (Phase 2 & Phase 3)
- `POST /api/courses/:id/chat` - RAG semantic search over course materials with Gemini answering strictly from context (`{ question, materialId? }`)
- `POST /api/materials/:id/summary` - Generate and cache concise structured summary from extracted material chunks
- `POST /api/courses/:id/tutor` - Interactive patient AI Tutor with step-by-step reasoning, examples, and `[General Knowledge]` source tagging (`{ question, history? }`)
- `POST /api/courses/:id/quizzes/generate` - Generate multiple-choice quiz (3-10 questions) from course materials (`{ numQuestions, materialId? }`)
- `GET /api/courses/:id/quizzes` - List quizzes created for a course
- `GET /api/quizzes/:id` - Fetch quiz questions (sanitized without correct answers or explanations for security)
- `POST /api/quizzes/:id/attempt` - Submit quiz attempt answers (`{ answers }`), compute score, save attempt, and return detailed answer review with explanations
- `POST /api/courses/:id/study-plan` - Generate/replace personalized weekly study plan considering quiz weaknesses and available hours (`{ hoursPerWeek, examDate?, goal? }`)
- `GET /api/courses/:id/study-plan` - Retrieve latest user study plan for the course
- `POST /api/courses/:id/assignments` - Submit assignment via text or document upload (PDF/DOCX/TXT) for AI rubric grading (`{ title, text }` or multipart file)
- `GET /api/courses/:id/assignments` - List student's evaluated assignments for the course
- `GET /api/progress` - Platform-wide learning analytics: course counts, materials uploaded, quiz attempts, assignments evaluated, average score, quiz history, and per-course completion progress

---

## Verification & Test Suites

### Phase 1: Authentication & Core LMS API
```bash
npm run test:api -w server
```

### Phase 2: pgvector RAG, Embeddings & Summaries
```bash
npm run test:phase2 -w server
```

### Phase 3: AI Tutor, Quizzes, Study Plans, Assignments & Progress
```bash
npm run test:phase3 -w server
```

---

## Frontend Pages & Features

- **Landing Page (`/`)**: Dark-themed hero, feature highlights (AI Tutor, PDF Chat, Quiz Generator, Study Planner, Assignment Grader), and direct authentication entrypoints.
- **Dashboard Overview (`/dashboard`)**:
  - Live statistics: Enrolled Courses, Materials Uploaded, Quizzes Attempted, Assignments Evaluated, Average Quiz Score.
  - Interactive Recharts Performance Bar Chart (recent quiz score trend out of 100%).
  - Per-course progress bars calculating completion percentage from attempted quizzes and evaluated assignments.
- **My Courses (`/dashboard/courses`)**: Tabbed view of Owned and Enrolled courses, course card badges, create course dialog with client validation, and empty/loading states.
- **Explore Courses (`/dashboard/explore`)**: Browse courses available across the platform with one-click enrollment.
- **Course Detail (`/dashboard/courses/[courseId]`)**:
  - Course metadata (description, instructor, student and material counts).
  - Owner controls: Edit course dialog, delete course confirmation dialog.
  - Interactive Material Uploader: Drag-and-drop zone, file size and type validation, real XHR upload progress bar, automatic 4s polling for pending jobs with 2-minute cutoff.
  - Material List: File icons by type, formatted size and timestamp, status badge (`PENDING`, `READY`, `FAILED`), failure reason tooltip/label, download as blob, retry button for failed jobs, and delete with confirmation.
  - **Summary Dialog**: Instant AI summary generation with caching for `READY` materials.
  - **PDF Chat Tab**: Interactive RAG chatbot scoped to all course materials or a specific file, with real-time question length counter (500 char guardrail), source snippet citations, and empty/error states.
  - **AI Tutor Tab**: Patient-teacher conversational interface with step-by-step reasoning, real-world examples, source badges (`[Course Material]` vs `[General Knowledge]`), and local browser-persisted chat history.
  - **Quizzes Tab**: Generate customizable multiple-choice quizzes (3-10 questions), preview existing quizzes with question and attempt counts, take quizzes with timed/unanswered validation, and view post-submission score review with detailed per-question explanations.
  - **Study Plan Tab**: Form for weekly hours, exam dates, and study goals generating structured weekly schedules with focus topics, hour breakdowns, and actionable study tips.
  - **Assignments Tab**: Submit assignment work via direct text entry or document upload (PDF, DOCX, TXT) for instant AI rubric grading with numerical score out of 10, key strengths, weaknesses, and improvement suggestions.

---

## Future Roadmap

- **Phase 4**: Audio Transcription (Whisper integration for lecture recordings) and asynchronous job queues (BullMQ / Redis).
