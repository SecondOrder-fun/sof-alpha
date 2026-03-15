---
name: new-component
description: Scaffold a new React component following project conventions (PropTypes, i18n, semantic theming)
disable-model-invocation: true
---

# /new-component — Scaffold a React component

Create a new component file following all SecondOrder.fun project conventions from CLAUDE.md.

## Arguments

The user provides: `/new-component <ComponentName>` and optionally a target directory.

- Default directory: `src/components/`
- The user may specify a subdirectory like `raffle`, `infofi`, `common`, `admin`, `mobile`, etc.

## Template

Every generated component MUST follow these rules:

1. **Functional component only** — arrow function, no class components
2. **No `import React`** — Vite handles JSX transform
3. **PropTypes** — always define with `prop-types` package
4. **i18n** — all user-facing strings use `useTranslation` from `react-i18next`
5. **Semantic Tailwind classes only** — never hardcode colors (`text-[#...]`, `bg-[#...]`, `text-white`, `bg-black`)
   - Use: `text-foreground`, `bg-background`, `text-primary`, `bg-muted`, `text-muted-foreground`, `bg-card`, `border-border`
6. **Check `src/components/ui/` first** — prefer existing shadcn/Radix primitives over raw HTML/CSS
7. **Default export**

## Example output

```jsx
// src/components/{dir}/{ComponentName}.jsx
import { useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

const {ComponentName} = ({ prop1 }) => {
  const { t } = useTranslation(["{namespace}"]);

  return (
    <div className="p-4 bg-card rounded-lg border">
      <h2 className="text-foreground font-medium">
        {t("{key}")}
      </h2>
    </div>
  );
};

{ComponentName}.propTypes = {
  prop1: PropTypes.string.isRequired,
};

export default {ComponentName};
```

## After scaffolding

1. Create the file
2. Tell the user which i18n namespace and keys they need to add to `public/locales/en/{namespace}.json`
3. Suggest any existing UI components from `src/components/ui/` that might be useful
