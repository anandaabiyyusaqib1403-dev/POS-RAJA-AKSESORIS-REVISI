/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    screens: {
      sm: '640px',
      md: '768px',
      lg: '1280px',
      xl: '1536px',
      '2xl': '1800px',
    },
    extend: {
      fontFamily: {
        sans: ['Inter', '"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      colors: {
        // Premium White + Gold Theme
        gold: {
          50: '#faf5ed',
          100: '#f5d97a',
          400: '#DDB946',
          500: '#D4AF37',  // Main gold
          600: '#C9A227',  // Hover gold
          700: '#A68334',  // Dark gold
        },
        primary: {
          50: '#faf5ed',
          100: '#f5d97a',
          400: '#DDB946',
          500: '#D4AF37',
          600: '#C9A227',
          700: '#A68334',
        },
        success: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#22C55E',
          600: '#16A34A',
        },
        slate: {
          0: '#FFFFFF',
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          800: '#1E293B',
          900: '#0F172A',
        },
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        'soft': '0 4px 12px rgba(0, 0, 0, 0.15)',
        'medium': '0 8px 25px rgba(0, 0, 0, 0.2)',
        'glow-gold': '0 0 20px rgba(212, 175, 55, 0.4)',
      },
      animation: {
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite alternate',
      },
      keyframes: {
        'glow-pulse': {
          '0%': { boxShadow: '0 0 5px rgba(212, 175, 55, 0.3)' },
          '100%': { boxShadow: '0 0 20px rgba(212, 175, 55, 0.6)' },
        }
      },
    },
  },
  plugins: [],
}

