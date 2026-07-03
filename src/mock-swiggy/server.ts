/**
 * Mock Swiggy MCP — localhost stand-in for the three production servers:
 *   /food     https://mcp.swiggy.com/food
 *   /im       https://mcp.swiggy.com/im        (Instamart)
 *   /dineout  https://mcp.swiggy.com/dineout
 *
 * Same MCP JSON-RPC wire protocol on all three paths, so swapping to
 * production after Builders Club whitelisting is a base-URL change only.
 *
 * Food catalog is deliberately deep: every diet/allergen permutation of the
 * care profile still yields at least 3–4 guard-passing dishes.
 */
import express from "express";

const app = express();
app.use(express.json({ limit: "64kb" }));

// ---------- Seed data: the parent lives in Delhi, the child pays from Bengaluru ----------

const addresses = [
  {
    id: "addr_parent_delhi",
    label: "Mummy — Delhi",
    line1: "001 Hauz khas village, Delhi, Delhi 110016",
    lat: 28.5535,
    lng: 77.194,
  },
  {
    id: "addr_child_blr",
    label: "Home — Bengaluru",
    line1: "7, 2nd cross, HSR Layout, Bengaluru, KA 560102",
    lat: 12.9121,
    lng: 77.6446,
  },
];

const restaurants = [
  {
    id: "rest_gurukripa",
    name: "Guru Kripa Thali House",
    cuisine: ["North Indian", "Thali"],
    rating: 4.5,
    fssai: "11423850000123",
    hygieneAudited: true,
    avgDeliveryMins: 28,
    lat: 28.5642,
    lng: 77.2065,
    nearAddressId: "addr_parent_delhi",
  },
  {
    id: "rest_sattvik",
    name: "Sattvik Rasoi (Jain • No Onion/Garlic)",
    cuisine: ["Jain", "North Indian"],
    rating: 4.3,
    fssai: "11423850000456",
    hygieneAudited: true,
    avgDeliveryMins: 34,
    lat: 28.5449,
    lng: 77.2015,
    nearAddressId: "addr_parent_delhi",
  },
  {
    id: "rest_gharjaisa",
    name: "Ghar Jaisa Rasoi (Homestyle)",
    cuisine: ["Homestyle", "North Indian", "South Indian"],
    rating: 4.4,
    fssai: "11423850000982",
    hygieneAudited: true,
    avgDeliveryMins: 26,
    lat: 28.5588,
    lng: 77.201,
    nearAddressId: "addr_parent_delhi",
  },
  {
    id: "rest_chatorilane",
    name: "Chatori Lane Fast Food",
    cuisine: ["Street Food", "Chinese"],
    rating: 3.6, // below safety threshold — guards reject this on purpose
    fssai: "11423850000789",
    hygieneAudited: false,
    avgDeliveryMins: 22,
    lat: 28.556,
    lng: 77.179,
    nearAddressId: "addr_parent_delhi",
  },
];

// Tags used by guards/mealBrain: light, soft-food, diabetic-friendly, low-sodium,
// jain, vrat, low-oil-option, rich, fried. Allergens: dairy, nuts, peanut, soy, gluten, seafood.
const menus: Record<string, Array<Record<string, unknown>>> = {
  rest_gurukripa: [
    { itemId: "gk_1", name: "Dal Fry + 3 Phulka + mix veg sabzi Thali", price: 180, veg: true, tags: ["low-oil-option"], allergens: ["gluten"] },
    { itemId: "gk_2", name: "Kadhi Chawal", price: 150, veg: true, tags: [], allergens: ["dairy"] },
    { itemId: "gk_3", name: "Paneer Butter Masala + Garlic Naan", price: 260, veg: true, tags: ["rich"], allergens: ["dairy", "nuts", "gluten"] },
    { itemId: "gk_4", name: "Moong Dal Khichdi (light)", price: 140, veg: true, tags: ["light", "diabetic-friendly", "soft-food"], allergens: [] },
    { itemId: "gk_5", name: "Lauki Sabzi + Jeera Rice", price: 160, veg: true, tags: ["light", "diabetic-friendly", "low-sodium"], allergens: [] },
    { itemId: "gk_6", name: "Veg Daliya Bowl", price: 130, veg: true, tags: ["light", "diabetic-friendly", "soft-food"], allergens: ["gluten"] },
  ],
  rest_sattvik: [
    { itemId: "sv_1", name: "Jain Thali (no onion/garlic)", price: 210, veg: true, tags: ["jain"], allergens: ["dairy", "gluten"] },
    { itemId: "sv_2", name: "Phalahari Vrat Thali", price: 190, veg: true, tags: ["vrat", "jain"], allergens: ["dairy", "nuts"] },
    { itemId: "sv_3", name: "Sabudana Khichdi", price: 120, veg: true, tags: ["vrat", "light", "jain"], allergens: ["peanut"] },
    { itemId: "sv_4", name: "Jain Moong Khichdi", price: 150, veg: true, tags: ["jain", "light", "diabetic-friendly", "soft-food"], allergens: [] },
    { itemId: "sv_5", name: "Steamed Dhokla Plate", price: 110, veg: true, tags: ["jain", "light", "diabetic-friendly"], allergens: [] },
    { itemId: "sv_6", name: "Jain Veg Clear Soup + Steamed Rice", price: 140, veg: true, tags: ["jain", "light", "low-sodium", "diabetic-friendly", "soft-food"], allergens: [] },
    { itemId: "sv_7", name: "Seasonal Fruit Bowl", price: 130, veg: true, tags: ["jain", "vrat", "light"], allergens: [] },
  ],
  rest_gharjaisa: [
    { itemId: "gj_1", name: "Palak Khichdi (soft)", price: 155, veg: true, tags: ["light", "diabetic-friendly", "soft-food"], allergens: [] },
    { itemId: "gj_2", name: "Low-Sodium Dal + Brown Rice", price: 165, veg: true, tags: ["low-sodium", "diabetic-friendly", "light"], allergens: [] },
    { itemId: "gj_3", name: "Bajra Rotla + Seasonal Sabzi (gluten-free)", price: 170, veg: true, tags: ["diabetic-friendly", "low-sodium"], allergens: [] },
    { itemId: "gj_4", name: "Curd Rice with Tempering", price: 120, veg: true, tags: ["soft-food", "light"], allergens: ["dairy"] },
    { itemId: "gj_5", name: "Besan Chilla + Mint Chutney", price: 125, veg: true, tags: ["light", "diabetic-friendly"], allergens: [] },
    { itemId: "gj_6", name: "Vegetable Idli + Sambar (2 pc)", price: 115, veg: true, tags: ["light", "soft-food", "diabetic-friendly"], allergens: [] },
  ],
  rest_chatorilane: [
    { itemId: "cl_1", name: "Veg Manchurian + Fried Rice", price: 160, veg: true, tags: ["fried"], allergens: ["soy", "gluten"] },
  ],
};

// ---------- Instamart (dark store) ----------

const darkStore = { id: "store_hkv", name: "Instamart — Hauz Khas", lat: 28.548, lng: 77.2005 };

const groceryCatalog = [
  { itemId: "im_1", name: "Whole Wheat Atta 5kg", price: 240, category: "Staples", allergens: ["gluten"], tags: [] },
  { itemId: "im_2", name: "Toor Dal 1kg", price: 160, category: "Staples", allergens: [], tags: ["diabetic-friendly"] },
  { itemId: "im_3", name: "Basmati Rice 1kg", price: 120, category: "Staples", allergens: [], tags: [] },
  { itemId: "im_4", name: "Low-GI Millet Mix 1kg", price: 190, category: "Staples", allergens: [], tags: ["diabetic-friendly"] },
  { itemId: "im_5", name: "Cow Milk 1L", price: 60, category: "Dairy", allergens: ["dairy"], tags: [] },
  { itemId: "im_6", name: "Paneer 200g", price: 85, category: "Dairy", allergens: ["dairy"], tags: [] },
  { itemId: "im_7", name: "Cold-Pressed Mustard Oil 1L", price: 210, category: "Essentials", allergens: [], tags: [] },
  { itemId: "im_8", name: "Fresh Vegetables Basket", price: 180, category: "Fresh", allergens: [], tags: ["diabetic-friendly"] },
  { itemId: "im_9", name: "Seasonal Fruits Basket", price: 220, category: "Fresh", allergens: [], tags: [] },
  { itemId: "im_10", name: "Salt-Free Masala Pack", price: 90, category: "Essentials", allergens: [], tags: ["low-sodium"] },
  { itemId: "im_11", name: "Roasted Chana 500g", price: 95, category: "Snacks", allergens: [], tags: ["diabetic-friendly"] },
  { itemId: "im_12", name: "Ginger-Garlic Paste 200g", price: 45, category: "Essentials", allergens: [], tags: ["not-jain"] },
];

// ---------- Dineout ----------

const dineoutVenues = [
  {
    id: "do_baithak",
    name: "Baithak — Family Dining",
    cuisine: ["North Indian", "Vegetarian"],
    rating: 4.5,
    area: "Hauz Khas",
    lat: 28.5541,
    lng: 77.1962,
    seniorFriendly: true,
    slots: ["12:30", "13:00", "13:30", "19:30", "20:00"],
  },
  {
    id: "do_sattvam",
    name: "Sattvam Dining Hall",
    cuisine: ["South Indian", "Jain options"],
    rating: 4.3,
    area: "Green Park",
    lat: 28.5589,
    lng: 77.2043,
    seniorFriendly: true,
    slots: ["12:00", "12:30", "13:00", "19:00", "20:30"],
  },
];

// ---------- Order + booking lifecycle simulation ----------

const FOOD_LIFECYCLE = ["PLACED", "CONFIRMED", "PREPARING", "PICKED_UP", "ARRIVING", "DELIVERED"] as const;
const GROCERY_LIFECYCLE = ["PLACED", "PACKED", "OUT_FOR_DELIVERY", "DELIVERED"] as const;
const FOOD_STAGE_SECONDS = 20; // full food demo ~100s
const GROCERY_STAGE_SECONDS = 15; // full grocery demo ~45s

interface SimOrder {
  orderId: string;
  kind: "food" | "grocery";
  restaurantId?: string;
  items: { itemId: string; qty: number }[];
  addressId: string;
  amount: number;
  placedAt: number;
  payment: { chargedTo: string; method: string; status: string };
  deliveryPartner: { name: string; phoneMasked: string; vehicle: string } | null;
}

const orders = new Map<string, SimOrder>();
const bookings = new Map<string, Record<string, unknown>>();

const DE_POOL = [
  { name: "Ramesh Yadav", phoneMasked: "98XXXXX214", vehicle: "DL-09 HB 4412" },
  { name: "Suresh Sharma", phoneMasked: "97XXXXX881", vehicle: "DL-09 KC 1190" },
  { name: "Vinod Kumar", phoneMasked: "96XXXXX437", vehicle: "DL-05 RT 2216" },
];

const lifecycleFor = (o: SimOrder) => (o.kind === "grocery" ? GROCERY_LIFECYCLE : FOOD_LIFECYCLE);
const stageSecondsFor = (o: SimOrder) => (o.kind === "grocery" ? GROCERY_STAGE_SECONDS : FOOD_STAGE_SECONDS);
const dePickupIndex = (o: SimOrder) => (o.kind === "grocery" ? 2 : 3); // OUT_FOR_DELIVERY / PICKED_UP

function currentStatusIndex(o: SimOrder): number {
  const elapsed = (Date.now() - o.placedAt) / 1000;
  return Math.min(Math.floor(elapsed / stageSecondsFor(o)), lifecycleFor(o).length - 1);
}

function originFor(o: SimOrder): { lat: number; lng: number; name: string } {
  if (o.kind === "grocery") return { lat: darkStore.lat, lng: darkStore.lng, name: darkStore.name };
  const r = restaurants.find((x) => x.id === o.restaurantId)!;
  return { lat: r.lat, lng: r.lng, name: r.name };
}

function riderPosition(o: SimOrder): { lat: number; lng: number } | null {
  const idx = currentStatusIndex(o);
  const pickup = dePickupIndex(o);
  if (idx < pickup) return null;
  const dest = addresses.find((a) => a.id === o.addressId)!;
  const start = originFor(o);
  const travelStages = lifecycleFor(o).length - 1 - pickup;
  const stageStart = pickup * stageSecondsFor(o);
  const travelSpan = Math.max(travelStages, 1) * stageSecondsFor(o);
  const t = Math.min(Math.max(((Date.now() - o.placedAt) / 1000 - stageStart) / travelSpan, 0), 1);
  return { lat: start.lat + (dest.lat - start.lat) * t, lng: start.lng + (dest.lng - start.lng) * t };
}

function makeOrder(kind: "food" | "grocery", args: any, amount: number): SimOrder {
  const order: SimOrder = {
    orderId: (kind === "grocery" ? "gro_" : "ord_") + Math.random().toString(36).slice(2, 10),
    kind,
    restaurantId: args.restaurantId,
    items: args.items,
    addressId: args.addressId,
    amount,
    placedAt: Date.now(),
    payment: { chargedTo: "authenticated_user (child)", method: "Saved UPI •• gaurang@okhdfc", status: "PAID" },
    deliveryPartner: null,
  };
  orders.set(order.orderId, order);
  return order;
}

function orderStatus(orderId: string) {
  const o = orders.get(orderId);
  if (!o) throw new Error(`Unknown orderId '${orderId}'.`);
  const lifecycle = lifecycleFor(o);
  const idx = currentStatusIndex(o);
  if (idx >= dePickupIndex(o) && !o.deliveryPartner) {
    o.deliveryPartner = DE_POOL[Math.floor(Math.random() * DE_POOL.length)];
  }
  const origin = originFor(o);
  return {
    orderId: o.orderId,
    kind: o.kind,
    status: lifecycle[idx],
    statusIndex: idx,
    lifecycle,
    amount: o.amount,
    payment: o.payment,
    deliveryPartner: idx >= dePickupIndex(o) ? o.deliveryPartner : null,
    riderLocation: riderPosition(o),
    destination: addresses.find((a) => a.id === o.addressId),
    origin,
    restaurant:
      o.kind === "food"
        ? (() => {
            const r = restaurants.find((x) => x.id === o.restaurantId)!;
            return { id: r.id, name: r.name, rating: r.rating, lat: r.lat, lng: r.lng };
          })()
        : { id: darkStore.id, name: darkStore.name, rating: 4.6, lat: darkStore.lat, lng: darkStore.lng },
  };
}

// ---------- Tool registries per MCP server ----------

type ToolDef = { name: string; description: string; inputSchema: unknown };
type ToolImpl = (args: Record<string, any>) => unknown;

function server(tools: ToolDef[], impls: Record<string, ToolImpl>, serverName: string) {
  return (req: express.Request, res: express.Response) => {
    const { id, method, params } = req.body ?? {};
    const reply = (result: unknown) => res.json({ jsonrpc: "2.0", id, result });
    try {
      if (method === "initialize")
        return reply({ protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: serverName, version: "0.3.0" } });
      if (method === "tools/list") return reply({ tools });
      if (method === "tools/call") {
        const impl = impls[params.name];
        if (!impl) throw new Error(`Unknown tool '${params.name}'.`);
        const result = impl(params.arguments ?? {});
        return reply({ content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result });
      }
      if (method === "notifications/initialized") return res.status(202).end();
      return res.json({ jsonrpc: "2.0", id, error: { code: -32000, message: `Unknown method '${method}'` } });
    } catch (err: any) {
      return reply({ content: [{ type: "text", text: `Error: ${err.message}` }], isError: true });
    }
  };
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });

// ---- /food ----
app.post(
  "/food",
  server(
    [
      { name: "get_addresses", description: "Saved delivery addresses on the authenticated account.", inputSchema: obj({}) },
      { name: "search_restaurants", description: "Restaurants deliverable to an address, with rating/FSSAI/hygiene.", inputSchema: obj({ addressId: { type: "string" }, query: { type: "string" } }, ["addressId"]) },
      { name: "get_menu", description: "Menu with veg flags, tags, allergens.", inputSchema: obj({ restaurantId: { type: "string" } }, ["restaurantId"]) },
      { name: "place_order", description: "Place a food order. Settles on the authenticated (child's) saved payment method.", inputSchema: obj({ restaurantId: { type: "string" }, items: { type: "array" }, addressId: { type: "string" }, deliveryInstructions: { type: "string" } }, ["restaurantId", "items", "addressId"]) },
      { name: "get_order_status", description: "Live order status incl. delivery partner and rider location.", inputSchema: obj({ orderId: { type: "string" } }, ["orderId"]) },
    ],
    {
      get_addresses: () => ({ addresses }),
      search_restaurants: (a) => ({
        restaurants: restaurants
          .filter((r) => r.nearAddressId === a.addressId)
          .filter((r) => !a.query || (r.cuisine.join(" ") + " " + r.name).toLowerCase().includes(String(a.query).toLowerCase())),
      }),
      get_menu: (a) => {
        const menu = menus[a.restaurantId];
        if (!menu) throw new Error(`Unknown restaurantId '${a.restaurantId}'.`);
        return { restaurantId: a.restaurantId, items: menu };
      },
      place_order: (a) => {
        const menu = menus[a.restaurantId];
        if (!menu) throw new Error(`Unknown restaurantId '${a.restaurantId}'.`);
        const amount = (a.items as { itemId: string; qty: number }[]).reduce((sum, it) => {
          const item = menu.find((m) => m.itemId === it.itemId);
          if (!item) throw new Error(`Item '${it.itemId}' not on menu.`);
          return sum + (item.price as number) * it.qty;
        }, 0);
        const o = makeOrder("food", a, amount);
        return { orderId: o.orderId, amount, payment: o.payment, etaMinutes: 30 };
      },
      get_order_status: (a) => orderStatus(a.orderId),
    },
    "mock-swiggy-food",
  ),
);

// ---- /im (Instamart) ----
app.post(
  "/im",
  server(
    [
      { name: "search_products", description: "Instamart products deliverable to an address.", inputSchema: obj({ addressId: { type: "string" }, query: { type: "string" } }, ["addressId"]) },
      { name: "place_grocery_order", description: "Place an Instamart order. Settles on the authenticated (child's) payment method.", inputSchema: obj({ addressId: { type: "string" }, items: { type: "array" }, deliveryInstructions: { type: "string" } }, ["addressId", "items"]) },
      { name: "get_order_status", description: "Live grocery order status.", inputSchema: obj({ orderId: { type: "string" } }, ["orderId"]) },
    ],
    {
      search_products: (a) => ({
        store: darkStore,
        products: groceryCatalog.filter((p) => !a.query || p.name.toLowerCase().includes(String(a.query).toLowerCase())),
      }),
      place_grocery_order: (a) => {
        const amount = (a.items as { itemId: string; qty: number }[]).reduce((sum, it) => {
          const p = groceryCatalog.find((x) => x.itemId === it.itemId);
          if (!p) throw new Error(`Unknown product '${it.itemId}'.`);
          return sum + p.price * it.qty;
        }, 0);
        const o = makeOrder("grocery", a, amount);
        return { orderId: o.orderId, amount, payment: o.payment, etaMinutes: 15 };
      },
      get_order_status: (a) => orderStatus(a.orderId),
    },
    "mock-swiggy-instamart",
  ),
);

// ---- /dineout ----
app.post(
  "/dineout",
  server(
    [
      { name: "search_dineout", description: "Bookable restaurants near an address with available slots.", inputSchema: obj({ addressId: { type: "string" } }, ["addressId"]) },
      { name: "book_table", description: "Book a table. No payment; reservation held on the authenticated account.", inputSchema: obj({ venueId: { type: "string" }, date: { type: "string" }, time: { type: "string" }, partySize: { type: "integer" }, note: { type: "string" } }, ["venueId", "date", "time", "partySize"]) },
    ],
    {
      search_dineout: () => ({ venues: dineoutVenues }),
      book_table: (a) => {
        const venue = dineoutVenues.find((v) => v.id === a.venueId);
        if (!venue) throw new Error(`Unknown venue '${a.venueId}'.`);
        if (!venue.slots.includes(a.time)) throw new Error(`Slot ${a.time} not available at ${venue.name}.`);
        const bookingId = "bk_" + Math.random().toString(36).slice(2, 8).toUpperCase();
        const booking = { bookingId, venue: { id: venue.id, name: venue.name, area: venue.area, rating: venue.rating }, date: a.date, time: a.time, partySize: a.partySize, note: a.note ?? "", status: "CONFIRMED" };
        bookings.set(bookingId, booking);
        return booking;
      },
    },
    "mock-swiggy-dineout",
  ),
);

const PORT = 7301;
app.listen(PORT, () =>
  console.log(`[mock-swiggy] MCP servers on http://localhost:${PORT}  paths: /food /im /dineout`),
);
