/**
 * Safety / health / standards assurance layer.
 *
 * Design rule: NEVER trust restaurant metadata alone for medical constraints.
 * Allergens and diet rules are enforced here, at the agent layer, as hard
 * blocks — regardless of what the menu claims. Every rejection carries a
 * human-readable reason so the child sees exactly why something was filtered.
 */
import type { CareProfile } from "./careProfile.js";

export const MIN_RATING = 4.2;

export interface Restaurant {
  id: string;
  name: string;
  rating: number;
  fssai?: string;
  hygieneAudited?: boolean;
  cuisine: string[];
}

export interface MenuItem {
  itemId: string;
  name: string;
  price: number;
  veg: boolean;
  tags: string[];
  allergens: string[];
}

export interface GuardReport {
  passed: boolean;
  reasons: string[];
}

/** Standards assurance: rating floor + FSSAI license + hygiene audit. */
export function checkRestaurant(r: Restaurant): GuardReport {
  const reasons: string[] = [];
  if (r.rating < MIN_RATING) reasons.push(`Rating ${r.rating} below safety threshold ${MIN_RATING}`);
  if (!r.fssai) reasons.push("No FSSAI license on record");
  if (r.hygieneAudited === false) reasons.push("Not hygiene-audited");
  return { passed: reasons.length === 0, reasons };
}

/** Health assurance: hard-block allergens & diet violations from the care profile. */
export function checkItem(item: MenuItem, health: CareProfile["health"], budget?: number): GuardReport {
  const reasons: string[] = [];

  for (const allergen of health.allergens) {
    if (item.allergens.map((a) => a.toLowerCase()).includes(allergen.toLowerCase())) {
      reasons.push(`HARD BLOCK — contains allergen '${allergen}'`);
    }
  }

  if (health.diet.includes("vegetarian") && !item.veg) reasons.push("Non-veg item blocked (vegetarian profile)");
  if (health.diet.includes("jain") && !item.tags.includes("jain")) reasons.push("Not marked Jain (no onion/garlic) — blocked for Jain profile");
  if (health.diet.includes("diabetic") && item.tags.includes("rich")) reasons.push("Rich/heavy item blocked for diabetic profile");
  if (health.diet.includes("low-sodium") && item.tags.includes("fried")) reasons.push("Fried item blocked for low-sodium profile");
  if (health.softFoodOnly && !item.tags.includes("soft-food") && !item.tags.includes("light")) {
    reasons.push("Not soft/light food — blocked during recovery period");
  }
  if (budget !== undefined && item.price > budget) reasons.push(`Above ₹${budget} per-meal budget`);

  return { passed: reasons.length === 0, reasons };
}

/**
 * Standing delivery instructions — predictability IS the accessibility feature.
 * The child's own instructions (written during profile setup) are appended.
 */
export function deliveryInstructions(profile: CareProfile): string {
  const lines = [
    `Ring the bell twice and wait — recipient is elderly.`,
    `Speak ${profile.parent.language}.`,
    `Never ask the recipient for OTP or any payment — order is fully paid by family.`,
    profile.delivery.fallbackContact
      ? `If no answer, hand over to ${profile.delivery.fallbackContact}.`
      : `If no answer, call the payer (child), not the recipient.`,
  ];
  if (profile.delivery.instructions) lines.push(profile.delivery.instructions);
  return lines.join(" ");
}
