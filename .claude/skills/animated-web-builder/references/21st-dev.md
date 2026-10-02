# 21st.dev

Community registry of React UI: components, templates, shadcn themes, shaders, gradients. It is a shadcn-style registry (many authors, many styles). The code is copied into your repo, so you own and edit it. Over 1,000 hero components and 12,000+ items are listed.

Source quality: the site itself was blocked from the sandbox. Facts below come from search summaries of 21st.dev pages and the npm metadata for `@21st-dev/magic` (now a compatibility proxy; new setups use `npx @21st-dev/cli@latest init`, docs at 21st.dev/mcp). Re-verify command names against the live docs when the network allows.

## Requirements

React + Tailwind + shadcn/ui project (Next.js or Vite React). Components import `cn` from `@/lib/utils`, shadcn primitives, and often `motion` or `framer-motion`. Check `components.json` exists, or run `npx shadcn@latest init` first.

## Ways to add a component

1. **shadcn CLI with the registry URL** from the component page: `npx shadcn@latest add "<registry url>"`.
2. **Copy the code** from the component page into `components/ui/`.
3. **Copy the AI prompt** from the page and give it to the agent (works in Cursor, Claude Code, v0, Lovable).
4. **21st MCP** in Claude Code or Cursor: `npx @21st-dev/cli@latest init` and let the agent search and install.

## How to pick

- Search by intent (hero, pricing, background, text effect, shader) and sort by popularity, then read the source before installing. Quality varies by author.
- Keep one design system per project: restyle every imported component to your tokens (radius, colors, shadows, type). Importing in default state is the classic AI-tell, taste.md calls it out.
- Check each import against `package.json` before using it. Components often pull `motion`, `lucide-react`, `@radix-ui/*`. Swap Lucide for the project's icon library.
- Remove anything that breaks the rules in taste.md: purple gradients, centered hero over dark mesh, three equal cards, infinite loops on every element.

## When the project is not React

Do not add React just to use 21st.dev. Treat the registry as inspiration and port the idea:

- CSS-only effects (spotlight border, shimmer, gradient borders): copy the CSS, drop the JSX.
- Motion/Framer animations: re-express as GSAP timelines or CSS transitions.
- Shader backgrounds: usually a plain WebGL fragment shader you can reuse in three.js.

## Combine with the other sources

- Layout and rules: taste.md.
- Scroll choreography: gsap.md. In React, wrap GSAP in `useEffect` with `gsap.context(..., ref)` and `return () => ctx.revert()`, in a leaf `'use client'` component.
- 3D hero or background: threeui.md.
