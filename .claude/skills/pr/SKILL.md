# /pr — Commit, Push & Create Pull Request

Complete the git workflow for the current feature branch: verify environment, run checks, commit, push, and open a PR.

## Pre-flight Checks

1. **gh CLI**: Run `gh auth status`. If not authenticated, STOP and tell the user to run `gh auth login`.
2. **Branch safety**: Run `git branch --show-current`. If on `main`, STOP and tell the user to create a feature branch first (per CLAUDE.md: `feat/`, `fix/`, `test/`, `docs/`, `refactor/`, `chore/`).
3. **Remote exists**: Run `git remote -v` and verify `origin` is configured.

If any pre-flight check fails, report the issue clearly and stop.

## Run Quality Checks

Detect which repo we're in and run the appropriate checks:

**sof-backend** (if `fastify/server.js` exists):
- `npx vitest run`

**sof-alpha** (if `vite.config.js` exists):
- `npm run test` (frontend tests)
- `npm run lint`
- `npm run build`
- If `contracts/` exists: `cd contracts && forge test && cd ..`

If any check fails, STOP and report the failures. Do NOT proceed to commit.

## Commit

1. Run `git status` and `git diff --staged` and `git diff` to see all changes.
2. Stage only relevant files — do NOT use `git add -A`. Exclude `.env`, credentials, and large binaries.
3. Draft a conventional commit message (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`) that explains the **why**, not the **what**.
4. Show the user the proposed commit message and staged files. Wait for approval before committing.
5. Commit with Co-Authored-By trailer.

## Push & Create PR

1. Push the branch: `git push -u origin <branch-name>`
2. Create the PR:
   - Title: short, under 70 chars
   - Body: `## Summary` with 1-3 bullet points + `## Test plan` with checklist
3. Report the PR URL to the user.

## Important

- NEVER merge the PR automatically. Only create it.
- NEVER work on main. If on main, stop immediately.
- If the user passes arguments (e.g., `/pr fix: resolve wallet bug`), use that as the commit message instead of drafting one.
