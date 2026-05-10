import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#14161A",
        paper: "#F7F5EF",
        line: "#D9D4C8",
        apex: "#146C63",
        signal: "#C05621"
      }
    }
  },
  plugins: []
};

export default config;

