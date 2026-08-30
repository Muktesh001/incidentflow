/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        severity: {
          critical: "#dc2626",
          high: "#ea580c",
          medium: "#d97706",
          low: "#16a34a"
        },
        status: {
          open: "#ef4444",
          investigating: "#f59e0b",
          mitigated: "#3b82f6",
          resolved: "#10b981",
          closed: "#6b7280"
        }
      }
    }
  },
  plugins: []
};
