import { readFileSync } from 'node:fs'
import plugin from 'tailwindcss/plugin'

/** @type {import('tailwindcss').Config} */
// Theme "Canlı" (2026-10-31): soft lavender-white `mist` surfaces, deep
// violet-black `ink` text, a magenta-pink `brand` and one bright gradient
// per main tab. These come from shared/tasarim.json and are served as CSS
// variables (R G B triplets for colours, --bolum-1/--bolum-2 for the tab
// gradient), so a dark theme only has to redefine the variables. `coral`
// and `orchid` only stay for the personal accents people can pick
// (lib/kisisellestirme.ts).
const tasarim = JSON.parse(readFileSync(new URL('./shared/tasarim.json', import.meta.url), 'utf8'))
const DEGISKENLI_RENKLER = ['mist', 'ink', 'brand']

// The gradient of each main tab, picked by data-bolum on a parent:
// [data-bolum="sohbet"] { --bolum-1: #7C3AED; --bolum-2: #2563EB }
// :root carries the brand gradient so screens outside a tab (sign-in,
// sheets) are coloured too.
const bolumDegiskenleri = {
  ':root': {
    '--bolum-1': tasarim.gradient.brand[0],
    '--bolum-2': tasarim.gradient.brand[1],
    '--bolum-3': tasarim.gradient.brand[2],
  },
  ...Object.fromEntries(
    Object.entries(tasarim.gradient.bolum).map(([ad, [bir, iki]]) => [
      `[data-bolum="${ad}"]`,
      { '--bolum-1': bir, '--bolum-2': iki, '--bolum-3': iki },
    ]),
  ),
}

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
        soft: '0 4px 16px -4px rgba(38, 33, 55, 0.10)',
        card: '0 1px 2px rgba(38, 33, 55, 0.04), 0 6px 20px -8px rgba(38, 33, 55, 0.12)',
        float: '0 16px 40px -10px rgba(38, 33, 55, 0.28)',
        // A coloured glow under gradient buttons, from the tab's colour.
        glow: '0 10px 24px -8px var(--bolum-2)',
      },
      // Corners by role (tasarim.json radius): chips, fields and buttons,
      // cards, and the top of sheets.
      borderRadius: {
        '2xl': tasarim.radius.lg,
        '3xl': tasarim.radius.sheet,
        '4xl': '2rem',
      },
      // Motion (tasarim.json motion): springy entrances, a page change on
      // every tab switch, staggered lists, floating decoration. Everything is
      // cut to a fade for people who ask for reduced motion (index.css).
      animation: {
        'fade-in': `fadeIn ${tasarim.motion.change} ease-out`,
        'slide-up': `slideUp ${tasarim.motion.sheet} ${tasarim.motion.spring}`,
        'slide-down': `slideDown ${tasarim.motion.sheet} ${tasarim.motion.spring}`,
        'scale-in': `popIn ${tasarim.motion.sheet} ${tasarim.motion.spring}`,
        'pop-in': `popIn ${tasarim.motion.sheet} ${tasarim.motion.spring}`,
        sayfa: `sayfaGir ${tasarim.motion.page} ${tasarim.motion.easeOut}`,
        shimmer: 'shimmer 1.6s linear infinite',
        'bounce-soft': `popIn ${tasarim.motion.sheet} ${tasarim.motion.spring}`,
        'bubble-in-left': `balonSol ${tasarim.motion.sheet} ${tasarim.motion.spring}`,
        'bubble-in-right': `balonSag ${tasarim.motion.sheet} ${tasarim.motion.spring}`,
        yuzen: 'yuzen 6s ease-in-out infinite',
        'yuzen-yavas': 'yuzen 9s ease-in-out infinite reverse',
        nabiz: 'nabiz 2.4s ease-out infinite',
        'gradyan-akis': 'gradyanAkis 8s ease infinite',
        sallan: `sallan 500ms ${tasarim.motion.easeOut}`,
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        popIn: {
          '0%': { opacity: '0', transform: 'scale(0.85)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        sayfaGir: {
          '0%': { opacity: '0', transform: 'translateY(14px) scale(0.985)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        balonSol: {
          '0%': { opacity: '0', transform: 'translateX(-10px) scale(0.92)' },
          '100%': { opacity: '1', transform: 'translateX(0) scale(1)' },
        },
        balonSag: {
          '0%': { opacity: '0', transform: 'translateX(10px) scale(0.92)' },
          '100%': { opacity: '1', transform: 'translateX(0) scale(1)' },
        },
        yuzen: {
          '0%, 100%': { transform: 'translate(0, 0) rotate(0deg)' },
          '50%': { transform: 'translate(6px, -10px) rotate(6deg)' },
        },
        nabiz: {
          '0%': { boxShadow: '0 0 0 0 color-mix(in srgb, var(--bolum-2) 55%, transparent)' },
          '70%, 100%': { boxShadow: '0 0 0 14px transparent' },
        },
        gradyanAkis: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        sallan: {
          '0%, 100%': { transform: 'rotate(0)' },
          '25%': { transform: 'rotate(-12deg)' },
          '75%': { transform: 'rotate(12deg)' },
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
      addBase(bolumDegiskenleri)
    }),
  ],
}
