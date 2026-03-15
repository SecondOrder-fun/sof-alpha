---
name: deploy-check
description: Run all pre-commit quality checks (tests, lint, build, forge) without committing
disable-model-invocation: true
allowed-tools: Bash(npm run test:*), Bash(npm run lint:*), Bash(npm run build:*), Bash(forge test:*), Bash(npx vitest:*)
---

# /deploy-check — Pre-commit quality gate

Run the full CLAUDE.md pre-commit checklist and report pass/fail for each step. Does NOT commit or push anything.

## Detect which repo

- If `vite.config.js` exists in cwd -> **sof-alpha** (frontend + contracts)
- If `fastify/server.js` exists in cwd -> **sof-backend**

## sof-alpha checks

Run these sequentially. Stop and report on first failure:

1. **Frontend tests**: `npm run test`
2. **Linter**: `npm run lint`
3. **Build**: `npm run build`
4. **Contract tests** (if `contracts/` exists): `cd contracts && forge test && cd ..`

## sof-backend checks

1. **Backend tests**: `npx vitest run`

## Output

Report a summary table:

| Check | Status |
|-------|--------|
| Tests | PASS/FAIL |
| Lint | PASS/FAIL |
| Build | PASS/FAIL |
| Contracts | PASS/FAIL/SKIPPED |

If all pass, report "All checks green — ready to commit."
If any fail, show the failure output and stop.
