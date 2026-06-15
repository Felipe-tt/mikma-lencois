import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        display: ['DM Serif Display', 'Georgia', 'serif'],
        mono:    ['ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        ink:       '#1E1208',
        'ink-80':  'rgba(30,18,8,0.8)',
        paper:     '#FAF8F5',
        warm:      '#F0EAE1',
        'warm-d':  '#E5DDD2',
        linen:     '#D8CFBF',
        clay:      '#B8622F',
        'clay-d':  '#96501E',
        'clay-l':  '#CC7A47',
        mist:      '#E6DFD5',
        'mist-d':  '#D5CAC0',
        mid:       '#705A48',
        faint:     '#B09C8C',
        'faint-l': '#CCBDB0',
      },
      fontSize: {
        '2xs': ['0.65rem',  { lineHeight: '1rem' }],
        '3xs': ['0.525rem', { lineHeight: '0.75rem' }],
      },
      maxWidth: {
        '8xl': '88rem',
      },
      boxShadow: {
        'card':       '0 1px 2px 0 rgba(12,11,9,0.05)',
        'card-hover': '0 4px 24px 0 rgba(12,11,9,0.09)',
        'modal':      '0 24px 64px 0 rgba(12,11,9,0.18)',
        'float':      '0 2px 12px 0 rgba(12,11,9,0.08)',
        'inset-top':  'inset 0 1px 0 0 #E4DED5',
      },
      transitionDuration: {
        '150': '150ms',
        '250': '250ms',
        '400': '400ms',
      },
      transitionTimingFunction: {
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'out':    'cubic-bezier(0.0, 0, 0.2, 1)',
      },
      keyframes: {
        fadeUp:   { '0%': { opacity: '0', transform: 'translateY(14px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        fadeDown: { '0%': { opacity: '0', transform: 'translateY(-8px)'  }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        fadeIn:   { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideIn:  { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(0)' } },
        slideUp:  { '0%': { transform: 'translateY(100%)' }, '100%': { transform: 'translateY(0)' } },
        scaleIn:  { '0%': { opacity: '0', transform: 'scale(0.96)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        shimmer:  { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
      animation: {
        'fade-up':   'fadeUp 0.5s cubic-bezier(0.4,0,0.2,1) both',
        'fade-down': 'fadeDown 0.28s cubic-bezier(0.4,0,0.2,1) both',
        'fade-in':   'fadeIn 0.25s ease both',
        'slide-in':  'slideIn 0.3s cubic-bezier(0.4,0,0.2,1) both',
        'slide-up':  'slideUp 0.32s cubic-bezier(0.4,0,0.2,1) both',
        'scale-in':  'scaleIn 0.22s cubic-bezier(0.34,1.56,0.64,1) both',
      },
    },
  },
  plugins: [
    function({ addUtilities }: { addUtilities: (u: Record<string, Record<string, string>>) => void }) {
      addUtilities({
        '.scrollbar-none': { 'scrollbar-width': 'none', '-ms-overflow-style': 'none' },
        '.scrollbar-none::-webkit-scrollbar': { display: 'none' },
        '.text-balance': { 'text-wrap': 'balance' },
        '.writing-vertical': { 'writing-mode': 'vertical-rl' },
      });
    },
  ],
}

export default config
