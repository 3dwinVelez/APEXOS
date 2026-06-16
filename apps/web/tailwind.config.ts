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
        signal: "rgb(var(--color-signal) / <alpha-value>)"
      }
    }
  },
  plugins: []
};

export default config;

