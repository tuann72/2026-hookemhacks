// Six-color palette used by the lobby color picker. Each entry is a hex
// string so it drops straight into Avatar.tsx's `tintOverride`/`player.tint`
// without any further conversion.

export const AVATAR_COLORS: readonly string[] = [
  "#FF6B4A", // coral
  "#2BB3C0", // teal
  "#2E7D5B", // forest
  "#FF5E7E", // pink
  "#FFD24A", // sun
  "#8A5EE0", // violet
] as const;

export const DEFAULT_AVATAR_TINT = AVATAR_COLORS[0];

const STORAGE_KEY = "hookem:avatarTint";

export function loadStoredTint(): string | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v && AVATAR_COLORS.includes(v) ? v : null;
}

export function saveStoredTint(tint: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, tint);
}
