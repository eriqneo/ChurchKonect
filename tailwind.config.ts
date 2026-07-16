import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        cathedral: {
          50: '#FDF2F4',    // lightest blush (light mode accents)
          100: '#F9E0E5',
          200: '#F0BCC6',
          300: '#E48D9E',
          400: '#D45E76',
          500: '#B83A55',
          600: '#9B2A42',
          700: '#7B1D31',   // primary maroon (light mode buttons/actions)
          800: '#5E1525',
          900: '#3D0E18',   // dark card surfaces
          950: '#1E0710',   // deepest (dark mode overlay tints)
        },
        surface: {
          0: '#0C0C0E',     // dark mode screen bg
          50: '#121214',    // dark mode elevated bg
          100: '#1A1A1E',   // dark mode card bg
          200: '#242428',   // dark mode secondary card / borders
          300: '#2E2E34',   // dark mode tertiary
          400: '#3A3A42',   // dark mode muted elements
          light: '#FAF7F2', // light mode screen bg (warm parchment)
          'light-card': '#FFFFFF',  // light mode card bg
          'light-secondary': '#F3EDE4', // light mode secondary surfaces
        },
        gold: {
          50: '#FDF8ED',
          100: '#F9EDCF',
          200: '#F2D99F',
          300: '#E8C06A',
          400: '#D4A84A',
          500: '#C8A45C',   // primary accent (the "neon green" equivalent)
          600: '#A88434',
          700: '#8A6A24',
          800: '#6B5019',
          900: '#4A3810',
          glow: 'rgba(200, 164, 92, 0.3)', // for glow effects
        },
        sage: {
          400: '#7BC47F',   // online/success on dark
          500: '#5BA85F',   // online/success on light
          600: '#478A4B',
        },
        semantic: {
          success: '#5BA85F',
          warning: '#D4A84A',
          error: '#D45E76',
          info: '#5E9ECF',
        },
        text: {
          primary: '#E8E8EA',      // dark mode primary text
          secondary: '#8A8A92',    // dark mode secondary text
          muted: '#5A5A64',        // dark mode muted text
          'light-primary': '#1A1A1E',   // light mode primary text
          'light-secondary': '#6A6A74', // light mode secondary text
          'light-muted': '#9A9AA2',     // light mode muted text
        },
        'theme-text': 'var(--text-primary)',
        'theme-text-secondary': 'var(--text-secondary)',
        'theme-text-muted': 'var(--text-muted)',
        'theme-bg': 'var(--bg-screen)',
        'theme-card': 'var(--bg-card)',
        'theme-card-glass': 'var(--bg-card-glass)',
        'theme-border': 'var(--border-subtle)',
        'theme-accent': 'var(--accent-primary)',
        'theme-accent-gold': 'var(--accent-gold)',
      },
      boxShadow: {
        'glow-gold': '0 0 20px rgba(200, 164, 92, 0.25), 0 0 60px rgba(200, 164, 92, 0.1)',
        'glow-cathedral': '0 0 30px rgba(123, 29, 49, 0.3)',
        'card-dark': '0 2px 8px rgba(0, 0, 0, 0.3), 0 1px 3px rgba(0, 0, 0, 0.2)',
        'card-light': '0 2px 12px rgba(0, 0, 0, 0.06), 0 1px 4px rgba(0, 0, 0, 0.04)',
        'sheet': '0 -4px 24px rgba(0, 0, 0, 0.4)',
        'tab-glow': '0 -4px 16px rgba(200, 164, 92, 0.35)',
        'float': '0 8px 24px rgba(0, 0, 0, 0.35)',
      },
      borderRadius: {
        'card': '16px',
        'card-lg': '20px',
        'button': '12px',
        'pill': '9999px',
        'sheet': '24px',
        'input': '14px',
      },
      backdropBlur: {
        'glass': '16px',
        'glass-heavy': '24px',
      },
    },
  },
  plugins: [],
};

export default config;
