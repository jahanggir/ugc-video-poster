# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install        # Install dependencies
npm run dev        # Start dev server (Vite, hot reload)
npm run build      # Production build → dist/
npm run preview    # Preview production build locally
```

There are no tests or linting configured.

## Architecture

Single-page React app built with Vite. The entire application is one component (`src/App.jsx`, ~550 lines) — no routing, no state management library, no UI framework.

**Data flow:**
1. User drops/selects a video file → `URL.createObjectURL()` feeds an `<HTMLVideoElement>`
2. A separate hidden "probe" video element generates 6–12 timeline preview thumbnails as JPEG data URLs (stored in state)
3. User scrubs the timeline (mouse click or arrow keys at 1/30s precision) → `seekAndWait()` resolves a promise after `requestAnimationFrame` confirms the new frame is painted
4. Capture button draws the current video frame to a `<canvas>` → `canvas.toDataURL()` with chosen format/quality → download link

**Key implementation details:**
- `seekAndWait()`: seeks video then waits for two `requestAnimationFrame` cycles (with a 4s timeout) to ensure the frame is actually rendered before capture
- Letterbox/pillarbox logic: canvas is always the chosen output size; the video frame is drawn centered with black bars if aspect ratios differ
- ObjectURLs are revoked in `useEffect` cleanup to avoid memory leaks
- All styling is inline CSS; dark theme with `#0a0a0b` background and `#c44510` orange accent; JetBrains Mono + DM Sans from Google Fonts

**Helper components** (defined inside `App.jsx`): `StepButton`, `SettingCard`, `PillButton`.

## Deployment

Deploys to Netlify. Config in `netlify.toml` sets a 1-year immutable cache on `dist/assets/`, security headers (CSP, X-Frame-Options, Permissions-Policy), and an SPA catch-all redirect.
