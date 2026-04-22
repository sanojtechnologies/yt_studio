import type { Config } from "tailwindcss";

const config: Config = {
  // Class-based dark mode so the `.dark` flag set by `app/layout.tsx`'s boot
  // script (and toggled by `ThemeToggle` / the command palette) actually
  // drives `dark:` variants. Default `media` mode would lock us to the OS
  // preference and ignore the user's in-app toggle entirely.
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
    },
  },
  plugins: [],
};
export default config;
