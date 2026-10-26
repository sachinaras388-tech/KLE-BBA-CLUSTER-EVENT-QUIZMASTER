/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#f3f5ff',
          100: '#e6eaff',
          200: '#ccd5ff',
          300: '#a8b6ff',
          400: '#8190fb',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
      },
      boxShadow: {
        soft: '0 1px 2px rgb(15 23 42 / 0.04), 0 8px 24px -8px rgb(15 23 42 / 0.10)',
        lift: '0 2px 4px rgb(15 23 42 / 0.05), 0 16px 40px -12px rgb(79 70 229 / 0.25)',
      },
      keyframes: {
        'fade-up': { '0%': { opacity: 0, transform: 'translateY(8px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        'fade-in': { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        'pulse-ring': { '0%': { boxShadow: '0 0 0 0 rgb(16 185 129 / 0.5)' }, '100%': { boxShadow: '0 0 0 8px rgb(16 185 129 / 0)' } },
        'slide-in': { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(0)' } },
      },
      animation: {
        'fade-up': 'fade-up .35s ease-out both',
        'fade-in': 'fade-in .2s ease-out both',
        'pulse-ring': 'pulse-ring 1.6s ease-out infinite',
        'slide-in': 'slide-in .22s ease-out both',
      },
    },
  },
  plugins: [],
};
