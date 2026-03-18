This file provides guidance when working with code in this repository.

## Project Overview

Baymax 2.0 is a multi-agent, voice-first AI care companion for elderly Singaporeans managing chronic conditions (diabetes, hypertension). Built for the Synapxe Healthcare AI Hackathon 2026. Three coordinated agents — Companion (patient-facing), Caregiver Liaison (family dashboard + Telegram alerts), and Clinician Bridge (pre-visit reports) — orchestrated via LangGraph with MCP-native tool servers.

## Architecture

**Monorepo with two main directories:**
- `frontend/` — Next.js 14 (TypeScript, Tailwind CSS, PWA). App Router with three route groups: `/patient`, `/caregiver`, `/clinician`.
- `backend/` — FastAPI (Python). Houses LangGraph agents, 5 MCP servers (A–E), voice pipeline, and RAG pipeline.

**Data flow:** Patient speaks/types → Frontend → FastAPI (WebSocket for voice, REST for text) → LangGraph orchestrator → MCP server tool calls → Supabase → Response back through the chain with TTS if voice.

**Key backend modules:**
- `app/agents/` — LangGraph agent definitions and graph orchestration
- `app/mcp_servers/` — Five MCP servers (patient context, medication, caregiver comms, clinician summary, governance)
- `app/voice/` — Deepgram STT + Azure TTS integration
- `app/rag/` — Guideline ingestion, embedding, retrieval via pgvector

**LangGraph flow:** `retrieve_context → companion_respond → safety_check → evaluate_escalation → [caregiver_liaison | clinician_bridge | emergency_handler | END]`

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS (PWA) |
| Backend | FastAPI, LangGraph, Python 3.11+ |
| Database | Supabase (PostgreSQL + pgvector + RLS) |
| Auth | Supabase Auth (magic link/OTP for patients; email/password for caregivers + clinicians) |
| LLM | Claude Sonnet (primary), Claude Haiku (summarization) |
| Embeddings | OpenAI text-embedding-3-small |
| STT | Deepgram Nova-2 |
| TTS | Azure Speech Service |
| Notifications | Telegram Bot API |

## Critical Safety Constraints

These are non-negotiable — every code change must respect them:

1. **Never generate diagnostic or prescriptive language.** No "you have [condition]", "stop taking", "increase your dose". The PolicyGate (MCP Server B `safety_gate`) does deterministic string-matching on every outbound response.
2. **Emergency keywords** (chest pain, 胸痛, difficulty breathing, etc.) must trigger the emergency handler — respond with "call 995" safety script + immediate caregiver alert.
3. **Raw voice audio is never persisted.** Discard immediately after STT transcription.
4. **Raw conversation transcripts are never exposed to caregivers.** Only AI-derived summaries within patient consent scope.
5. **Audit log is append-only.** No UPDATE or DELETE on the `audit_log` table.
6. **All health claims must be RAG-grounded** in MOH/HPB clinical guidelines. Ungrounded claims are softened or stripped.

## Patient UI Design Rules

The patient interface targets elderly users (70+). Enforce these constraints:
- Minimum font: 18px body, 24px headings
- Touch targets: minimum 48x48px
- High contrast by default
- Maximum 3 tappable elements on primary screen
- Bottom nav: 3 tabs only (Home / Chat / Medications)
- Voice button: large, centered, prominent (80px+ diameter)

## Authentication

Three stakeholder roles are managed by Supabase Auth. Every code change involving user data must respect role boundaries.

**Auth methods:**
- **Patient** — Magic link (email) or SMS OTP. No password. Elderly-friendly sign-in page at `/patient/login`.
- **Caregiver** — Email/password or magic link. Sign-in at `/caregiver/login`.
- **Clinician** — Email/password, admin-provisioned only (no self-registration). Sign-in at `/clinician/login`.

**JWT custom claims** — A Supabase Auth hook injects `role` (`patient` | `caregiver` | `clinician`) and `app_user_id` (the PK from the corresponding table) into every JWT. Never trust `patient_id` from a request body without validating it against `app_user_id` from the JWT.

**Route protection (Next.js middleware):**
- `/patient/*` → requires `role: patient`
- `/caregiver/*` → requires `role: caregiver`
- `/clinician/*` → requires `role: clinician`
- All implemented via `@supabase/ssr` session cookie reading in `frontend/src/middleware.ts`.

**FastAPI endpoint protection:**
- All protected endpoints validate the `Authorization: Bearer <token>` JWT against `SUPABASE_JWT_SECRET`.
- Endpoint groups enforce role: `/api/chat` + `/api/voice` → patient only; `/api/caregiver/*` → caregiver only; `/api/clinician/*` → clinician only.
- RLS is the primary access control layer; FastAPI role checks are the secondary layer.

**Database:**
- `patients.user_id` and `caregivers.user_id` reference `auth.users(id)`.
- `clinicians` table has its own `user_id` FK and a `patient_ids UUID[]` panel column.
- All RLS policies use `auth.uid()` — never hardcode user IDs.

## Multilingual Support

Four languages: English (`en`), Mandarin (`zh`), Malay (`ms`), Tamil (`ta`). For hackathon MVP, prioritize EN and ZH. The Companion Agent must respond in the patient's `language_pref`. All system prompts include language directives.

## Additional Information
You have access to the Supabase Database via MCP. Keep in mind that the current version of Supabase uses Publishable and Secret keys, not Anon and Service Role keys anymore. You also have access to the GitHub MCP. Do frequent commits and branching, following best practices. For all commits, no need to write detailed and long messages, short and direct is preferred.

## Key References

- `PRD.md` — Full product requirements, agent specs, database schema, escalation rules
- `IMPLEMENTATION_PLAN.md` — 9-phase build plan with acceptance criteria per phase
