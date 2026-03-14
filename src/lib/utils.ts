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

/** Extract the meeting id from a slug (supports UUID-style ids and short ids) */
export function meetingIdFromSlug(slug: string): string {
  // Check for UUID pattern at the end (8-4-4-4-12 hex)
  const uuidMatch = slug.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  if (uuidMatch) return uuidMatch[1];
  // Fallback: last segment after final hyphen
  const lastDash = slug.lastIndexOf("-");
  if (lastDash === -1) return slug;
  return slug.slice(lastDash + 1) || slug;
}
