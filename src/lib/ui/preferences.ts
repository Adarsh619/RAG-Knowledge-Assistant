export type ThemePreference = "light" | "dark" | "system";
export const THEME_KEY = "groundwork.theme";
export function parseTheme(value: string | null): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}
export function resolveTheme(theme: ThemePreference, systemDark: boolean) {
  return theme === "system" ? (systemDark ? "dark" : "light") : theme;
}
export function documentChatHref(id: string) {
  return `/chat?document=${encodeURIComponent(id)}&mode=documents`;
}
export function parseDocumentScope(value: string | null) {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : "";
}

export const CHAT_MODE_KEY = "groundwork.chat-mode";
export function parseChatMode(value: unknown): import("../../types/chat.ts").ChatMode {
  return value === "auto" || value === "general" ? value : "documents";
}
