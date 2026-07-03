/**
 * WhatsApp updates to BOTH parent and child.
 *
 * Production: Meta WhatsApp Cloud API (set WHATSAPP_TOKEN + WHATSAPP_PHONE_ID).
 * Demo: falls back to console output — which is actually ideal for the Loom
 * recording, since messages print in a clean readable panel.
 *
 * Templates are deliberately in simple Hindi for the parent and English for
 * the child. Every parent-facing delivery message carries the anti-scam line.
 */
import type { CareProfile } from "../agent/careProfile.js";

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;

async function send(to: string, text: string): Promise<void> {
  if (TOKEN && PHONE_ID) {
    await fetch(`https://graph.facebook.com/v19.0/${PHONE_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
    });
  } else {
    console.log(`\n┌─ WhatsApp → ${to}\n│ ${text.split("\n").join("\n│ ")}\n└─────────────`);
  }
}

const ANTI_SCAM_LINE = "⚠️ Yaad rakhein: delivery wale bhaiya kabhi OTP ya paise nahi maangenge. Khaane ke Paise diye huwe hai.";

type Milestone = "CONFIRMED" | "PREPARING" | "PICKED_UP" | "ARRIVING" | "DELIVERED";

interface MilestoneCtx {
  profile: CareProfile;
  orderId: string;
  restaurantName: string;
  itemName: string;
  de?: { name: string; phoneMasked: string; vehicle: string } | null;
}

const parentTemplates: Record<Milestone, (c: MilestoneCtx) => string> = {
  CONFIRMED: (c) =>
    `Namaste ${c.profile.parent.name} ji 😁\n${c.profile.child.name} ne aapke liye khaana bheja hai 😋 ${c.itemName} (${c.restaurantName}).\nDopahar ${c.profile.schedule.lunchTime} tak aapke darwaaze pe pahunch jayega.`,
  PREPARING: (c) => `Aapka khaana ban raha hai 🍲 (${c.restaurantName})`,
  PICKED_UP: (c) =>
    `Khaana nikal chuka hai 🛵\nDelivery bhaiya: ${c.de?.name} (${c.de?.vehicle})\n${ANTI_SCAM_LINE}`,
  ARRIVING: (c) => `${c.de?.name} bas pahunchne wale hain. Darwaze ki ghanti do baar bajegi. \n${ANTI_SCAM_LINE}`,
  DELIVERED: (c) => `Khaana pahunch gaya hai ✅ Aaram se khaiye. ${c.profile.child.name} ko delivery poori hone ka bata diya gaya hai.`,
};

const childTemplates: Record<Milestone, (c: MilestoneCtx) => string> = {
  CONFIRMED: (c) => `✅ Order confirmed for ${c.profile.parent.name}: ${c.itemName} from ${c.restaurantName} (order ${c.orderId}). Paid from your account.`,
  PREPARING: (c) => `🍲 Being prepared at ${c.restaurantName}.`,
  PICKED_UP: (c) => `🛵 Picked up. Delivery partner: ${c.de?.name}, ${c.de?.phoneMasked}, vehicle ${c.de?.vehicle}. Live tracking: http://localhost:7302/?order=${c.orderId}`,
  ARRIVING: (c) => `📍 ${c.de?.name} is arriving at ${c.profile.parent.name}'s address now.`,
  DELIVERED: (c) => `✅ Delivered and received successfully. ${c.profile.parent.name} has her lunch.`,
};

/** In-memory feed so the dashboard's phone mockup can render Mummy's WhatsApp side live. */
export interface RecordedMessage {
  side: "parent" | "child";
  milestone: Milestone;
  text: string;
  at: number;
}
export const messageLog = new Map<string, RecordedMessage[]>();

function record(orderId: string, side: "parent" | "child", milestone: Milestone, text: string): void {
  if (!messageLog.has(orderId)) messageLog.set(orderId, []);
  messageLog.get(orderId)!.push({ side, milestone, text, at: Date.now() });
}

export async function notifyMilestone(m: Milestone, ctx: MilestoneCtx): Promise<void> {
  const parentText = parentTemplates[m](ctx);
  const childText = childTemplates[m](ctx);
  record(ctx.orderId, "parent", m, parentText);
  record(ctx.orderId, "child", m, childText);
  await send(ctx.profile.parent.whatsapp, parentText);
  await send(ctx.profile.child.whatsapp, childText);
}

/** Wellness alert — quiet, never panicked. */
export async function notifyWellnessConcern(profile: CareProfile, message: string): Promise<void> {
  await send(profile.child.whatsapp, `🥰 Gentle note about ${profile.parent.name}: ${message}`);
}

// ---------- Grocery (Instamart) + Dineout notifications ----------

type GroceryMilestone = "PLACED" | "PACKED" | "OUT_FOR_DELIVERY" | "DELIVERED";

interface GroceryCtx {
  profile: CareProfile;
  orderId: string;
  itemsSummary: string; // e.g. "Atta, Toor Dal +3 more"
  de?: { name: string; phoneMasked: string; vehicle: string } | null;
}

const groceryParent: Record<GroceryMilestone, (c: GroceryCtx) => string> = {
  PLACED: (c) => `Namaste ${c.profile.parent.name} ji 🙏\n${c.profile.child.name} ne ghar ka saaman bheja hai: ${c.itemsSummary}. Thodi der mein pahunch jayega.`,
  PACKED: () => `Aapka saaman pack ho gaya hai 📦`,
  OUT_FOR_DELIVERY: (c) => `Saaman nikal chuka hai 🛵\nDelivery bhaiya: ${c.de?.name} (${c.de?.vehicle})\n${ANTI_SCAM_LINE}`,
  DELIVERED: (c) => `Saaman pahunch gaya hai ✅ ${c.profile.child.name} ko bata diya gaya hai.`,
};

const groceryChild: Record<GroceryMilestone, (c: GroceryCtx) => string> = {
  PLACED: (c) => `Instamart order placed for ${c.profile.parent.name}: ${c.itemsSummary} (order ${c.orderId}). Paid from your account.`,
  PACKED: () => `Packed at the dark store.`,
  OUT_FOR_DELIVERY: (c) => `Out for delivery. Partner: ${c.de?.name}, ${c.de?.phoneMasked}, ${c.de?.vehicle}. Track: http://localhost:7302/?order=${c.orderId}`,
  DELIVERED: (c) => `Groceries delivered and received by ${c.profile.parent.name}.`,
};

export async function notifyGroceryMilestone(m: GroceryMilestone, ctx: GroceryCtx): Promise<void> {
  const parentText = groceryParent[m](ctx);
  const childText = groceryChild[m](ctx);
  record(ctx.orderId, "parent", m as any, parentText);
  record(ctx.orderId, "child", m as any, childText);
  await send(ctx.profile.parent.whatsapp, parentText);
  await send(ctx.profile.child.whatsapp, childText);
}

interface BookingCtx {
  profile: CareProfile;
  bookingId: string;
  venueName: string;
  area: string;
  date: string;
  time: string;
  partySize: number;
}

export async function notifyBooking(ctx: BookingCtx): Promise<void> {
  const parentText = `Namaste ${ctx.profile.parent.name} ji 🙏\n${ctx.profile.child.name} ne aapke liye table book kiya hai:\n${ctx.venueName}, ${ctx.area}\n${ctx.date}, ${ctx.time} baje — ${ctx.partySize} log\nBooking naam/ID: ${ctx.bookingId}. Wahan jaakar yeh ID bataiye. Koi payment nahi karna hai.`;
  const childText = `Table booked for ${ctx.profile.parent.name}: ${ctx.venueName} (${ctx.area}) — ${ctx.date} ${ctx.time}, party of ${ctx.partySize}. Booking ID ${ctx.bookingId}.`;
  record(ctx.bookingId, "parent", "CONFIRMED" as any, parentText);
  record(ctx.bookingId, "child", "CONFIRMED" as any, childText);
  await send(ctx.profile.parent.whatsapp, parentText);
  await send(ctx.profile.child.whatsapp, childText);
}
