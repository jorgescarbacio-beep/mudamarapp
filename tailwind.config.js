/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", // Esto le dice a Tailwind que lea TODOS tus componentes de React
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}