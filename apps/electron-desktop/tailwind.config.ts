import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/renderer/**/*.{ts,tsx,html}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          0: 'var(--bg0)',
          1: 'var(--bg1)',
          2: 'var(--bg2)',
          3: 'var(--bg3)',
          4: 'var(--bg4)',
          5: 'var(--bg5)',
        },
        text: {
          0: 'var(--t0)',
          1: 'var(--t1)',
          2: 'var(--t2)',
        },
        border: 'var(--border)',
        accent: {
          blue: 'var(--accent-blue)',
          purple: 'var(--accent-purple)',
          green: 'var(--accent-green)',
          amber: 'var(--accent-amber)',
          red: 'var(--accent-red)',
          teal: 'var(--accent-teal)',
          pink: 'var(--accent-pink)',
        },
      },
      borderRadius: {
        card: 'var(--radius-card)',
        input: 'var(--radius-input)',
        pill: 'var(--radius-pill)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
      },
    },
  },
  plugins: [],
};

export default config;
