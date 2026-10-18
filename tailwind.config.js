/** @type {import('tailwindcss').Config} */
// "Blue orchid" theme (2026-10-18): blue to violet accents on cool,
// near-white surfaces with navy text. `orchid` is the brand colour, `mist`
// the surfaces and `ink` the text; the gradients below carry the brand on
// buttons, the sidebar and hero areas. `coral` only stays for the personal
// "Mercan" accent people can pick (lib/kisisellestirme.ts). Animations come
// from the earlier "Hallet" design (2026-08-05).
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        mist: {
          50: '#FCFDFF',
          100: '#F4F6FD',
          200: '#E9EDF9',
          300: '#DCE2F4',
          400: '#C6CEEA',
          500: '#A6B1DA',
        },
        ink: {
          50: '#F3F5FA',
          100: '#E3E7F1',
          200: '#C6CDDE',
          300: '#9CA5BF',
          400: '#6C7694',
          500: '#4B5473',
          600: '#353D5B',
          700: '#232A45',
          800: '#151A2F',
          900: '#0B0E1D',
        },
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
      backgroundImage: {
        // Blue to violet, like a dyed blue orchid: buttons, active pills,
        // my chat bubbles.
        'gradient-orchid': 'linear-gradient(135deg, #2F6BFF 0%, #4A5CF0 48%, #7B5CF5 100%)',
        // Deep version for large areas (sidebar brand panel, hero).
        'gradient-orchid-deep': 'linear-gradient(150deg, #16205A 0%, #2C3AB5 55%, #6A47D8 100%)',
        // Barely tinted, for headers and highlighted cards.
        'gradient-orchid-soft': 'linear-gradient(135deg, #EEF3FF 0%, #F3F0FF 100%)',
      },
      boxShadow: {
        soft: '0 2px 10px -2px rgba(35, 42, 69, 0.08)',
        card: '0 1px 2px rgba(35, 42, 69, 0.04), 0 6px 24px -8px rgba(35, 42, 69, 0.12)',
        float: '0 12px 32px -8px rgba(35, 42, 69, 0.20)',
        glow: '0 0 0 4px rgba(74, 98, 240, 0.15)',
        // Coloured lift under gradient buttons.
        brand: '0 8px 20px -6px rgba(74, 92, 240, 0.45)',
      },
      // Slightly tighter corners than before for a crisper, more
      // professional outline.
      borderRadius: {
        '2xl': '1.125rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-down': 'slideDown 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        shimmer: 'shimmer 1.8s linear infinite',
        'bounce-soft': 'bounceSoft 0.6s ease-out',
        // Sohbet: baloncuk gönderen tarafa göre hafifçe yandan gelsin.
        'bubble-in-left': 'bubbleInLeft 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'bubble-in-right': 'bubbleInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        bounceSoft: {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '60%': { transform: 'scale(1.05)', opacity: '1' },
          '100%': { transform: 'scale(1)' },
        },
        bubbleInLeft: {
          '0%': { opacity: '0', transform: 'translateY(8px) translateX(-10px) scale(0.96)' },
          '100%': { opacity: '1', transform: 'translateY(0) translateX(0) scale(1)' },
        },
        bubbleInRight: {
          '0%': { opacity: '0', transform: 'translateY(8px) translateX(10px) scale(0.96)' },
          '100%': { opacity: '1', transform: 'translateY(0) translateX(0) scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
