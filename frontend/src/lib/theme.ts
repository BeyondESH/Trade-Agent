import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "raibro.theme";

export function loadTheme(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "dark" || raw === "light") return raw;
  } catch {
    /* ignore */
  }
  return "dark";
}

/** Apply the theme to <html data-theme="..."> (drives the --tv-* tokens). */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(loadTheme);
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  const setTheme = useCallback((next: Theme) => {
    saveTheme(next);
    setThemeState(next);
  }, []);
  return { theme, setTheme };
}
