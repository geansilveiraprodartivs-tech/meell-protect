/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        meell: {
          50: '#fdf2f8',
          100: '#fce7f3',
          200: '#fbcfe8',
          300: '#f9a8d4',
          400: '#f472b6',
          500: '#ec4899',
          600: '#db2777',
          700: '#be185d',
          800: '#9d174d',
          900: '#831843',
        },
        lilac: {
          50: '#faf5ff',
          100: '#f3e8ff',
          200: '#e9d5ff',
          300: '#d8b4fe',
          400: '#c084fc',
          500: '#a855f7',
          600: '#9333ea',
          700: '#7e22ce',
          800: '#6b21a8',
          900: '#581c87',
        },
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #ec4899 0%, #a855f7 50%, #6366f1 100%)',
        'gradient-soft': 'linear-gradient(135deg, #fdf2f8 0%, #f3e8ff 50%, #ede9fe 100%)',
        'gradient-card': 'linear-gradient(135deg, rgba(236,72,153,0.05) 0%, rgba(168,85,247,0.05) 100%)',
        'gradient-hero': 'linear-gradient(160deg, #fdf2f8 0%, #f3e8ff 30%, #ede9fe 60%, #e0e7ff 100%)',
        'gradient-sidebar': 'linear-gradient(180deg, #831843 0%, #581c87 50%, #312e81 100%)',
        'gradient-btn': 'linear-gradient(135deg, #ec4899 0%, #a855f7 100%)',
        'gradient-btn-hover': 'linear-gradient(135deg, #db2777 0%, #9333ea 100%)',
      },
      boxShadow: {
        'glow': '0 0 20px rgba(236, 72, 153, 0.15)',
        'glow-lg': '0 0 40px rgba(236, 72, 153, 0.2)',
        'card': '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)',
        'card-hover': '0 4px 16px rgba(236, 72, 153, 0.12), 0 8px 24px rgba(168, 85, 247, 0.08)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
    },
  },
  plugins: [],
}
