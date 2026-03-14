import type { TagRule } from "@/data/meetings";
import type { TranscriptSegment } from "@/components/MeetingPlayer";

/**
 * Scans transcript text against keyword rules using word-boundary matching.
 * Returns matched rule names sorted by number of keyword hits (descending).
 */
export function matchRules(segments: TranscriptSegment[], rules: TagRule[]): { name: string; hits: number }[] {
  if (!segments.length || !rules.length) return [];

  const fullText = segments.map((s) => s.text).join(" ").toLowerCase();
  const results: { name: string; hits: number }[] = [];

  for (const rule of rules) {
    let hits = 0;
    for (const keyword of rule.keywords) {
      try {
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`\\b${escaped}\\b`, "gi");
        const matches = fullText.match(regex);
        if (matches) hits += matches.length;
      } catch {
        // Invalid regex, skip
      }
    }
    if (hits > 0) results.push({ name: rule.name, hits });
  }

  return results.sort((a, b) => b.hits - a.hits);
}

/**
 * Auto-tag a meeting's transcript.
 * Returns { meetingType, autoCategories } based on saved rules.
 */
export function autoTag(
  segments: TranscriptSegment[],
  typeRules: TagRule[],
  categoryRules: TagRule[]
): { meetingType?: string; autoCategories: string[] } {
  const typeMatches = matchRules(segments, typeRules);
  const categoryMatches = matchRules(segments, categoryRules);

  return {
    meetingType: typeMatches.length > 0 ? typeMatches[0].name : undefined,
    autoCategories: categoryMatches.map((m) => m.name),
  };
}
