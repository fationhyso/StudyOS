/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        sidebar: 'rgb(var(--sidebar) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        accent: {
          DEFAULT: '#617a67',
          hover: '#506855',
          soft: '#edf2ed',
          dark: '#29372d',
        },
      },
      fontFamily: { sans: ['Inter Variable', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      boxShadow: {
        soft: '0 1px 2px rgba(20, 25, 20, .03), 0 8px 32px rgba(20, 25, 20, .04)',
        float: '0 16px 50px rgba(20, 25, 20, .12), 0 2px 8px rgba(20, 25, 20, .05)',
      },
      animation: {
        'fade-in': 'fadeIn .25s ease-out',
        'slide-up': 'slideUp .3s cubic-bezier(.16,1,.3,1)',
        shimmer: 'shimmer 1.8s linear infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        shimmer: { from: { backgroundPosition: '200% 0' }, to: { backgroundPosition: '-200% 0' } },
      },
    },
  },
  plugins: [],
};
