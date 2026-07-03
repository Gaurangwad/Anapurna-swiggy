/**
 * Meal selection brain.
 *
 * Primary: Claude (Anthropic API) picks the best meal for today given the care
 * profile, guard-filtered menu, and context (festival/fast day, recent meals).
 *
 * Fallback: deterministic rules — cheapest guard-passing item matching the most
 * profile tags. The agent NEVER fails to feed the parent because an LLM call
 * failed. (Same deterministic-fallback architecture as the AI helpdesk project.)
 */
import type { CareProfile } from "./careProfile.js";
import type { MenuItem } from "./guards.js";

export interface MealChoice {
  itemId: string;
  itemName: string;
  reason: string;
  chosenBy: "AI" | "deterministic-fallback";
}

export async function chooseMeal(
  profile: CareProfile,
  candidates: MenuItem[],
  context: { note?: string } = {},
): Promise<MealChoice> {
  if (candidates.length === 0) throw new Error("No guard-passing menu items to choose from.");

  // Prefer the dishes the child hand-picked in the setup wizard, when available.
  const favs = candidates.filter((c) => profile.favorites?.includes(c.itemId));
  if (favs.length) candidates = favs;

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await chooseWithAI(profile, candidates, context);
    } catch (err) {
      console.warn("[mealBrain] AI unavailable, using deterministic fallback:", (err as Error).message);
    }
  }
  return deterministicChoice(profile, candidates);
}

async function chooseWithAI(
  profile: CareProfile,
  candidates: MenuItem[],
  context: { note?: string },
): Promise<MealChoice> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      system:
        "You choose one lunch item for an elderly parent from pre-safety-screened options. " +
        "Respond ONLY with JSON: {\"itemId\": string, \"reason\": string}. The reason must be one short warm sentence.",
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            parent: { name: profile.parent.name, diet: profile.health.diet, notes: profile.health.notes, favoriteItemIds: profile.favorites },
            budgetINR: profile.schedule.budgetPerMealINR,
            todayContext: context.note ?? "regular weekday",
            options: candidates.map(({ itemId, name, price, tags }) => ({ itemId, name, price, tags })),
          }),
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
  const data = await res.json();
  const text = data.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
  const item = candidates.find((c) => c.itemId === parsed.itemId);
  if (!item) throw new Error("AI has chosen an item outside the candidate list");
  return { itemId: item.itemId, itemName: item.name, reason: parsed.reason, chosenBy: "AI" };
}

function deterministicChoice(profile: CareProfile, candidates: MenuItem[]): MealChoice {
  const wantedTags = new Set<string>();
  if (profile.health.diet.includes("diabetic")) wantedTags.add("diabetic-friendly").add("light");
  if (profile.health.diet.includes("jain")) wantedTags.add("jain");
  if (profile.health.diet.includes("vrat-observant")) wantedTags.add("vrat");
  if (profile.health.softFoodOnly) wantedTags.add("soft-food");

  const scored = candidates
    .filter((c) => c.price <= profile.schedule.budgetPerMealINR)
    .map((c) => ({ item: c, score: c.tags.filter((t) => wantedTags.has(t)).length }))
    .sort((a, b) => b.score - a.score || a.item.price - b.item.price);

  const pick = scored[0]?.item ?? candidates[0];
  return {
    itemId: pick.itemId,
    itemName: pick.name,
    reason: "Best match for diet profile within budget (rule-based selection).",
    chosenBy: "deterministic-fallback",
  };
}
