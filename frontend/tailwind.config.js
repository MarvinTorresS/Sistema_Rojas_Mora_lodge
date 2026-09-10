/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Paleta extraída de Prototipo_Rojas_Mora_3_opciones.html (Opción 3,
      // la elegida por el equipo). Se define acá como tokens de Tailwind
      // en vez de dejarla suelta en cada componente, para que los 4
      // usemos siempre los mismos nombres de color y no cada quien
      // invente su propio verde o ámbar a ojo.
      colors: {
        // Verde principal (marca, botones primarios, estado "activo")
        primary: {
          900: '#173404',
          800: '#27500A',
          700: '#3B6D11',
          600: '#639922',
          400: '#97C459',
          200: '#C0DD97',
          50: '#EAF3DE',
        },
        // Ámbar (alertas suaves, pendientes de aprobación)
        amber: {
          600: '#854F0B',
          400: '#BA7517',
          50: '#FAEEDA',
        },
        // Teal (pagos, verificaciones)
        teal: {
          600: '#0F6E56',
          400: '#1D9E75',
          50: '#E1F5EE',
        },
        // Coral (vencimientos, salidas, alertas de mayor atención)
        coral: {
          600: '#993C1D',
          400: '#D85A30',
          50: '#FAECE7',
        },
        // Fondo y texto base
        surface: '#FAFAF8',
        'surface-alt': '#EDEBE4',
        ink: '#2C2C2A',
        muted: '#5F5E5A',
        faint: '#8A8880',
        line: '#E4E3DD',
      },
      fontFamily: {
        // Playfair Display para títulos (marca, encabezados grandes)
        display: ['"Playfair Display"', 'serif'],
        // DM Sans para todo el resto del texto
        sans: ['"DM Sans"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(44,44,42,.05), 0 6px 20px rgba(44,44,42,.06)',
      },
    },
  },
  plugins: [],
};
