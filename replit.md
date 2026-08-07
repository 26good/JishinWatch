# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

The main user-facing app is a Japanese earthquake monitoring dashboard at the root preview path. It displays a full-screen Japan map, recent earthquake history from P2PQuake, prefecture intensity coloring, epicenter markers, sound alerts, EEW WebSocket status, and tsunami information from P2PQuake.

Recent UI preferences: maximum intensity panels should use the same color scale as seismic intensity; magnitude colors progress blue, green, yellow, orange, red, purple as values increase; depth colors progress red, yellow, green, blue as depth increases; sound should show ON by default; the app should support phone and iPad-sized screens and display map zoom controls. Project version should be manually incremented by the agent for each visible app change.

Tsunami behavior: fetch real tsunami information from P2PQuake code 552, show active tsunami areas and expected arrival/height in the right-side alert panel, color warning levels as purple for major tsunami warning, red for tsunami warning, and yellow for advisory, and highlight matching coastal/prefecture outlines with the corresponding colors. Dangerous tsunami sounds should use maximum app volume, but browser audio still requires the audio context to be resumed by user interaction when blocked.

Testing behavior: Shift+T toggles test mode. Test mode provides earthquake/tsunami simulation scenarios for Sanriku, Nankai Trough, and Chiba offshore without replacing the real-data fetch paths outside test mode.

P/S wave behavior: P-wave and S-wave estimated range circles are shown only during EEW and should use the actual computed distance circles, not additional decorative duplicate rings.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Map UI**: Leaflet + React Leaflet

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/jishinwatch run dev` — run the earthquake monitor web app

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
