# Group Crash Agent Guide

This file gives Codex persistent project instructions. Read it before making code, design, or documentation changes.

## Product Intent

Group Crash is a web-first second-screen multiplayer game platform. The television is the shared public screen. Phones are private player controllers.

The first milestone is the lobby:

- Create and join rooms
- Show live players on the TV
- Let phones send quick lobby messages
- Assign and transfer host control
- Show an empty game library state

Do not add playable games until the lobby is stable.

## Source Of Truth

Use this priority order:

1. The user's latest request
2. `docs/product-spec.md`
3. `docs/lobby-rules.md`
4. `docs/protocol.md`
5. `docs/design-system.md`
6. The Figma file: https://www.figma.com/design/7xGXtygVpXnPd6aNSXeTBV
7. Existing code patterns

When the docs and code disagree, update the docs or code intentionally. Do not silently invent new behavior.

## Visual Direction

Group Crash should feel like bold TV party-game graphics, not a SaaS dashboard.

Use:

- Red as the main environment
- Yellow for primary actions, host authority, selection, and focus
- Cream for readable cards and panels
- Dark ink for text
- Large rounded typography
- Thick outlines
- Spacious layout
- Chess-piece avatars
- Playful but controlled motion

Avoid:

- Generic gradients
- Glassmorphism
- Purple tech branding
- Thin gray borders
- Dense dashboard cards
- Small TV text
- Stock-photo imagery
- Decorative clutter behind important information

## Frontend Rules

- Build separate TV and phone interfaces.
- Do not make the TV app an enlarged phone app.
- Design TV screens for 1920 x 1080 first.
- Keep important TV content inside a safe area.
- Make remote-control focus states obvious.
- Make phone controls at least 44 x 44 pixels.
- Keep text readable and prevent overflow.
- Do not add a landing page for the app experience.

## Architecture Rules

- The server is authoritative.
- Clients send intentions, not final state.
- The phone must never decide host status, score, permissions, or legal game state.
- Use shared protocol types for all client/server messages.
- Validate network messages with Zod.
- Send each player only the private state they are allowed to see.
- Do not hide private data with CSS after sending it to the wrong client.
- Keep the game-module API separate from lobby logic.

## MVP Technical Direction

Prefer:

- TypeScript
- React
- Vite
- Node.js
- Socket.IO for the first multiplayer version
- Zod for validation
- pnpm workspaces

Avoid adding:

- PostgreSQL before it is needed
- Redis before it is needed
- Auth before the local-room MVP needs it
- Android TV wrapper before browser multiplayer works

## Safety And Moderation

Because player text appears on the TV:

- Trim user input
- Reject empty messages
- Limit message length
- Escape rendered content
- Reject HTML
- Rate-limit messages
- Keep a simple blocked-word list for MVP

## Development Workflow

For each meaningful change:

1. Read the relevant docs.
2. Keep the change scoped.
3. Prefer existing patterns once code exists.
4. Run formatting and tests when available.
5. Update docs when behavior changes.

