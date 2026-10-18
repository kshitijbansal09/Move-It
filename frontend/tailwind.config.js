/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      'pine-900': 'var(--color-pine-900, #16302A)',
      'pine-700': 'var(--color-pine-700, #1F4A3D)',
      'paper': 'var(--color-paper, #EFF1EC)',
      'paper-raised': 'var(--color-paper-raised, #FFFFFF)',
      'marigold': 'var(--color-marigold, #E8A23B)',
      'marigold-dark': 'var(--color-marigold-dark, #C9841F)',
      'indigo-500': 'var(--color-indigo-500, #2B3A67)',
      'rust-alert': 'var(--color-rust-alert, #B94A3C)',
      'success-moss': 'var(--color-success-moss, #4A7A5E)',
      'line-grey': 'var(--color-line-grey, #CBCFC7)',
      'ink-muted': 'var(--color-ink-muted, #5B655F)',
    },
    extend: {
      fontFamily: {
        body: ['"IBM Plex Sans"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        display: ['"Barlow Condensed"', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '4px',
        sm: '2px',
        md: '4px',
        lg: '6px',
      },
      letterSpacing: {
        condensed: '0.01em',
      },
    },
  },
  plugins: [],
};
