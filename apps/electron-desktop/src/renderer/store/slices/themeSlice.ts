import type { StateCreator } from 'zustand';

export interface ThemeSlice {
  isLightTheme: boolean;
  toggleTheme: () => void;
}

const THEME_STORAGE_KEY = 'astra-theme';

function loadSavedTheme(): boolean {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'light';
  } catch {
    return false;
  }
}

function applyThemeToDocument(isLight: boolean): void {
  if (isLight) {
    document.body.classList.add('light');
  } else {
    document.body.classList.remove('light');
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, isLight ? 'light' : 'dark');
  } catch {
    // localStorage may be unavailable in some environments
  }
}

export const createThemeSlice: StateCreator<ThemeSlice> = (set, get) => {
  const savedTheme = loadSavedTheme();
  // Apply immediately on store creation
  applyThemeToDocument(savedTheme);

  return {
    isLightTheme: savedTheme,

    toggleTheme: () => {
      const newIsLight = !get().isLightTheme;
      applyThemeToDocument(newIsLight);
      set({ isLightTheme: newIsLight });
    },
  };
};
