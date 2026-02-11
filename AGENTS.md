# AGENTS.md

This file provides instructions for coding agents working in `/Users/jacob/repos/substack-to-podcast`.

## Project overview
- Runtime: Node.js serverless functions (Vercel).
- API entrypoints live in `/Users/jacob/repos/substack-to-podcast/api`.
- Shared login/session logic lives in `/Users/jacob/repos/substack-to-podcast/lib/ss-login.js`.
- Goal: generate podcast RSS output for Substack content.

## Working rules
- Make minimal, targeted changes that preserve current behavior unless the task asks for a behavior change.
- Do not commit secrets or real credentials.
- Prefer `rg` for searching files and text.
- Keep dependencies unchanged unless the task requires adding/updating one.

## Validation
- Run `npm test` for lint validation when code changes.
- If test/lint cannot run, explain why in your final note.
- For endpoint changes, sanity-check related handlers under `/Users/jacob/repos/substack-to-podcast/api`.

## Files and scope
- Primary editable areas:
  - `/Users/jacob/repos/substack-to-podcast/api/*.js`
  - `/Users/jacob/repos/substack-to-podcast/lib/*.js`
- Avoid modifying generated artifacts or unrelated scratch files unless requested.

## When unclear
- State assumptions briefly.
- Choose the safest non-destructive approach and leave a clear summary of what changed.
