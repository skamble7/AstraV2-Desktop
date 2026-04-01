import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/renderer/**/*.{ts,tsx}'],
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        // Map CSS variables to Tailwind utility classes
        'astra-bg0': 'var(--bg0)',
        'astra-bg1': 'var(--bg1)',
        'astra-bg2': 'var(--bg2)',
        'astra-bg3': 'var(--bg3)',
        'astra-bg4': 'var(--bg4)',
        'astra-t0': 'var(--t0)',
        'astra-t1': 'var(--t1)',
        'astra-t2': 'var(--t2)',
        'astra-blue': 'var(--accent-blue)',
        'astra-purple': 'var(--accent-purple)',
        'astra-green': 'var(--accent-green)',
        'astra-amber': 'var(--accent-amber)',
        'astra-red': 'var(--accent-red)',
        'astra-teal': 'var(--accent-teal)',
        border: 'var(--border)',
      },
      borderRadius: {
        card: 'var(--radius-card)',
        input: 'var(--radius-input)',
        pill: 'var(--radius-pill)',
      },
    },
  },
  plugins: [],
};

export default config;
