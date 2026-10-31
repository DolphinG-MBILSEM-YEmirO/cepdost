import { readFileSync } from 'node:fs'
import plugin from 'tailwindcss/plugin'

/** @type {import('tailwindcss').Config} */
// Theme "Mercan" from the 2026-10-31 interface redesign: cool neutral
// `mist` surfaces, near-black `ink` text and one coral `brand` accent, the
// same family as Davet. These three come from shared/tasarim.json and
// are served as CSS variables (R G B triplets), so a dark theme only has to
// redefine the variables. `coral` only stays for the personal "Mercan"
// accent people can pick (lib/kisisellestirme.ts).
const tasarim = JSON.parse(readFileSync(new URL('./shared/tasarim.json', import.meta.url), 'utf8'))
const DEGISKENLI_RENKLER = ['mist', 'ink', 'brand']

const rgbUclusu = (hex) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ')

// { ink: { 700: 'rgb(var(--ink-700) / <alpha-value>)', ... }, ... }
const degiskenRenkleri = Object.fromEntries(
  DEGISKENLI_RENKLER.map((ad) => [
    ad,
    Object.fromEntries(Object.keys(tasarim.color[ad]).map((ton) => [ton, `rgb(var(--${ad}-${ton}) / <alpha-value>)`])),
  ]),
)

// :root { --ink-700: 35 42 69; ... }
const kokDegiskenleri = Object.fromEntries(
  DEGISKENLI_RENKLER.flatMap((ad) =>
    Object.entries(tasarim.color[ad]).map(([ton, hex]) => [`--${ad}-${ton}`, rgbUclusu(hex)]),
  ),
)

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // The phone's own typeface (SF Pro on iOS, Roboto on Android, Segoe on
      // Windows): reads as native on every device, needs no download, and
      // matches what the native apps will use.
      fontFamily: {
        sans: tasarim.font.sans,
        display: tasarim.font.sans,
      },
      // Named steps of the type scale (tasarim.json `type`): text-display,
      // text-title, text-headline, text-body, text-callout, text-label,
      // text-caption.
      fontSize: Object.fromEntries(
        Object.entries(tasarim.type).map(([ad, [boyut, satir, agirlik]]) => [
          ad,
          [boyut, { lineHeight: satir, fontWeight: agirlik }],
        ]),
      ),
      colors: {
        ...degiskenRenkleri,
        // The earlier blue, kept only as one of the personal accents people
        // can pick ("Orkide" in lib/kisisellestirme.ts). The interface uses
        // `brand`.
        orchid: {
          50: '#EFF3FF',
          100: '#DFE7FF',
          200: '#C3D1FF',
          300: '#9BB1FD',
          400: '#6F88F9',
          500: '#4A62F0',
          600: '#3549DB',
          700: '#2C3AB5',
          800: '#28338F',
          900: '#222B6B',
        },
        // Only for the personal "Mercan" accent.
        coral: {
          50: '#FFF4F0',
          100: '#FFE3D9',
          500: '#FF5A3C',
          600: '#E83F22',
          700: '#C5331A',
        },
        teal: {
          50: '#EEFBF6',
          100: '#D2F4E8',
          200: '#A6E8D2',
          300: '#6FD6B6',
          400: '#3FBF9A',
          500: '#22A582',
          600: '#168568',
          700: '#136A54',
          800: '#115544',
          900: '#0E3D31',
        },
        amber: {
          50: '#FFF9ED',
          100: '#FFEFCC',
          200: '#FFDC99',
          300: '#FFC866',
          400: '#FFB13D',
          500: '#F59520',
          600: '#D2760F',
          700: '#A8590A',
          800: '#7F4209',
          900: '#5C2F06',
        },
        sky: {
          50: '#EFF9FE',
          100: '#DAF1FD',
          200: '#BCE4FA',
          300: '#8AD0F6',
          400: '#54B5EF',
          500: '#2D97DD',
          600: '#1A78C4',
          700: '#155F9C',
          800: '#154E7E',
          900: '#143F66',
        },
        rose: {
          50: '#FFF1F2',
          100: '#FFE0E3',
          200: '#FFC7CC',
          300: '#FF9DA6',
          400: '#FF6B7A',
          500: '#F23E52',
          600: '#D61F36',
          700: '#B3142A',
          800: '#8E1222',
          900: '#6F111D',
        },
      },
      boxShadow: {
        soft: '0 2px 10px -2px rgba(35, 42, 69, 0.08)',
        // Flat surfaces carry a border instead of a shadow; `card` stays as a
        // hairline lift for the few places that still ask for it.
        card: '0 1px 2px rgba(35, 42, 69, 0.04)',
        float: '0 12px 32px -8px rgba(35, 42, 69, 0.20)',
      },
      // Corners by role (tasarim.json radius): 8 chips, 12 fields and
      // buttons, 16 cards, 24 only for the top of sheets.
      borderRadius: {
        '2xl': tasarim.radius.lg,
        '3xl': tasarim.radius.sheet,
        '4xl': '2rem',
      },
      // Motion rules from the interface plan: short fades and small shifts,
      // no bounces or scaling. Sheets take 280ms, everything else 160ms.
      // The old names stay so components keep working.
      animation: {
        'fade-in': 'fadeIn 160ms ease-out',
        'slide-up': `slideUp ${tasarim.motion.sheet} ${tasarim.motion.easeOut}`,
        'slide-down': `slideDown ${tasarim.motion.sheet} ${tasarim.motion.easeOut}`,
        'scale-in': `fadeIn ${tasarim.motion.change} ease-out`,
        shimmer: 'shimmer 1.6s linear infinite',
        'bounce-soft': `nudgeIn ${tasarim.motion.change} ease-out`,
        'bubble-in-left': `nudgeIn ${tasarim.motion.change} ease-out`,
        'bubble-in-right': `nudgeIn ${tasarim.motion.change} ease-out`,
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        nudgeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({ ':root': kokDegiskenleri })
    }),
  ],
}
