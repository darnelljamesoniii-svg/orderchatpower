import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg:       '#060810',
        surface:  '#0d1117',
        card:     '#111827',
        border:   '#1f2937',
        accent:   '#00d4ff',
        neon:     '#00ff88',
        amber:    '#f59e0b',
        danger:   '#ef4444',
        purple:   '#8b5cf6',
        muted:    '#4b5563',
      },
      fontFamily: {
        rajdhani: ['Rajdhani', 'sans-serif'],
        mono:     ['JetBrains Mono', 'monospace'],
      },
      keyframes: {
        pulseGlow: {
          '0%,100%': { boxShadow: '0 0 0 0 rgba(0,255,136,0.4)' },
          '50%':     { boxShadow: '0 0 0 8px rgba(0,255,136,0)' },
        },
        waveBar: {
          '0%,100%': { transform: 'scaleY(0.25)' },
          '50%':     { transform: 'scaleY(1)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        pulseGlow: 'pulseGlow 2s ease-in-out infinite',
        waveBar:   'waveBar 1s ease-in-out infinite',
        slideUp:   'slideUp 0.3s ease',
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};

export default config;
