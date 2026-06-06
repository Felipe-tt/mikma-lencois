import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['Outfit', 'system-ui', 'sans-serif'],
        display: ['Playfair Display', 'Georgia', 'serif'],
      },
      colors: {
        ink:      '#0F0E0C',
        'ink-80': 'rgba(15,14,12,0.8)',
        paper:    '#FAFAF8',
        warm:     '#F0EBE1',
        'warm-d': '#E6DDD0',
        clay:     '#C4714A',
        'clay-d': '#A05432',
        'clay-l': '#D4916A',
        mist:     '#E8E4DC',
        'mist-d': '#D8D2C8',
        mid:      '#6B6660',
        faint:    '#B8B2AA',
        'faint-l':'#D0CBC4',
        gold:     '#B8974A',
        'gold-l': '#D4B870',
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '1rem' }],
        '3xs': ['0.5rem',   { lineHeight: '0.75rem' }],
      },
      maxWidth: {
        '8xl': '88rem',
      },
      boxShadow: {
        'card':  '0 1px 3px 0 rgba(15,14,12,0.06), 0 4px 12px 0 rgba(15,14,12,0.04)',
        'card-hover': '0 4px 16px 0 rgba(15,14,12,0.10), 0 8px 32px 0 rgba(15,14,12,0.06)',
        'modal': '0 20px 60px 0 rgba(15,14,12,0.20)',
        'float': '0 2px 8px 0 rgba(15,14,12,0.10)',
        'inset-top': 'inset 0 1px 0 0 #E8E4DC',
      },
      transitionDuration: {
        '250': '250ms',
        '400': '400ms',
      },
      transitionTimingFunction: {
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        fadeUp:    { '0%': { opacity: '0', transform: 'translateY(16px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        fadeDown:  { '0%': { opacity: '0', transform: 'translateY(-8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        fadeIn:    { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideIn:   { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(0)' } },
        slideUp:   { '0%': { transform: 'translateY(100%)' }, '100%': { transform: 'translateY(0)' } },
        scaleIn:   { '0%': { opacity: '0', transform: 'scale(0.95)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        shimmer:   { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        pulse:     { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.5' } },
      },
      animation: {
        'fade-up':   'fadeUp 0.5s cubic-bezier(0.4,0,0.2,1) both',
        'fade-down': 'fadeDown 0.3s cubic-bezier(0.4,0,0.2,1) both',
        'fade-in':   'fadeIn 0.3s ease both',
        'slide-in':  'slideIn 0.3s cubic-bezier(0.4,0,0.2,1) both',
        'slide-up':  'slideUp 0.35s cubic-bezier(0.4,0,0.2,1) both',
        'scale-in':  'scaleIn 0.25s cubic-bezier(0.34,1.56,0.64,1) both',
      },
    },
  },
  plugins: [
    function({ addUtilities }: { addUtilities: (u: Record<string, Record<string, string>>) => void }) {
      addUtilities({
        '.scrollbar-none': { 'scrollbar-width': 'none', '-ms-overflow-style': 'none' },
        '.scrollbar-none::-webkit-scrollbar': { display: 'none' },
        '.text-balance': { 'text-wrap': 'balance' },
      });
    },
  ],
}

export default config
