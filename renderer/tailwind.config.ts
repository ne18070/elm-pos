import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './hooks/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
    './store/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          card:    'rgb(var(--surface-card) / <alpha-value>)',
          input:   'rgb(var(--surface-input) / <alpha-value>)',
          border:  'rgb(var(--surface-border) / <alpha-value>)',
          hover:   'rgb(var(--surface-hover) / <alpha-value>)',
          overlay: 'rgb(var(--surface-overlay) / <alpha-value>)',
        },
        content: {
          primary:   'rgb(var(--text-base) / <alpha-value>)',
          secondary: 'rgb(var(--text-secondary) / <alpha-value>)',
          muted:     'rgb(var(--text-placeholder) / <alpha-value>)',
          brand:     'rgb(var(--text-brand) / <alpha-value>)',
        },
        status: {
          success: 'rgb(var(--color-success) / <alpha-value>)',
          warning: 'rgb(var(--color-warning) / <alpha-value>)',
          error:   'rgb(var(--color-error) / <alpha-value>)',
          info:    'rgb(var(--color-info) / <alpha-value>)',
          brand:   'rgb(var(--color-brand) / <alpha-value>)',
          teal:    'rgb(var(--color-teal) / <alpha-value>)',
          purple:  'rgb(var(--color-purple) / <alpha-value>)',
          orange:  'rgb(var(--color-orange) / <alpha-value>)',
        },
        badge: {
          success: 'rgb(var(--badge-success) / <alpha-value>)',
          warning: 'rgb(var(--badge-warning) / <alpha-value>)',
          error:   'rgb(var(--badge-error) / <alpha-value>)',
          info:    'rgb(var(--badge-info) / <alpha-value>)',
          brand:   'rgb(var(--badge-brand) / <alpha-value>)',
          teal:    'rgb(var(--badge-teal) / <alpha-value>)',
          purple:  'rgb(var(--badge-purple) / <alpha-value>)',
          orange:  'rgb(var(--badge-orange) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem',
      },
      boxShadow: {
        card: '0 0 0 1px rgba(255,255,255,0.05), 0 4px 24px rgba(0,0,0,0.4)',
        glow: '0 0 10px rgba(14,165,233,0.10)',
      },
      height: {
        screen: '100dvh',   // dynamic viewport height — s'adapte à la barre navigateur mobile
      },
      minHeight: {
        screen: '100dvh',
      },
    },
  },
  plugins: [],
};

export default config;
