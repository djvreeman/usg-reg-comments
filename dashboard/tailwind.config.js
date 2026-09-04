/** @type {import('tailwindcss').Config} */

// HL7 International brand palette (style guide). Analog magentas/violets
// (#e80cdc, #890dff) are omitted — reserved for special-event materials.
const hl7Blue = {
  50: '#eef6fa',
  100: '#d4e8f1',
  200: '#a9d0e3',
  300: '#5f9baf',
  400: '#3a7fa0',
  500: '#1a6b96',
  600: '#005a8c',
  700: '#004670',
  800: '#002a50',
  900: '#001140',
  950: '#000a28',
}

const hl7Green = {
  50: '#e8f6ee',
  100: '#c5e9d4',
  200: '#8ed4ab',
  300: '#4fb87d',
  400: '#1fa05c',
  500: '#0f8e48',
  600: '#0f8e48',
  700: '#0b7039',
  800: '#08552b',
  900: '#053d1f',
  950: '#032616',
}

const hl7Orange = {
  50: '#fef4eb',
  100: '#fde4cc',
  200: '#fbc499',
  300: '#f5a05c',
  400: '#ea7125',
  500: '#ea7125',
  600: '#d4621c',
  700: '#b04e14',
  800: '#8a3c10',
  900: '#5c270a',
  950: '#3d1a06',
}

const hl7Red = {
  50: '#fdecec',
  100: '#f9c9ca',
  200: '#f06a6e',
  300: '#f04a50',
  400: '#ee3238',
  500: '#ec2227',
  600: '#ba1a1f',
  700: '#6e0f12',
  800: '#6e3032',
  900: '#3d0a0c',
  950: '#240607',
}

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['HCo Gotham', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      colors: {
        purple: hl7Blue,
        violet: hl7Blue,
        indigo: hl7Blue,
        fuchsia: hl7Blue,
        blue: hl7Blue,
        sky: hl7Blue,
        cyan: {
          50: '#eef6fa',
          100: '#d4e8f1',
          200: '#a9d0e3',
          300: '#5f9baf',
          400: '#5f9baf',
          500: '#5f9baf',
          600: '#005a8c',
          700: '#29434D',
          800: '#29434D',
          900: '#001140',
          950: '#001140',
        },
        green: hl7Green,
        emerald: hl7Green,
        orange: hl7Orange,
        amber: {
          50: '#fff8e6',
          100: '#ffecb3',
          200: '#ffcc32',
          300: '#ffcc32',
          400: '#bf9926',
          500: '#bf9926',
          600: '#bf9926',
          700: '#8a6e1a',
          800: '#5c4a12',
          900: '#3d310c',
          950: '#241c07',
        },
        red: hl7Red,
        rose: hl7Red,
        hl7: {
          red: '#ec2227',
          black: '#010101',
          orange: '#ea7125',
          yellow: '#ffcc32',
          chartreuse: '#bdc635',
          'light-blue': '#5f9baf',
          blue: '#005a8c',
          'light-gray': '#babcbe',
          'yellow-dk': '#bf9926',
          green: '#0f8e48',
          'aqua-dk': '#29434D',
          'blue-dk': '#001140',
          'dark-gray': '#747679',
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography')
  ],
}
