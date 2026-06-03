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
        ink:   '#0F0E0C',
        paper: '#FAFAF8',
        warm:  '#F0EBE1',
        clay:  '#C4714A',
        'clay-d': '#A05432',
        mist:  '#E8E4DC',
        mid:   '#6B6660',
        faint: '#B8B2AA',
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '1rem' }],
      },
      maxWidth: {
        '8xl': '88rem',
      },
      transitionDuration: { '250': '250ms' },
      keyframes: {
        fadeUp:  { '0%': { opacity: '0', transform: 'translateY(12px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        fadeIn:  { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideIn: { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(0)' } },
      },
      animation: {
        'fade-up':  'fadeUp 0.5s ease both',
        'fade-in':  'fadeIn 0.3s ease both',
        'slide-in': 'slideIn 0.3s ease both',
      },
    },
  },
  plugins: [],
}

export default config
