import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Generate a URL-safe slug from a meeting title + id suffix for uniqueness */
export function meetingSlug(title: string, id: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/[\s]+/g, "-")
    .slice(0, 80);
  return `${slug}-${id}`;
}

/** Extract the meeting id from a slug (last segment after final hyphen matching id pattern) */
export function meetingIdFromSlug(slug: string): string {
  // The id is appended after the last hyphen: "some-title-m6" → "m6"
  // For imported meetings with uuid-style ids, grab everything after last known separator
  const lastDash = slug.lastIndexOf("-");
  if (lastDash === -1) return slug;
  const candidate = slug.slice(lastDash + 1);
  // If the candidate looks like an id (starts with 'm' + digit, or is alphanumeric), use it
  return candidate || slug;
}
