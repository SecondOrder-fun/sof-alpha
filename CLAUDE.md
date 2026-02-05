# SecondOrder.fun Project Rules

## Project Overview

SecondOrder.fun is a Web3 platform that transforms memecoins from chaotic, scam-prone infinite games into structured, fair finite games using game theory principles enhanced with InfoFi (Information Finance) integration.

**Tech Stack:**
- **Frontend:** React 18, Vite 6, Tailwind CSS, shadcn/ui, Wagmi + Viem
- **Backend:** Fastify + Hono (hybrid), Supabase (PostgreSQL)
- **Smart Contracts:** Solidity ^0.8.20, Foundry, OpenZeppelin, Chainlink VRF
- **Networks:** Base (primary), with cross-chain expansion planned

## Mandatory Workflow Rules

### 1. Branch Management

**NEVER work directly on main.** Always create a feature branch:

```bash
# Create feature branch with semantic prefix
git checkout -b feat/description-of-feature
git checkout -b fix/description-of-fix
git checkout -b test/description-of-tests
git checkout -b docs/description-of-docs
git checkout -b refactor/description-of-refactor
```

**Branch naming conventions:**
- `feat/` - New features
- `fix/` - Bug fixes
- `test/` - Test additions or fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `chore/` - Maintenance tasks

### 2. Semantic Versioning

Update `package.json` version following semver:
- **MAJOR** (x.0.0): Breaking changes
- **MINOR** (0.x.0): New features, backward compatible
- **PATCH** (0.0.x): Bug fixes, backward compatible

Current version: `0.9.31`

### 3. Pre-Commit Verification

**ALWAYS run these before committing:**

```bash
# Frontend tests
npm run test

# Linter
npm run lint

# Build verification
npm run build

# Smart contract tests (from contracts/ directory)
cd contracts && forge test && cd ..
```

### 4. CI/CD Verification

After committing and pushing:
1. Check GitHub Actions for CI status
2. Ensure all checks pass before creating PR
3. Do not merge failing PRs

### 5. Task Documentation

Add all tasks with detailed sub-tasks to `instructions/project-tasks.md`.

## Library References

### Smart Contracts
- **OpenZeppelin:** Use for AccessControl, ReentrancyGuard, ERC20, security patterns
- **Chainlink:** VRF v2.5 for verifiable randomness
- **Foundry:** Testing framework (`forge test`)

### Frontend
- **React Query:** Server state management
- **Wagmi + Viem:** Web3 interactions
- **shadcn/ui:** Component library (built on Radix UI)
- **Tailwind CSS:** Styling

### Theming (CRITICAL)

**NEVER hardcode colors in components.** All colors MUST use CSS variables via semantic Tailwind classes.

```jsx
// ❌ WRONG - hardcoded colors
className="text-[#c82a54] bg-[#f9d6de] border-[#130013]"
className="text-[#a89e99] hover:text-[#e25167]"

// ✅ CORRECT - semantic classes that reference CSS variables
className="text-primary bg-muted border-foreground"
className="text-muted-foreground hover:text-primary"
```

**Available semantic classes:**

- `bg-background`, `text-foreground` - main background/text
- `bg-primary`, `text-primary` - brand accent (Cochineal Red)
- `bg-muted`, `text-muted-foreground` - subtle backgrounds/text
- `bg-card`, `text-card-foreground` - card surfaces
- `border-border`, `border-primary` - borders
- `bg-destructive`, `text-destructive` - error states

**CSS variables are defined in `src/styles/tailwind.css`** - this is the ONLY place colors should be defined. Components reference these via Tailwind's semantic classes.

**No `dark:` prefix scattering.** Theme switching happens via CSS variables, not scattered dark mode overrides in components.

### Research Resources
- Use web search for best practices
- Reference OpenZeppelin documentation for contract patterns
- Check Chainlink docs for VRF integration

## Code Standards

### Solidity

```solidity
// Use custom errors instead of string reverts (gas optimization)
error InvalidSeasonName();
error TradingLocked();
error SlippageExceeded(uint256 cost, uint256 maxAllowed);

// Use OpenZeppelin patterns
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
```

### Frontend Components

```jsx
// Functional components only, no React import needed (Vite handles it)
import { useState } from 'react';
import PropTypes from 'prop-types';

const ComponentName = ({ prop1, prop2 }) => {
  // Component logic
};

ComponentName.propTypes = {
  prop1: PropTypes.string.isRequired,
  prop2: PropTypes.number,
};

export default ComponentName;
```

### i18n (Internationalization)

All user-facing text MUST use the i18n system:

```jsx
import { useTranslation } from 'react-i18next';

const Component = () => {
  const { t } = useTranslation('namespace');
  return <div>{t('key')}</div>;
};
```

**Never hardcode strings in components.**

### Hooks Guidelines

- Hooks return data, components handle text/translation
- Prefix custom hooks with `use`
- Keep i18n logic in components, not hooks

## Directory Structure

```
sof-alpha/
├── src/                    # Frontend source
│   ├── components/         # UI components
│   │   ├── ui/            # shadcn/ui base components
│   │   ├── common/        # Shared components
│   │   ├── raffle/        # Raffle feature components
│   │   └── infofi/        # InfoFi market components
│   ├── features/          # Feature modules
│   ├── hooks/             # Custom React hooks
│   ├── services/          # API and business logic
│   └── pages/             # Page components
├── contracts/             # Solidity smart contracts
│   ├── src/               # Contract source files
│   │   ├── core/          # Core raffle contracts
│   │   ├── curve/         # Bonding curve contracts
│   │   ├── infofi/        # InfoFi market contracts
│   │   └── token/         # Token contracts
│   └── test/              # Contract tests
├── backend/               # Backend services
│   ├── fastify/           # Main API server
│   └── hono/              # Edge functions
├── instructions/          # Project documentation
│   ├── project-tasks.md   # Task tracking
│   ├── project-structure.md
│   └── frontend-guidelines.md
└── docs/                  # GitBook documentation (submodule)
```

## Testing Requirements

### Smart Contract Tests

```bash
cd contracts
forge test                    # Run all tests
forge test -vvv              # Verbose output
forge test --match-test testName  # Run specific test
```

Key test files:
- `test/RaffleVRF.t.sol` - VRF flow and raffle lifecycle
- `test/SellAllTickets.t.sol` - Bonding curve operations
- `test/invariant/HybridPricingInvariant.t.sol` - Pricing invariants

### Frontend Tests

```bash
npm run test              # Run all tests
npm run test:watch        # Watch mode
npm run test:ui           # Visual UI
```

## Git Commit Standards

Use conventional commits:

```
feat: add raffle creation form
fix: resolve wallet connection issue
docs: update component guidelines
test: add unit tests for RaffleCard
refactor: extract reusable hook
chore: update dependencies
```

## Security Considerations

### Smart Contracts
- Use ReentrancyGuard for external calls
- Use AccessControl for role-based permissions
- Custom errors for gas optimization
- Never use `tx.origin` for authentication

### Frontend
- Sanitize all user inputs
- Use environment variables for sensitive data (VITE_ prefix)
- Validate data at system boundaries

## Key Contracts

| Contract | Purpose |
|----------|---------|
| `Raffle.sol` | Season management, VRF coordination |
| `SOFBondingCurve.sol` | Ticket purchases, pricing |
| `SOFToken.sol` | Platform token ($SOF) |
| `RaffleToken.sol` | Per-season ticket tokens |
| `InfoFiPriceOracle.sol` | Hybrid pricing (70% raffle + 30% market) |
| `SeasonFactory.sol` | Deploys seasonal contracts |

## Common Commands

```bash
# Development
npm run dev               # Start frontend dev server
npm run build            # Production build
npm run lint             # Run ESLint

# Testing
npm run test             # Frontend tests
cd contracts && forge test  # Contract tests

# Contract deployment
cd contracts
forge script script/deploy/01_DeploySOFToken.s.sol --broadcast

# Git workflow
git checkout -b feat/new-feature
# ... make changes ...
npm run test && npm run lint && npm run build
cd contracts && forge test && cd ..
git add .
git commit -m "feat: description"
git push -u origin feat/new-feature
# Create PR after CI passes
```

## Documentation

- **Task tracking:** `instructions/project-tasks.md`
- **Frontend guidelines:** `instructions/frontend-guidelines.md`
- **Project structure:** `instructions/project-structure.md`
- **Requirements:** `instructions/project-requirements.md`
- **GitBook docs:** `docs/` (submodule)

All new documentation goes in the `docs/` GitBook submodule, organized by category.
