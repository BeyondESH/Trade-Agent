/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "var(--tv-bg)",
        panel: "var(--tv-panel)",
        panel2: "var(--tv-panel2)",
        border: "var(--tv-border)",
        borderSoft: "var(--tv-borderSoft)",
        text: "var(--tv-text)",
        muted: "var(--tv-muted)",
        up: "var(--tv-up)",
        down: "var(--tv-down)",
        accent: "var(--tv-accent)",
        hover: "var(--tv-hover)",
        active: "var(--tv-active)",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "'Trebuchet MS'",
          "Roboto",
          "Ubuntu",
          "PingFang SC",
          "Microsoft YaHei",
          "Noto Sans SC",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      fontSize: {
        "11": ["11px", "1.3"],
        "12": ["12px", "1.3"],
        "13": ["13px", "1.3"],
      },
      borderRadius: {
        btn: "4px",
        float: "6px",
        modal: "8px",
        chip: "4px",
      },
      boxShadow: {
        float: "var(--tv-shadow)",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
    },
  },
  plugins: [],
};
