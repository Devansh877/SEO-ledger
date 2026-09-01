/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F6F7F5",
        surface: "#FFFFFF",
        ink: "#14181D",
        slate: "#5C6570",
        line: "#DDE1E6",
        teal: "#0F6E63",
        amber: "#C67C2E",
        red: "#B23B3B",
      },
      fontFamily: {
        sans: ["IBM Plex Sans", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
      borderRadius: { DEFAULT: "6px" },
    },
  },
  plugins: [],
};
