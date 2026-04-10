/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Zoo SP identity palette
        'zoo-bg':       '#3a4f1e',   // dark olive green background
        'zoo-surface':  '#4a6228',   // medium green for cards
        'zoo-surface2': '#567030',   // lighter card surface
        'zoo-header':   '#2d3f16',   // darkest green for header/nav
        'zoo-orange':   '#e8640e',   // orange accent (logo/badges)
        'zoo-lime':     '#5cb85c',   // bright green CTA buttons
        'zoo-lime-dark':'#449d44',   // hover state for CTA
        active:         '#5cb85c',
        inactive:       '#8a9e6a',
        primary:        '#4a6228',
        'primary-dark': '#2d3f16',
        'primary-light':'#6b8c3a',
        bg:             '#3a4f1e',
        surface:        '#4a6228',
        'text-main':    '#ffffff',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      fontSize: {
        base: ['18px', '1.6'],
        sm:   ['16px', '1.5'],
        lg:   ['22px', '1.4'],
        xl:   ['26px', '1.3'],
        '2xl':['32px', '1.2'],
        '3xl':['40px', '1.1'],
      },
      minHeight: { touch: '48px' },
      minWidth:  { touch: '48px' },
    },
  },
  plugins: [],
}
