/**
 * The Care Profile — Annapurna's core data model.
 * One payer (child), one beneficiary (parent). Built once via the setup wizard.
 *
 * Privacy by design (DPDP Act 2023 alignment):
 *  - Data minimisation: only fields the agent needs to act. No card data ever —
 *    payment rides on the child's Swiggy OAuth session, never through this app.
 *  - Purpose limitation: profile is used solely to order/book for the parent.
 *  - Consent: parent's consent to deliveries + WhatsApp updates is recorded.
 *  - Storage: a single local JSON file (gitignored), kilobytes not databases.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// ---------- Option arrays: the wizard builds profiles ONLY from these ----------

export const LANGUAGES = ["Hindi", "Kannada", "Tamil", "Telugu", "Marathi", "Bengali", "English"] as const;
export const DIETS = ["vegetarian", "jain", "diabetic", "low-sodium", "vrat-observant"] as const;
export const ALLERGENS = ["nuts", "peanut", "dairy", "gluten", "soy", "seafood"] as const;
export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export interface CareProfile {
  id: string;
  parent: {
    name: string;
    addressId: string; // Swiggy saved address id from the CHILD's account
    language: (typeof LANGUAGES)[number];
    whatsapp: string;
  };
  child: {
    name: string;
    whatsapp: string;
    // No payment fields by design: the child IS the OAuth-authenticated Swiggy
    // user, so orders settle on their saved payment method by construction.
  };
  health: {
    diet: (typeof DIETS)[number][];
    allergens: (typeof ALLERGENS)[number][]; // hard blocks
    softFoodOnly: boolean;
    notes: string;
  };
  schedule: {
    lunchTime: string; // "13:30"
    daysOff: (typeof DAYS)[number][];
    budgetPerMealINR: number;
  };
  delivery: {
    fallbackContact?: string;
    instructions?: string; // child-written standing instructions, set during profile creation
  };
  favorites: string[]; // itemIds chosen in the wizard from guard-passing dishes
  consent: {
    parentConsent: boolean; // parent has agreed to deliveries + WhatsApp updates
    termsAcknowledged: boolean; // child acknowledged Swiggy MCP terms
    recordedAt: number;
  };
}

// ---------- Validation: allow-lists only, hard caps on every string ----------

const cap = (s: unknown, max: number) =>
  String(s ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, max);

const PHONE_RE = /^\+?[0-9X]{8,15}$/;

export function validateProfile(raw: any): { ok: true; profile: CareProfile } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const pick = <T extends readonly string[]>(list: T, values: unknown, label: string): T[number][] => {
    if (!Array.isArray(values)) return [];
    const clean = values.filter((v): v is T[number] => (list as readonly string[]).includes(v));
    if (clean.length !== values.length) errors.push(`${label} contains values outside the allowed set`);
    return [...new Set(clean)];
  };

  const id = cap(raw?.id, 40).toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!id) errors.push("Profile id required");

  const parentName = cap(raw?.parent?.name, 40);
  if (!parentName) errors.push("Parent name required");
  const language = (LANGUAGES as readonly string[]).includes(raw?.parent?.language) ? raw.parent.language : null;
  if (!language) errors.push("Language must be one of the supported options");
  const parentWa = cap(raw?.parent?.whatsapp, 16);
  if (!PHONE_RE.test(parentWa)) errors.push("Parent WhatsApp number invalid");
  const addressId = cap(raw?.parent?.addressId, 60);
  if (!addressId) errors.push("Parent address required");

  const childName = cap(raw?.child?.name, 40);
  if (!childName) errors.push("Your name required");
  const childWa = cap(raw?.child?.whatsapp, 16);
  if (!PHONE_RE.test(childWa)) errors.push("Your WhatsApp number invalid");

  const diet = pick(DIETS, raw?.health?.diet, "diet");
  const allergens = pick(ALLERGENS, raw?.health?.allergens, "allergens");
  const daysOff = pick(DAYS, raw?.schedule?.daysOff, "daysOff");

  const lunchTime = /^([01]?\d|2[0-3]):[0-5]\d$/.test(raw?.schedule?.lunchTime) ? raw.schedule.lunchTime : null;
  if (!lunchTime) errors.push("Lunch time must be HH:MM");
  const budget = Number(raw?.schedule?.budgetPerMealINR);
  if (!Number.isFinite(budget) || budget < 50 || budget > 2000) errors.push("Budget must be ₹50–₹2000");

  const favorites = Array.isArray(raw?.favorites)
    ? [...new Set(raw.favorites.map((f: unknown) => cap(f, 20)))].filter(Boolean).slice(0, 20)
    : [];

  if (raw?.consent?.parentConsent !== true) errors.push("Parent consent is required");
  if (raw?.consent?.termsAcknowledged !== true) errors.push("Swiggy MCP terms must be acknowledged");

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    profile: {
      id,
      parent: { name: parentName, addressId, language, whatsapp: parentWa },
      child: { name: childName, whatsapp: childWa },
      health: {
        diet,
        allergens,
        softFoodOnly: raw?.health?.softFoodOnly === true,
        notes: cap(raw?.health?.notes, 240),
      },
      schedule: { lunchTime, daysOff, budgetPerMealINR: Math.round(budget) },
      delivery: {
        fallbackContact: cap(raw?.delivery?.fallbackContact, 80) || undefined,
        instructions: cap(raw?.delivery?.instructions, 280) || undefined,
      },
      favorites: favorites as string[],
      consent: { parentConsent: true, termsAcknowledged: true, recordedAt: Date.now() },
    },
  };
}

// ---------- Tiny local store (kilobytes; no database; gitignored) ----------

const STORE = fileURLToPath(new URL("../../data/care-profiles.json", import.meta.url));

export function saveProfile(profile: CareProfile): void {
  const all = loadAll();
  all[profile.id] = profile;
  writeFileSync(STORE, JSON.stringify(all, null, 2));
}

export function getProfile(id: string): CareProfile | undefined {
  return loadAll()[id];
}

export function anyProfile(): CareProfile | undefined {
  const all = loadAll();
  const key = Object.keys(all)[0];
  return key ? all[key] : undefined;
}

function loadAll(): Record<string, CareProfile> {
  if (!existsSync(STORE)) return {};
  try {
    return JSON.parse(readFileSync(STORE, "utf-8"));
  } catch {
    return {};
  }
}
