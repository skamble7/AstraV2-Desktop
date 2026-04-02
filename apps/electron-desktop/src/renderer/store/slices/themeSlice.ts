import type { StateCreator } from 'zustand';

export type ThemeStyle = 'vscode' | 'newspaper';

export interface ThemeSlice {
  isLightTheme: boolean;
  themeStyle: ThemeStyle;
  toggleTheme: () => void;
  setThemeStyle: (style: ThemeStyle) => void;
}

const THEME_STORAGE_KEY = 'astra-theme';
const THEME_STYLE_STORAGE_KEY = 'astra-theme-style';

function loadSavedTheme(): boolean {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'light';
  } catch {
    return false;
  }
}

function loadSavedThemeStyle(): ThemeStyle {
  try {
    const saved = localStorage.getItem(THEME_STYLE_STORAGE_KEY);
    return saved === 'newspaper' ? 'newspaper' : 'vscode';
  } catch {
    return 'vscode';
  }
}

function applyThemeToDocument(isLight: boolean, style: ThemeStyle): void {
  if (isLight) {
    document.body.classList.add('light');
  } else {
    document.body.classList.remove('light');
  }
  if (style === 'newspaper') {
    document.body.classList.add('newspaper');
  } else {
    document.body.classList.remove('newspaper');
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, isLight ? 'light' : 'dark');
    localStorage.setItem(THEME_STYLE_STORAGE_KEY, style);
  } catch {
    // localStorage may be unavailable in some environments
  }
}

export const createThemeSlice: StateCreator<ThemeSlice> = (set, get) => {
  const savedTheme = loadSavedTheme();
  const savedStyle = loadSavedThemeStyle();
  // Apply immediately on store creation
  applyThemeToDocument(savedTheme, savedStyle);

  return {
    isLightTheme: savedTheme,
    themeStyle: savedStyle,

    toggleTheme: () => {
      const newIsLight = !get().isLightTheme;
      applyThemeToDocument(newIsLight, get().themeStyle);
      set({ isLightTheme: newIsLight });
    },

    setThemeStyle: (style: ThemeStyle) => {
      applyThemeToDocument(get().isLightTheme, style);
      set({ themeStyle: style });
    },
  };
};
