# BarberChat Pro (React)

The salon owner's dashboard, rebuilt in React in the look of barberchat.ma. This version covers three pages:

- **Accueil** (`/`): the period, today's bookings and payment alerts, the key figures, revenue per day, the team, bookings by outcome, best-selling services, promo codes.
- **Barbiers** (`/barbiers`): the team in the app's photo frame, search, a filter for barbers to watch, sort, every figure in one table, a detail panel, add and remove a barber.
- **Salon** (`/salon`): the cover and logo, information, address, opening hours, team, who manages bookings, deactivation, one save bar for the page.

The other menu entries open a "coming next" page.

## Run

```bash
npm install
npm run dev            # demo data
npm run typecheck
npm run build          # dist/
npm run build:preview  # dist-preview/artifact.html, one self-contained file
```

Without `VITE_API_URL` the app runs on demo data (`src/api/mock.ts`, labelled "Démo" in the header). With it, it calls the real backend through the same endpoints as the Svelte dashboard (`src/api/client.ts`); the token is read from `localStorage.access_token` until the login screen is ported.

**Demo data:** the salon, its address, cover, logo, team photos and menu are BarberLounge By Anwar's, as published on barberchat.ma (`src/demo/`). Every figure (bookings, revenue, rates, payments, promo codes) is an example.

## Code

```
src/
  api/        types.ts (from the Svelte types), client.ts (real API), mock.ts (demo), queries.ts (TanStack Query)
  app/        routes, shell (nav, phone dock, salon switcher), selected salon
  design/     tokens.css, base.css (shared pieces: section heads, lists, facts, rows), logo
  ui/         Button, Field, controls (chips, switch, state, empty), Portrait, Dialog, Toast, PageHeader
  charts/     RevenueChart (bars + table view), StatusBar (thin bar + legend)
  features/   dashboard/, barbers/, shop/
  lib/        French formatting, Casablanca neighbourhoods, small hooks
```

## Design

Taken from barberchat.ma's salon page, not invented:

- White page, the app menu's greys (`#111827`, `#6b7280`, `#e5e7eb`), Poppins for titles and figures, Inter for text.
- Titles as on a salon page: bold, tight, the address under them with a pin.
- Information in the site's white pills with a thin grey line. Lists in one soft card with lines that stop short of the sides, the value on the right in bold (the site's menu).
- Barbers in the app's 61 × 108 frame, names under the photo.
- Black pill buttons with a dot, black chips when selected, the frosted floating nav, the black dock on phones.
- Color only where it says something: green, amber and red for states and alerts (checked for contrast and colorblind separation), indigo for what is selected and for focus.
- No gradients, no glow, no entrance animations, no card around every block. What moves is what you press.

Charts: one series of black bars with 4px rounded tops, hairline grid, the day read on hover, tap or arrow keys, and a table view of the same numbers. Bookings by outcome: a thin bar and a legend with every count.

## Accessibility

Small text is never lighter than `#6b7280` (4.8:1). States always have words, not only color. Native `<dialog>` for focus and Escape. Every control is named, fields have labels, errors are announced and tied to their field. Touch targets are 44px on touch screens. A screen-reader pass with VoiceOver or NVDA is still to do.

## Known gaps

- Login is not ported. French only, for now.
- The API has one cover photo per salon; the site shows three. The page shows the one the API has.
- Some payload shapes (`add_barber`, `remove_barber`, `status` on `managed-update`) are inferred from the Svelte server code and need checking against the backend.
