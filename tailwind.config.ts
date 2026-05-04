/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        warm: {
          bg: "#1a1917",
          surface: "#242220",
          "surface-alt": "#2c2a28",
          primary: "#faf9f6",
          secondary: "#afaeac",
          muted: "#868584",
          btn: "#353534",
        }
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["Geist Mono", "Courier New", "monospace"],
      },
    },
  },
  plugins: [],
};
