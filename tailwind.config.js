/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.tsx',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        bike: {
          bg: '#101010',
          card: '#1c1c1c',
          border: '#2a221c',
          'border-orange': '#4a3020',
          orange: '#ff6600',
          'orange-bright': '#fe5a24',
          'orange-muted': '#cc7733',
          'orange-dim': '#8b5a2b',
          text: '#e8e0d8',
          'text-muted': '#8b7355',
          'text-dim': '#6b5344',
        },
      },
    },
  },
  plugins: [],
};
