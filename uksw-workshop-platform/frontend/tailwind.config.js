/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                // K2I UKSW Blue Theme
                primary: '#0066B3',
                'primary-hover': '#0052A3',
                'primary-light': '#E8F1FA',
                'primary-mid': '#3385C3',
                // Backgrounds — clean white/off-white
                'background-dark': '#F0F6FC',
                'surface-dark': '#FFFFFF',
                'card-dark': '#FFFFFF',
                // Borders — light blue-grey
                'border-dark': '#C5D8ED',
                'accent-dark': '#D6E8F5',
                // Text
                'text-muted': '#4A6E8F',
                // Accent from logo
                'k2i-orange': '#F47920',
                'k2i-red': '#CC0000',
            },
            fontFamily: {
                display: ['Lexend', 'sans-serif'],
                body: ['Noto Sans', 'sans-serif'],
            },
            borderRadius: {
                DEFAULT: '0.25rem',
                lg: '0.5rem',
                xl: '0.75rem',
                '2xl': '1rem',
                full: '9999px',
            },
            animation: {
                'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'fade-in-up': 'fadeInUp 0.5s ease-out forwards',
                'shimmer': 'shimmer 2s infinite',
            },
            keyframes: {
                fadeInUp: {
                    '0%': { opacity: '0', transform: 'translateY(20px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                shimmer: {
                    '100%': { transform: 'translateX(100%)' },
                },
            },
        },
    },
    plugins: [],
}

