"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { parseTheme, resolveTheme, THEME_KEY, type ThemePreference } from "@/lib/ui/preferences";
import { Icon } from "@/components/ui/icon";

const ThemeContext = createContext<{ theme: ThemePreference; setTheme: (value: ThemePreference) => void }>({ theme: "system", setTheme: () => {} });
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, updateTheme] = useState<ThemePreference>("system");
  const preferenceRef = useRef<ThemePreference>("system");
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function sync(event?: StorageEvent | Event) {
      if (event instanceof StorageEvent && event.key !== null && event.key !== THEME_KEY) return;
      let preference: ThemePreference = preferenceRef.current;
      try { preference = parseTheme(localStorage.getItem(THEME_KEY)); } catch { /* Storage can be disabled. */ }
      updateTheme(preference);
      preferenceRef.current = preference;
      document.documentElement.dataset.theme = resolveTheme(preference, media.matches);
    }
    sync(); media.addEventListener("change", sync); window.addEventListener("storage", sync);
    return () => { media.removeEventListener("change", sync); window.removeEventListener("storage", sync); };
  }, []);
  function setTheme(value: ThemePreference) {
    updateTheme(value);
    preferenceRef.current = value;
    try { localStorage.setItem(THEME_KEY, value); } catch { /* Theme still works in this tab. */ }
    document.documentElement.dataset.theme = resolveTheme(value, matchMedia("(prefers-color-scheme: dark)").matches);
  }
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}
export function ThemePicker() {
  const { theme, setTheme } = useContext(ThemeContext);
  return <fieldset className="theme-picker"><legend className="sr-only">Appearance</legend>
    {(["light", "dark", "system"] as const).map(value => <label key={value} className={theme === value ? "selected" : ""}>
      <input type="radio" name="appearance" value={value} checked={theme === value} onChange={() => setTheme(value)} />
      <span>{value[0].toUpperCase() + value.slice(1)}</span>
    </label>)}
  </fieldset>;
}

export function QuickThemeSwitcher() {
  const { theme, setTheme } = useContext(ThemeContext);
  const next: ThemePreference = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
  const label = `Theme: ${theme[0].toUpperCase() + theme.slice(1)}. Switch to ${next[0].toUpperCase() + next.slice(1)}`;
  return <button type="button" className="icon-button" aria-label={label} title={label} onClick={() => setTheme(next)}>
    <Icon name={theme === "light" ? "sun" : theme === "dark" ? "moon" : "monitor"} />
  </button>;
}
