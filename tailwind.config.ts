import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        panel: "#1a1a1a",
        panelSoft: "#242424",
        border: "#333",
        accent: "#22c55e",
      },
    },
  },
  plugins: [],
};
export default config;
