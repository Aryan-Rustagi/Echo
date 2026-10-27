/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        void: {
          950: '#060606',
          900: '#0A0A0A',
          800: '#121212',
          700: '#181818',
          600: '#222222',
        },
        cinema: {
          orange: '#FF6B00',
          amber: '#FFA500',
          glow: 'rgba(255, 107, 0, 0.15)',
        },
        paper: {
          light: '#F5F5F0',
          warm: '#E5D9C5',
          muted: '#8A8A85',
          subtle: '#4A4A46',
        },
      },
      fontFamily: {
        sans: ['Geist', 'Inter', 'Satoshi', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Geist Mono', 'monospace'],
      },
      boxShadow: {
        'glass-edge': 'inset 0 1px 1px 0 rgba(255, 255, 255, 0.08)',
        'orange-glow': '0 0 45px -10px rgba(255, 107, 0, 0.22)',
        'orange-halo': '0 0 100px -20px rgba(255, 107, 0, 0.18)',
      },
      backgroundImage: {
        'noise-pattern': "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.035'/%3E%3C/svg%3E\")",
      },
    },
  },
  plugins: [],
};
