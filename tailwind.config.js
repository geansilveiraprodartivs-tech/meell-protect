/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        meell: {
          50: '#fff1f8',
          100: '#ffe0ef',
          200: '#ffc6e0',
          300: '#ff9ec9',
          400: '#ff6bab',
          500: '#f93f8e',
          600: '#e01d72',
          700: '#bd1259',
          800: '#9c1249',
          900: '#82143f',
        },
        lilas: {
          50: '#f7f3ff',
          100: '#eee6ff',
          200: '#e0d2ff',
          300: '#cab4ff',
          400: '#b48bf8',
          500: '#9d63ee',
          600: '#8644dd',
          700: '#7332c4',
          800: '#602aa0',
          900: '#502880',
        },
      },
      fontFamily: {
        sans: ['Poppins', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Poppins', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 10px 30px -12px rgba(189, 18, 89, 0.18)',
        card: '0 8px 24px -10px rgba(133, 68, 221, 0.18)',
        glow: '0 0 0 4px rgba(249, 63, 142, 0.12)',
      },
      borderRadius: {
        '2xl': '1.25rem',
        '3xl': '1.75rem',
      },
      keyframes: {
        floaty: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseRing: {
          '0%': { boxShadow: '0 0 0 0 rgba(249,63,142,0.45)' },
          '70%': { boxShadow: '0 0 0 14px rgba(249,63,142,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(249,63,142,0)' },
        },
      },
      animation: {
        floaty: 'floaty 6s ease-in-out infinite',
        fadeUp: 'fadeUp 0.5s ease-out both',
        pulseRing: 'pulseRing 2s infinite',
      },
    },
  },
  plugins: [],
};
