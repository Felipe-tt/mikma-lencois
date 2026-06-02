import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        display: ['Cormorant Garamond', 'Georgia', 'serif'],
      },
      colors: {
        cream:   { DEFAULT: '#F5F0E8', dark: '#EDE7D9' },
        warm:    { DEFAULT: '#C8A96E', dark: '#A8863F' },
        ink:     { DEFAULT: '#1C1815', mid: '#3D3530', light: '#7A6E65' },
        mist:    '#EAE4DA',
        paper:   '#FDFBF7',
      },
      borderColor: {
        DEFAULT: '#EDE7D9',
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '112': '28rem',
        '128': '32rem',
      },
      maxWidth: {
        '8xl': '88rem',
      },
      transitionTimingFunction: {
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      keyframes: {
        fadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-up': 'fadeUp 0.45s ease both',
        'fade-in': 'fadeIn 0.3s ease both',
        'shimmer': 'shimmer 1.5s infinite',
      },
    },
  },
  plugins: [],
}

export default config
