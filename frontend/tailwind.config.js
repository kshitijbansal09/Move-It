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
      'pine-900': '#172e25',
      'pine-700': '#24523d',
      'paper': '#f3f6f0',
      'paper-raised': '#ffffff',
      'marigold': '#f6cb72',
      'marigold-dark': '#835206',
      'indigo-500': '#3b4c83',
      'rust-alert': '#a6372d',
      'success-moss': '#286346',
      'line-grey': '#dbe4da',
      'ink-muted': '#50665a',
    },
    extend: {
      fontFamily: {
        body: ['"DM Sans"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        display: ['"Bricolage Grotesque"', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '10px',
        sm: '6px',
        md: '10px',
        lg: '14px',
      },
      letterSpacing: {
        condensed: '-0.035em',
      },
    },
  },
  plugins: [],
};
