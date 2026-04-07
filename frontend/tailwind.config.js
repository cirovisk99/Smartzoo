/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        active: '#4CAF50',
        inactive: '#9E9E9E',
        primary: '#2E7D32',
        'primary-dark': '#1B5E20',
        'primary-light': '#4CAF50',
        bg: '#F5F5F5',
        surface: '#FFFFFF',
        'text-main': '#212121',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      fontSize: {
        base: ['18px', '1.6'],
        sm: ['16px', '1.5'],
        lg: ['22px', '1.4'],
        xl: ['26px', '1.3'],
        '2xl': ['32px', '1.2'],
        '3xl': ['40px', '1.1'],
      },
      minHeight: {
        touch: '48px',
      },
      minWidth: {
        touch: '48px',
      },
    },
  },
  plugins: [],
}
