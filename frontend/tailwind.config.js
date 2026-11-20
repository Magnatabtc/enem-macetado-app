/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#08080B',
        surface: '#111116',
        raised: '#16161D',
        lime: {
          DEFAULT: '#C8FF4D',
          soft: '#DCFF94',
          deep: '#A6E62E',
        },
        violet: {
          DEFAULT: '#8B5CF6',
          soft: '#BBA6FF',
        },
        success: '#34D399',
        danger: '#FB7185',
      },
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Sora Variable', 'Sora', 'Inter Variable', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '32px',
        '5xl': '40px',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(200,255,77,.25), 0 18px 60px -20px rgba(200,255,77,.35)',
        lift: '0 30px 80px -30px rgba(0,0,0,.9)',
        sheet: '0 -24px 80px -20px rgba(0,0,0,.85)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '.45' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(.9)', opacity: '.55' },
          '70%': { transform: 'scale(1.35)', opacity: '0' },
          '100%': { transform: 'scale(1.35)', opacity: '0' },
        },
        'timer-alert': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.12)' },
        },
        wave: {
          '0%, 100%': { transform: 'scaleY(.25)' },
          '50%': { transform: 'scaleY(1)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        shimmer: {
          from: { backgroundPosition: '200% 0' },
          to: { backgroundPosition: '-200% 0' },
        },
        'bounce-soft': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
      },
      animation: {
        'fade-up': 'fade-up .45s cubic-bezier(.22,1,.36,1) both',
        'fade-in': 'fade-in .35s ease both',
        'slide-up': 'slide-up .38s cubic-bezier(.22,1,.36,1) both',
        'pulse-soft': 'pulse-soft 2.2s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(.22,1,.36,1) infinite',
        'timer-alert': 'timer-alert 1s ease-in-out infinite',
        wave: 'wave .9s ease-in-out infinite',
        float: 'float 5s ease-in-out infinite',
        shimmer: 'shimmer 2.4s linear infinite',
        'bounce-soft': 'bounce-soft 1.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
