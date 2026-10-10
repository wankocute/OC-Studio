/** Up to two initials (first and last word), Vietnamese-aware upper-casing. */
export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = words.length > 1 ? [words[0], words.at(-1)] : words;
  return initials
    .map((word) => word?.[0]?.toLocaleUpperCase("vi") ?? "")
    .join("")
    .slice(0, 2);
}
