/**
 * Annapurna agent server.
 *
 * Setup wizard:
 *   POST /api/signin/swiggy          — showcase of Swiggy OAuth 2.1 + PKCE sign-in (mock)
 *   GET  /api/addresses              — saved addresses from the Swiggy account (via MCP)
 *   POST /api/dish-options           — guard-passing dishes for a draft health profile
 *   POST /api/care-profile           — validated profile creation (allow-lists only)
 *
 * Care actions (all pay from the CHILD's OAuth session — never through this app):
 *   POST /api/orders                 — food: search → guards → favorites → meal brain → order
 *   GET  /api/grocery/catalog        — Instamart products (/im MCP)
 *   POST /api/grocery/orders         — Instamart order for the parent
 *   GET  /api/dineout/options        — bookable venues (/dineout MCP)
 *   POST /api/dineout/book           — table booking for the parent
 *   GET  /api/orders, /api/orders/:id, GET /api/profile/:id
 *
 * Security & privacy posture (see README):
 *   - Strict input validation with allow-lists; hard caps on every string
 *   - Security headers on every response; 64kb body limit; per-IP rate limiting
 *   - No card data anywhere; phone numbers masked in server logs
 *   - In-memory order/message state with 24h TTL pruning (data minimisation)
 */
import express from "express";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { callTool } from "./mcpClient.js";
import { saveProfile, getProfile, anyProfile, validateProfile, type CareProfile, DIETS, ALLERGENS, LANGUAGES, DAYS } from "./careProfile.js";
import { checkRestaurant, checkItem, deliveryInstructions, type Restaurant, type MenuItem } from "./guards.js";
import { chooseMeal } from "./mealBrain.js";
import { notifyMilestone, notifyGroceryMilestone, notifyBooking, notifyWellnessConcern, messageLog } from "../notify/whatsapp.js";

const app = express();
app.use(express.json({ limit: "64kb" }));

// ---------- Security middleware ----------

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

// Per-IP token bucket: 30 write requests/minute is plenty for one family.
const buckets = new Map<string, { tokens: number; last: number }>();
app.use((req, res, next) => {
  if (req.method !== "POST") return next();
  const ip = req.ip ?? "local";
  const b = buckets.get(ip) ?? { tokens: 30, last: Date.now() };
  b.tokens = Math.min(30, b.tokens + ((Date.now() - b.last) / 60000) * 30);
  b.last = Date.now();
  if (b.tokens < 1) return res.status(429).json({ error: "Too many requests — slow down." });
  b.tokens -= 1;
  buckets.set(ip, b);
  next();
});

app.use(express.static(fileURLToPath(new URL("../../public", import.meta.url))));

const maskPhone = (p: string) => p.replace(/(\+?\d{2})\d+(\d{2})/, "$1••••$2");

// ---------- Sign-in showcase (Swiggy OAuth 2.1 + PKCE, mocked end-to-end) ----------

app.post("/api/signin/swiggy", (_req, res) => {
  // Production shape: redirect to Swiggy's authorization endpoint with a PKCE
  // code challenge; Swiggy authenticates the CHILD and returns an auth code;
  // we exchange it for a bearer token used on every MCP call. Payment identity
  // therefore comes from Swiggy itself — this app never sees credentials.
  res.json({
    ok: true,
    flow: ["authorize (PKCE S256)", "swiggy consent", "code → token exchange", "bearer on every MCP call"],
    session: { user: "Gaurang", via: "swiggy", scopes: ["food.order", "im.order", "dineout.book", "addresses.read"] },
  });
});

app.get("/api/options", (_req, res) => {
  res.json({ diets: DIETS, allergens: ALLERGENS, languages: LANGUAGES, days: DAYS });
});

app.get("/api/addresses", async (_req, res) => {
  try {
    const { addresses } = await callTool<{ addresses: any[] }>("food", "get_addresses", {});
    res.json({ addresses });
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
});

// ---------- Wizard: guard-passing dish options for a draft profile ----------

app.post("/api/dish-options", async (req, res) => {
  try {
    const draft = req.body ?? {};
    const health: CareProfile["health"] = {
      diet: Array.isArray(draft.diet) ? draft.diet.filter((d: string) => (DIETS as readonly string[]).includes(d)) : [],
      allergens: Array.isArray(draft.allergens) ? draft.allergens.filter((a: string) => (ALLERGENS as readonly string[]).includes(a)) : [],
      softFoodOnly: draft.softFoodOnly === true,
      notes: "",
    };
    const budget = Number(draft.budgetPerMealINR) || 2000;
    const addressId = String(draft.addressId || "addr_parent_delhi").slice(0, 60);

    const { restaurants } = await callTool<{ restaurants: Restaurant[] }>("food", "search_restaurants", { addressId });
    const groups: any[] = [];
    let blockedCount = 0;
    for (const r of restaurants) {
      if (!checkRestaurant(r).passed) { blockedCount++; continue; }
      const { items } = await callTool<{ items: MenuItem[] }>("food", "get_menu", { restaurantId: r.id });
      const passing = items.filter((i) => checkItem(i, health, budget).passed);
      blockedCount += items.length - passing.length;
      if (passing.length) groups.push({ restaurant: { id: r.id, name: r.name, rating: r.rating }, items: passing });
    }
    res.json({ groups, blockedCount, via: "Swiggy Food MCP" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Care profile ----------

app.post("/api/care-profile", (req, res) => {
  const result = validateProfile(req.body);
  if (!result.ok) return res.status(400).json({ errors: result.errors });
  saveProfile(result.profile);
  console.log(`[annapurna] profile saved: ${result.profile.id} (parent wa ${maskPhone(result.profile.parent.whatsapp)})`);
  res.json({ ok: true, profileId: result.profile.id });
});

app.get("/api/profile/current", (_req, res) => {
  const p = anyProfile();
  if (!p) return res.status(404).json({ error: "No care profile yet" });
  res.json(p);
});

app.get("/api/profile/:id", (req, res) => {
  const profile = getProfile(req.params.id);
  if (!profile) return res.status(404).json({ error: `No care profile '${req.params.id}'` });
  res.json(profile);
});

// ---------- In-memory registry (meta + milestone timestamps), 24h TTL ----------

interface OrderMeta {
  orderId: string;
  kind: "food" | "grocery" | "booking";
  profileId: string;
  item: string;
  veg?: boolean;
  restaurant: string;
  reason?: string;
  chosenBy?: string;
  amountINR: number;
  guardAudit: string[];
  placedAt: number;
  milestones: Record<string, number>;
  booking?: { date: string; time: string; partySize: number; area: string; bookingId: string };
}
const orderRegistry = new Map<string, OrderMeta>();

setInterval(() => {
  const cutoff = Date.now() - 24 * 3600 * 1000;
  for (const [id, m] of orderRegistry) if (m.placedAt < cutoff) { orderRegistry.delete(id); messageLog.delete(id); }
}, 3600 * 1000);

app.get("/api/orders", (_req, res) => {
  res.json({ orders: [...orderRegistry.values()].sort((a, b) => b.placedAt - a.placedAt) });
});

// ---------- Food order: the core agent flow ----------

app.post("/api/orders", async (req, res) => {
  try {
    const profileId = String(req.body?.profileId ?? "").slice(0, 40);
    const contextNote = String(req.body?.contextNote ?? "").slice(0, 200);
    const profile = getProfile(profileId) ?? anyProfile();
    if (!profile) return res.status(404).json({ error: "No care profile — complete setup first." });

    const audit: string[] = [];

    const { restaurants } = await callTool<{ restaurants: Restaurant[] }>("food", "search_restaurants", {
      addressId: profile.parent.addressId,
    });
    const safeRestaurants = restaurants.filter((r) => {
      const report = checkRestaurant(r);
      if (!report.passed) audit.push(`Rejected ${r.name}: ${report.reasons.join("; ")}`);
      return report.passed;
    });
    if (safeRestaurants.length === 0) throw new Error("No restaurant passed safety standards near parent.");

    const candidates: Array<MenuItem & { restaurantId: string; restaurantName: string }> = [];
    for (const r of safeRestaurants) {
      const { items } = await callTool<{ items: MenuItem[] }>("food", "get_menu", { restaurantId: r.id });
      for (const item of items) {
        const report = checkItem(item, profile.health, profile.schedule.budgetPerMealINR);
        if (report.passed) candidates.push({ ...item, restaurantId: r.id, restaurantName: r.name });
        else audit.push(`Blocked '${item.name}' (${r.name}): ${report.reasons.join("; ")}`);
      }
    }

    // Variety: never repeat the last two dishes sent (beginning of the taste graph).
    const recent = [...orderRegistry.values()]
      .filter((o) => o.kind === "food" && o.profileId === profile.id)
      .sort((a, b) => b.placedAt - a.placedAt)
      .slice(0, 2)
      .map((o) => o.item);
    const varied = candidates.filter((c) => !recent.includes(c.name));

    const choice = await chooseMeal(profile, varied.length ? varied : candidates, { note: contextNote });
    const chosen = candidates.find((c) => c.itemId === choice.itemId)!;

    const order = await callTool<{ orderId: string; amount: number; payment: unknown }>("food", "place_order", {
      restaurantId: chosen.restaurantId,
      items: [{ itemId: chosen.itemId, qty: 1 }],
      addressId: profile.parent.addressId,
      deliveryInstructions: deliveryInstructions(profile),
    });

    orderRegistry.set(order.orderId, {
      orderId: order.orderId,
      kind: "food",
      profileId: profile.id,
      item: chosen.name,
      veg: chosen.veg,
      restaurant: chosen.restaurantName,
      reason: choice.reason,
      chosenBy: choice.chosenBy,
      amountINR: order.amount,
      guardAudit: audit,
      placedAt: Date.now(),
      milestones: { PLACED: Date.now() },
    });
    watchOrder("food", order.orderId, profile, chosen.restaurantName, chosen.name);

    res.json({
      orderId: order.orderId,
      chose: { item: chosen.name, from: chosen.restaurantName, reason: choice.reason, by: choice.chosenBy },
      payment: order.payment,
      amountINR: order.amount,
      guardAudit: audit,
      tracking: `http://localhost:${PORT}/?order=${order.orderId}`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Instamart: groceries for the parent ----------

app.get("/api/grocery/catalog", async (_req, res) => {
  try {
    const profile = anyProfile();
    const result = await callTool<any>("im", "search_products", { addressId: profile?.parent.addressId ?? "addr_parent_delhi" });
    // Annotate profile fit so the UI can badge items (never a hard block for groceries — child decides).
    const allergens = profile?.health.allergens ?? [];
    const jain = profile?.health.diet.includes("jain") ?? false;
    result.products = result.products.map((p: any) => ({
      ...p,
      profileNote: p.allergens?.some((a: string) => allergens.includes(a))
        ? `contains ${p.allergens.filter((a: string) => allergens.includes(a)).join(", ")}`
        : jain && p.tags?.includes("not-jain")
          ? "not Jain"
          : null,
    }));
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
});

app.post("/api/grocery/orders", async (req, res) => {
  try {
    const profile = anyProfile();
    if (!profile) return res.status(404).json({ error: "No care profile — complete setup first." });
    const items = (Array.isArray(req.body?.items) ? req.body.items : [])
      .map((it: any) => ({ itemId: String(it.itemId).slice(0, 20), qty: Math.min(Math.max(1, Number(it.qty) || 1), 10) }))
      .slice(0, 20);
    if (!items.length) return res.status(400).json({ error: "Select at least one item." });

    const { products } = await callTool<any>("im", "search_products", { addressId: profile.parent.addressId });
    const names = items.map((it: any) => products.find((p: any) => p.itemId === it.itemId)?.name ?? it.itemId);
    const summary = names.slice(0, 2).join(", ") + (names.length > 2 ? ` +${names.length - 2} more` : "");

    const order = await callTool<{ orderId: string; amount: number; payment: unknown }>("im", "place_grocery_order", {
      addressId: profile.parent.addressId,
      items,
      deliveryInstructions: deliveryInstructions(profile),
    });

    orderRegistry.set(order.orderId, {
      orderId: order.orderId,
      kind: "grocery",
      profileId: profile.id,
      item: summary,
      restaurant: "Instamart — Hauz Khas",
      amountINR: order.amount,
      guardAudit: [],
      placedAt: Date.now(),
      milestones: { PLACED: Date.now() },
    });
    watchOrder("grocery", order.orderId, profile, "Instamart", summary);

    res.json({ orderId: order.orderId, amountINR: order.amount, payment: order.payment, itemsSummary: summary, tracking: `http://localhost:${PORT}/?order=${order.orderId}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Dineout: book a table for the parent ----------

app.get("/api/dineout/options", async (_req, res) => {
  try {
    const profile = anyProfile();
    const result = await callTool<any>("dineout", "search_dineout", { addressId: profile?.parent.addressId ?? "addr_parent_delhi" });
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
});

app.post("/api/dineout/book", async (req, res) => {
  try {
    const profile = anyProfile();
    if (!profile) return res.status(404).json({ error: "No care profile — complete setup first." });
    const payload = {
      venueId: String(req.body?.venueId ?? "").slice(0, 30),
      date: String(req.body?.date ?? "").slice(0, 12),
      time: String(req.body?.time ?? "").slice(0, 5),
      partySize: Math.min(Math.max(1, Number(req.body?.partySize) || 2), 12),
      note: String(req.body?.note ?? "").slice(0, 160),
    };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) return res.status(400).json({ error: "Date must be YYYY-MM-DD." });

    const booking = await callTool<any>("dineout", "book_table", payload);

    orderRegistry.set(booking.bookingId, {
      orderId: booking.bookingId,
      kind: "booking",
      profileId: profile.id,
      item: `Table for ${payload.partySize} — ${payload.time}`,
      restaurant: booking.venue.name,
      amountINR: 0,
      guardAudit: [],
      placedAt: Date.now(),
      milestones: { CONFIRMED: Date.now() },
      booking: { date: payload.date, time: payload.time, partySize: payload.partySize, area: booking.venue.area, bookingId: booking.bookingId },
    });

    await notifyBooking({
      profile,
      bookingId: booking.bookingId,
      venueName: booking.venue.name,
      area: booking.venue.area,
      date: payload.date,
      time: payload.time,
      partySize: payload.partySize,
    });

    res.json({ booking });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Live status (food + grocery), enriched for the UI ----------

app.get("/api/orders/:id", async (req, res) => {
  try {
    const meta = orderRegistry.get(req.params.id) ?? null;
    if (meta?.kind === "booking") {
      return res.json({ kind: "booking", meta, messages: messageLog.get(req.params.id) ?? [] });
    }
    const serverPath = req.params.id.startsWith("gro_") ? "im" : "food";
    const status = await callTool<any>(serverPath as any, "get_order_status", { orderId: req.params.id });
    res.json({ ...status, meta, messages: messageLog.get(req.params.id) ?? [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Milestone watcher (food + grocery lifecycles) ----------

const notified = new Map<string, Set<string>>();

function watchOrder(kind: "food" | "grocery", orderId: string, profile: CareProfile, restaurantName: string, itemName: string): void {
  notified.set(orderId, new Set());
  const serverPath = kind === "grocery" ? "im" : "food";
  const timer = setInterval(async () => {
    try {
      const s = await callTool<any>(serverPath as any, "get_order_status", { orderId });
      const seen = notified.get(orderId)!;
      for (const m of s.lifecycle as string[]) {
        if (m === "PLACED") continue;
        if (s.lifecycle.indexOf(m) <= s.statusIndex && !seen.has(m)) {
          seen.add(m);
          const meta = orderRegistry.get(orderId);
          if (meta) meta.milestones[m] = Date.now();
          if (kind === "food") {
            await notifyMilestone(m as any, { profile, orderId, restaurantName, itemName, de: s.deliveryPartner });
          } else {
            await notifyGroceryMilestone(m as any, { profile, orderId, itemsSummary: itemName, de: s.deliveryPartner });
          }
        }
      }
      if (s.status === "DELIVERED") clearInterval(timer);
    } catch (err) {
      console.warn("[watcher] poll failed:", (err as Error).message);
    }
  }, 4000);

  // Wellness net: quiet alert to the child if not delivered within a hard window.
  setTimeout(async () => {
    const seen = notified.get(orderId);
    if (seen && !seen.has("DELIVERED")) {
      await notifyWellnessConcern(profile, `Today's ${kind} order hasn't been marked delivered yet — you may want to call.`);
    }
  }, 10 * 60 * 1000);
}

// ---------- Boot ----------
// No auto-seeding anymore: the setup wizard is the front door. The example
// profile file remains as documentation of the schema.

const PORT = 7302;
app.listen(PORT, () => console.log(`[annapurna] agent on http://localhost:${PORT}`));
