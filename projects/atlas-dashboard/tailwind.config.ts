import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Mockup palette
        'bg-0': '#050912',
        'bg-1': '#0a1428',
        'bg-2': '#0f1c3a',
        'orb': '#4ec5ff',
        'orb-deep': '#1668ff',
        'ink': '#e8f1ff',
        'ink-dim': '#8fa3c4',
        'accent': '#6ee7ff',
        'accent-warm': '#ffb86b',
        'good': '#5dffa5',
        'bad': '#ff6e8a',
        'line': 'rgba(120, 170, 255, 0.18)',
        'panel': 'rgba(14, 24, 48, 0.72)',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"Segoe UI"',
          'Inter',
          'system-ui',
          'sans-serif',
        ],
      },
      keyframes: {
        pulse: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.55', transform: 'scale(1.3)' },
        },
        spin: {
          to: { transform: 'rotate(360deg)' },
        },
        bob: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        wv: {
          '0%, 100%': { transform: 'scaleY(0.4)' },
          '50%': { transform: 'scaleY(1)' },
        },
      },
      animation: {
        'pulse-orb': 'pulse 1.6s infinite',
        'spin-slow': 'spin 14s linear infinite',
        'spin-mid':  'spin 22s linear infinite reverse',
        'spin-slow-long': 'spin 30s linear infinite',
        'bob': 'bob 6s ease-in-out infinite',
        'wv': 'wv 1.1s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
