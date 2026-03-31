import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#FFFDF9",
        roseOld: "#D4A5A5",
        charcoal: "#333333",
        sidebarRose: "#8E6B6B",
        borderSoft: "rgba(51, 51, 51, 0.08)"
      },
      boxShadow: {
        card: "0 8px 30px rgba(51,51,51,0.06)"
      },
      borderRadius: {
        xl2: "1.25rem"
      }
    }
  },
  plugins: [typography]
};

export default config;

