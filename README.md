# Rallyroom

A mobile-first open-play session manager. Hosts create courts and rules without an account, invite anonymous players with a QR code, and manage games and rotations from their browser. See [the feature and matchmaking guide](docs/FEATURES.md) for illustrated examples and exact selection rules.

## Local setup

1. Create a Supabase project and enable **anonymous sign-ins** in Authentication settings. A browser-based anonymous Supabase identity is created when the host starts their first session; no email or password is required.
2. In the Supabase SQL editor, run [`supabase/schema.sql`](supabase/schema.sql). This creates the session store and transactional RPCs. Do not run it against an existing production database without reviewing it.
3. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the project URL and **publishable/anon** key from Supabase. Never put a service-role or secret key in the client. `.env` is ignored by Git.
4. Run `npm install`, then `npm run dev`. Create a session and invite players. Run `npm test` and `npm run build` for verification.

Player devices must be able to reach the URL encoded in the QR code. A localhost URL works only on the same device; use a reachable local network address for local testing or a separately deployed URL when ready. The host and guests must use the same Supabase project. Deployment is deliberately separate.

For an existing installation, apply [`supabase/ended-session-migration.sql`](supabase/ended-session-migration.sql) in the Supabase SQL editor. It lets old guest links show the ended-session page without exposing session details, and rejects updates to ended sessions. The earlier duplicate-name migration is still required if it has not been applied.

## UI components

Rallyroom uses shadcn/ui components installed with the official CLI. Their source lives in `src/components/ui`, the CLI configuration is in `components.json`, and the white and mocha theme is in `src/style.css`. To add another component, use `npx shadcn@latest add <component>` and adapt its styling to the existing theme.

## Architecture and operational notes

Session state is kept in one JSON document per session. Host writes use a version check and database row lock; an anonymous join takes the same lock and increments the version. A stale host action is rejected and the UI reloads the latest session, rather than overwriting a join or another host action. Matchmaking and automatic court assignment run in the open host browser and the chosen state is saved using this version check; the host page must be open for new joins to trigger assignment; it is not independently recomputed on the server. Only the owner’s Supabase identity can write a session via the host RPC. Anonymous host identities use Supabase’s authenticated role and are scoped to their own sessions. Guests can read a live session by its unguessable UUID and join it via a narrow RPC; they cannot modify existing state. The client polls every three seconds for updates.

Host access persists in the same browser while its Supabase session remains available. Signing out, clearing browser data, or switching devices loses access to that anonymous host identity; there is no recovery yet. The session ownership uses the Supabase user ID so a future account-linking flow can retain ownership, but that flow is not implemented. Enable abuse protection appropriate to your deployment for anonymous sign-ins.

Guest participation survives refresh on the same browser via local storage, while session data is stored in Supabase. Clearing browser storage or changing devices loses the device's association; recovery is not yet implemented. Active participant names must be unique; apply [`supabase/duplicate-name-migration.sql`](supabase/duplicate-name-migration.sql) to existing installations for concurrent QR-join validation. Anyone with the invite link can view the session's player names and self-reported ratings and join while it is live. There is no guest authentication, rate limiting, or anti-abuse mechanism. Configure Supabase project limits and consider access controls before public deployment.

This is an initial implementation: there is no history screen, recovery, DUPR integration or verified rating, score recording, notifications, offline sync, host transfer, multi-host roles, or time-based scheduling. Rule changes and participant operations are host-controlled. Ended sessions remain stored but are not shown in the app. The SQL is an initial schema, not a migration system.
