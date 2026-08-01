import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Editor chrome — near-black, slightly cool
        chrome: "#0e0f11",       // top bar / deepest surface
        panel: "#141518",        // side panel background
        panelSoft: "#1c1e22",    // inset surfaces (inputs, cards)
        panelHover: "#25272c",   // hover on inset surfaces
        border: "#2a2c30",       // subtle divider
        borderStrong: "#3a3d43", // more visible divider
        // Accent — green primary (Save, active tab, primary buttons)
        accent: "#1DB584",
        accentHover: "#17a074",
        // Secondary highlight — cool cyan (placement crosshair, indicators)
        highlight: "#22d3ee",
      },
      fontSize: {
        // Compact editor typography
        "2xs": ["10px", "14px"],
        "3xs": ["9px", "12px"],
      },
      boxShadow: {
        // Subtle panel shadow like a floating card
        panel: "0 1px 0 rgba(255,255,255,0.02) inset, 0 8px 24px rgba(0,0,0,0.35)",
      },
    },
  },
  plugins: [],
};
export default config;
