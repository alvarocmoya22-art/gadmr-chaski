import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  /*
   * Puerto propio y fijo.
   *
   * El visor de territorio corre en el 5183 y no se toca: si Vite eligiera
   * puerto libre, un arranque de CHASKI podría quedarse con el del visor y
   * dejar a quien lo tenga abierto mirando otra aplicación. Con `strictPort`,
   * si el 5184 está ocupado falla y lo dice, en vez de moverse en silencio.
   */
  server: { port: 5184, strictPort: true },
  /* Ruta del repositorio en GitHub Pages; en desarrollo Vite ignora esto. */
  base: '/gadmr-chaski/',
})
