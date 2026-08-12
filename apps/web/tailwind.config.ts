import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        paper: "rgb(var(--color-paper) / <alpha-value>)",
        line: "rgb(var(--color-line) / <alpha-value>)",
        apex: "rgb(var(--color-apex) / <alpha-value>)",
        signal: "rgb(var(--color-signal) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-soft": "rgb(var(--surface-soft) / <alpha-value>)",
        "surface-muted": "rgb(var(--surface-muted) / <alpha-value>)",
        "content-strong": "rgb(var(--text-strong) / <alpha-value>)",
        "content-body": "rgb(var(--text-body) / <alpha-value>)",
        "content-muted": "rgb(var(--text-muted) / <alpha-value>)"
      }
    }
  },
  plugins: []
};

export default config;

