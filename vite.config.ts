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
  /*
   * De qué ruta cuelga la aplicación.
   *
   * En GitHub Pages cuelga de `/gadmr-chaski/`, que es el nombre del
   * repositorio, y ese es el valor por omisión. En un servidor del municipio
   * puede ir en la raíz o en otra carpeta, y entonces se construye diciéndolo:
   *
   *     set CHASKI_BASE=/ && npm run build            (en la raíz)
   *     set CHASKI_BASE=/chaski/ && npm run build     (en una carpeta)
   *
   * Sin esto, una copia puesta en la raíz de un servidor buscaría sus archivos
   * en `/gadmr-chaski/` y se vería la página en blanco, sin ningún error que
   * explicara por qué.
   */
  base: process.env.CHASKI_BASE || '/gadmr-chaski/',
})
