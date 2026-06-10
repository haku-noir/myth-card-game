/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        rarity: {
          n: '#6B7280',
          r: '#2563EB',
          sr: '#7C3AED',
          ur: '#D97706',
        },
      },
    },
  },
  plugins: [],
}
