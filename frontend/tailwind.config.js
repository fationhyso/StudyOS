/** @type {import('tailwindcss').Config} */

// Glass tokens carry their own default alpha (see index.css). An opacity
// modifier like `bg-surface/60` scales that alpha instead of replacing it,
// so translucent panes never turn into solid ink-coloured blocks.
const glassColor = (name) => ({ opacityValue }) =>
  opacityValue === undefined || opacityValue === '1'
    ? `rgb(var(--${name}) / var(--${name}-a))`
    : `rgb(var(--${name}) / calc(var(--${name}-a) * ${opacityValue}))`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: glassColor('canvas'),
        surface: glassColor('surface'),
        raised: glassColor('raised'),
        sidebar: glassColor('sidebar'),
        line: glassColor('line'),
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        accent: {
          DEFAULT: '#4e7a5c',
          hover: '#42694f',
          soft: 'rgb(78 122 92 / .14)',
          dark: '#29402f',
        },
      },
      fontFamily: { sans: ['Inter Variable', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      boxShadow: {
        soft: 'inset 0 1px 0 rgb(var(--edge)), 0 1px 2px rgb(var(--shade) / .05), 0 18px 48px -20px rgb(var(--shade) / .22)',
        float: 'inset 0 1px 0 rgb(var(--edge)), 0 2px 6px rgb(var(--shade) / .06), 0 30px 70px -24px rgb(var(--shade) / .34)',
        sm: 'inset 0 1px 0 rgb(var(--edge)), 0 1px 3px rgb(var(--shade) / .08)',
        md: 'inset 0 1px 0 rgb(var(--edge)), 0 6px 18px -6px rgb(var(--shade) / .18)',
      },
      animation: {
        'fade-in': 'fadeIn .25s ease-out',
        'slide-up': 'slideUp .35s cubic-bezier(.16,1,.3,1)',
        shimmer: 'shimmer 1.8s linear infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(10px) scale(.985)' }, to: { opacity: '1', transform: 'translateY(0) scale(1)' } },
        shimmer: { from: { backgroundPosition: '200% 0' }, to: { backgroundPosition: '-200% 0' } },
      },
    },
  },
  plugins: [],
};
