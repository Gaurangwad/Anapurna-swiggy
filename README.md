# Annapurna

**Feed your parents from 2,000 km away.** A care-commerce agent on the **Swiggy MCP platform** — Food, Instamart, and Dineout together under one care profile. The child sets it up once and pays; the parent never touches an app.

Every Indian food app assumes the person ordering, eating, and paying is the same person at the same location. Annapurna breaks that assumption: the payer is in Bengaluru or Boston, the beneficiary is in Delhi, and an agent handles everything between — safety screening, dietary hard-blocks, meal selection, ordering, groceries, restaurant bookings, and a WhatsApp journey in Hindi for the parent.

## Run it (zero setup)

```bash
npm install
npm run mock     # terminal 1 — mock Swiggy MCP servers (/food /im /dineout) on :7301
npm run agent    # terminal 2 — Annapurna agent + app on :7302
```

Open **http://localhost:7302**:

1. **Continue with Swiggy** — a working showcase of the production OAuth 2.1 + PKCE sign-in
2. **Setup wizard** — build the parent's care profile from option arrays only (diet, allergies, schedule, budget, standing delivery instructions), then pick her favorite dishes from live, guard-passing menus fetched via the Food MCP
3. **Home** — three care actions: **Send lunch now** (agent-driven), **Order groceries** (Instamart MCP), **Book a table** (Dineout MCP), plus order history
4. **Tracking** — human status headline, orange milestone strip with timestamps, safety-check ledger, live Delhi map, delivery partner details, and a phone mockup streaming exactly what the parent receives on WhatsApp in Hindi

## Architecture

```
child ──▶ Annapurna app (Swiggy sign-in → setup wizard → home → tracking)
              │
              ▼
        Annapurna agent (Express, :7302)
        guards → favorites → meal brain (Claude ⇄ deterministic fallback)
              │
              ├── /food     search, menus, orders          ┐
              ├── /im       Instamart products & orders     ├─ Swiggy MCP
              └── /dineout  venues & table bookings        ┘  (mock :7301 ⇄ mcp.swiggy.com)
              │
              ├──▶ WhatsApp (Hindi) ──▶ parent's phone
              ├──▶ WhatsApp (English) ─▶ child's phone
              └──▶ live dashboard ─────▶ child's browser
```

Swap to production after Builders Club whitelisting: `SWIGGY_MCP_BASE=https://mcp.swiggy.com` + `SWIGGY_OAUTH_TOKEN=...` — the mock mirrors the MCP wire protocol and the real server paths, so it's a base-URL change; then diff their actual tool schemas against the mock's assumptions.

## 1 · Security posture

**Identity & payment:** sign-in is Swiggy's own OAuth 2.1 + PKCE (showcased end-to-end in the app). Annapurna receives a scoped bearer token — it never sees passwords, and **card data never exists in this system**: every order settles on the child's saved Swiggy payment method by construction.

**Input handling:** all profile creation is validated against allow-lists (diets, allergens, languages, days come from fixed option arrays); every string is length-capped and control-character-stripped; order/booking payloads are re-validated server-side regardless of what the UI sent.

**Transport & headers:** security headers on every response (nosniff, frame-deny, no-referrer, permissions-policy), 64 kb JSON body limit, and per-IP rate limiting (30 writes/min — generous for one family, hostile to abuse).

**The parent's physical safety:** standing delivery instructions ride on every order — ring twice, speak her language, and the anti-scam rule delivered to her on WhatsApp with every dispatch: *the delivery partner never asks for OTP or money*.

## 2 · Data: minimal, fast, private (DPDP-aligned)

**Small by design:** one care profile ≈ 1 KB in a local JSON file (gitignored). Order metadata and WhatsApp message feeds live **in memory** with a **24-hour TTL purge** — the system forgets by default. No database, no third-party analytics, no tracking pixels.

**Low latency:** state reads are in-memory Map lookups; the UI polls a single consolidated endpoint (status + meta + messages in one response); MCP calls are stateless JSON-RPC over HTTP.

**Privacy compliance (India DPDP Act 2023 alignment):** purpose limitation (data is used only to order/book for the parent), data minimisation (no fields beyond what the agent needs), recorded consent (the parent's consent to deliveries and WhatsApp updates is captured in the wizard and stored with a timestamp), and masked phone numbers in server logs.

## 3 · Why this is good for Swiggy

Care commerce converts one-off transactions into **recurring, emotionally locked-in revenue** — nobody churns on their mother's lunch. It pulls order density into residential tier-2/3 neighbourhoods, taps NRI spend (the world's largest remittance corridor, productised as forex-paid orders), and makes one payer generate **two households across three Swiggy businesses** — Food, Instamart, and Dineout in a single care profile. And it's a brand story money can't buy: *Swiggy feeds your parents when you can't be there.*

## 4 · Swiggy MCP terms — acknowledgement

This project is built for the **Swiggy Builders Club** and operates within the Swiggy MCP Terms of Use: actions are user-initiated and consented, placed on the authenticated user's own account for personal use; no scraping, no data extraction beyond the published APIs, no competitive benchmarking, no resale of data; Swiggy branding is preserved and surfaced ("via Swiggy" throughout the UI). The acknowledgement is also captured explicitly from the user in the setup wizard and stored with the profile.

## 5 · Swiggy sign-in (showcase)

The "Continue with Swiggy" flow in the app demonstrates the production authentication shape end-to-end: PKCE S256 challenge → Swiggy consent screen (scopes: `food.order`, `im.order`, `dineout.book`, `addresses.read`) → code-for-token exchange → bearer token on every MCP call. In this prototype the token issuance is mocked locally; the client code path is identical to production.

## Meal selection

Claude (set `ANTHROPIC_API_KEY`) chooses today's meal from guard-passing candidates — restricted to the favorites the child picked in the wizard, never repeating the last two dishes sent — with a **deterministic rule-based fallback** so the parent is never unfed because an LLM call failed.

## Roadmap (named, not built — scope discipline)

Parent choice via IVR/missed-call, taste graph from delivery and rating signals, festival & vrat calendar, cook-sync scheduling, care circle (multi-sibling payers), reverse mode (parents → hostel kids), post-partum 40-day care.
