/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{vue,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#0b0e11",
        panel: "#12161c",
        panel2: "#161b22",
        border: "#232a33",
        text: "#eaecef",
        muted: "#848e9c",
        up: "#16c784",
        down: "#ea3943",
        accent: "#f0b90b",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
