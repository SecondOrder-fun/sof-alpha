# Scripts

Build and maintenance scripts for SecondOrder.fun

## File Length Linter

Enforces the 500-line file limit to prevent bloated components and maintain code quality.

### Usage

```bash
# Check all source files
npm run lint:length

# Check only staged files (what the pre-commit hook uses)
npm run lint:length:staged

# Custom max lines
node scripts/lint-file-length.js --max-lines 300

# Check with different exclusions
node scripts/lint-file-length.js --exclude "*.md"
```

### Pre-commit Hook

The pre-commit hook automatically runs `lint:length:staged` before each commit. If any staged files exceed 500 lines, the commit is blocked.

**To bypass (not recommended):**
```bash
git commit --no-verify
```

**To reinstall the hook** (if it gets removed):
```bash
chmod +x .git/hooks/pre-commit
```

Or copy the hook template:
```bash
cp scripts/pre-commit.template .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

### What Gets Checked

- JavaScript/TypeScript: `.js`, `.jsx`, `.ts`, `.tsx`
- Stylesheets: `.css`
- Documentation: `.md`
- Config: `.html`

### What's Excluded

- `node_modules/` - Dependencies
- `dist/`, `build/` - Build outputs
- `contracts/lib/` - Foundry dependencies
- `contracts/out/` - Foundry build artifacts
- `instructions/` - Project docs (allowed to be long)
- `*.json` - Generated ABIs and configs
- Lock files

### Fixing Violations

When a file exceeds 500 lines:

1. **Extract shared logic** into hooks (`src/hooks/`)
2. **Split into components** (e.g., `BuySellWidget.jsx` → multiple files in `src/components/buysell/`)
3. **Create sub-components** for complex UI sections
4. **Extract business logic** into services (`src/services/`)
5. **Use composition** over monolithic components

See `docs/DEVELOPMENT_RULES.md` for detailed guidance.

## Other Scripts

### `copy-abis.js`
Copies contract ABIs from `contracts/out/` to `src/contracts/abis/` for frontend use.

```bash
npm run copy-abis
```

### `update-env-addresses.js`
Updates `.env` with deployed contract addresses from Foundry broadcast artifacts.

```bash
npm run update-env
```
