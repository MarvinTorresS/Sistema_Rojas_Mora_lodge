import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Configuración de Vite: solo el plugin de React.
// El puerto de desarrollo queda en el 5173 por defecto (no se fija a mano
// para no chocar si alguien del equipo ya tiene otro proceso en ese puerto).
export default defineConfig({
  plugins: [react()],
});
