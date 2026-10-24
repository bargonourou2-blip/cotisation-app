import type { Config } from 'tailwindcss';

/**
 * Palette de la marque.
 * Les couleurs sont définies ici ET dans `src/config/site.ts` (uniquement pour
 * la documentation). Pour changer la charte, modifiez surtout ce fichier.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        marine: {
          50: '#f2f5fb',
          100: '#e3eaf6',
          200: '#c3d2ea',
          300: '#93afd7',
          400: '#5c85bf',
          500: '#3a65a5',
          600: '#2a4e89',
          700: '#223f6f',
          800: '#17305a',
          900: '#0e2248',
          950: '#081631',
        },
        azur: {
          50: '#eff8ff',
          100: '#dbeefe',
          200: '#bfe0fd',
          300: '#92cdfb',
          400: '#5eb1f7',
          500: '#3a91f0',
          600: '#2473e4',
          700: '#1c5dd1',
          800: '#1d4da9',
          900: '#1d4385',
        },
        sable: {
          50: '#fbf8f3',
          100: '#f4eee1',
          200: '#e7dac2',
          300: '#d7c09a',
          400: '#c6a06f',
          500: '#b98953',
          600: '#a87246',
          700: '#8b593b',
          800: '#714936',
          900: '#5d3d2f',
        },
      },
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Manrope Variable', 'Manrope', 'Inter Variable', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        carte: '0 1px 2px rgba(8, 22, 49, 0.04), 0 12px 32px -12px rgba(8, 22, 49, 0.18)',
        'carte-survol': '0 2px 4px rgba(8, 22, 49, 0.05), 0 24px 48px -16px rgba(8, 22, 49, 0.28)',
        anneau: '0 0 0 1px rgba(8, 22, 49, 0.06)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      keyframes: {
        'montee-douce': {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fondu': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'pulse-doux': {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
        'marquee': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
      animation: {
        'montee-douce': 'montee-douce 0.6s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fondu': 'fondu 0.8s ease-out both',
        'pulse-doux': 'pulse-doux 2.4s ease-in-out infinite',
        'marquee': 'marquee 38s linear infinite',
      },
      backgroundImage: {
        'grille-claire':
          'linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)',
      },
      backgroundSize: {
        grille: '48px 48px',
      },
    },
  },
  plugins: [require('@tailwindcss/forms'), require('@tailwindcss/typography')],
};

export default config;
