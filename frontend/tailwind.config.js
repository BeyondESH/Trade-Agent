/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#0b0e11",
        panel: "#12161c",
        panel2: "#161b22",
        border: "#232a33",
        borderSoft: "#1c2129",
        text: "#eaecef",
        muted: "#9aa7b8",
        up: "#16c784",
        down: "#ea3943",
        accent: "#f0b90b",
        hover: "#1b2029",
        active: "#212733",
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "PingFang SC",
          "Microsoft YaHei",
          "Noto Sans SC",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      borderRadius: {
        panel: "12px",
        btn: "8px",
        chip: "6px",
      },
      boxShadow: {
        panel: "0 2px 12px rgba(0,0,0,0.35)",
        float: "0 4px 20px rgba(0,0,0,0.45)",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
    },
  },
  plugins: [],
};
