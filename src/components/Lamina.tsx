/**
 * La lámina: el informe y el mapa puestos en una hoja que se puede imprimir.
 *
 * Un análisis que solo existe en la pantalla no entra en un expediente. Esto
 * arma una hoja A4 apaisada con el mapa tal como se está viendo, su escala,
 * el norte, la leyenda y las cifras del diagnóstico, y la manda a imprimir.
 * Desde el diálogo del navegador se guarda como PDF, que es lo que de verdad
 * se adjunta a un oficio.
 *
 * **La hoja lleva sus colores escritos a mano, no los del sistema.** Los
 * tokens cambian con el tema del equipo, y una lámina que sale con fondo negro
 * porque quien la imprimió tenía el modo oscuro gasta un cartucho y no se lee.
 * Aquí el papel siempre es blanco.
 */
import type { Captura } from './Mapa'
import type { Capa } from '../lib/cargar'
import type { Informe } from '../lib/diagnostico'
import { numero } from '../lib/format'

interface Props {
  informe: Informe
  captura: Captura | null
  /** La capa del resultado, para sacar su leyenda. */
  capa: Capa | null
  fuente: string
  onCerrar: () => void
}

/** Un corte de la leyenda como se lee. */
function tramos(cortes: number[]): string[] {
  const cifra = (n: number) =>
    n.toLocaleString('es-EC', {
      maximumFractionDigits: Math.abs(n) >= 100 ? 0 : Math.abs(n) >= 1 ? 1 : 3,
    })
  if (cortes.length === 0) return ['Todas las piezas']
  const salida = [`hasta ${cifra(cortes[0])}`]
  for (let i = 1; i < cortes.length; i++) salida.push(`${cifra(cortes[i - 1])} a ${cifra(cortes[i])}`)
  salida.push(`más de ${cifra(cortes[cortes.length - 1])}`)
  return salida
}

export default function Lamina({ informe, captura, capa, fuente, onCerrar }: Props) {
  const leyenda = capa?.tema
  return (
    <div className="lamina-fondo">
      <div className="lamina-barra">
        <button type="button" onClick={() => window.print()} className="lamina-boton">
          Imprimir o guardar en PDF
        </button>
        <button type="button" onClick={onCerrar} className="lamina-boton lamina-boton-suave">
          Cerrar
        </button>
        <span className="lamina-pista">
          En el diálogo de impresión, elige «Guardar como PDF» y papel A4 horizontal.
        </span>
      </div>

      <div className="lamina">
        <header className="lamina-cabecera">
          <div>
            <h1>{informe.titulo}</h1>
            <p>{informe.subtitulo}</p>
          </div>
          <div className="lamina-sello">
            <strong>GADM Riobamba</strong>
            <span>CHASKI</span>
            <span>{informe.generado}</span>
          </div>
        </header>

        <div className="lamina-cuerpo">
          <section className="lamina-mapa">
            {captura ? (
              <>
                <img src={captura.imagen} alt="Mapa del análisis" />
                <div className="lamina-pie-mapa">
                  <div className="lamina-escala">
                    <span
                      className="lamina-escala-barra"
                      style={{
                        width: `${Math.max(30, (captura.escalaPx / captura.ancho) * 100 * 4)}px`,
                      }}
                    />
                    <span>
                      {captura.escalaM >= 1000
                        ? `${numero(captura.escalaM / 1000)} km`
                        : `${numero(captura.escalaM)} m`}
                    </span>
                  </div>
                  <div
                    className="lamina-norte"
                    style={{ transform: `rotate(${-captura.rumbo}deg)` }}
                    aria-label="Norte"
                  >
                    <svg viewBox="0 0 24 24" width="26" height="26">
                      <path d="M12 2 L16 20 L12 16 L8 20 Z" fill="#1b2a38" />
                    </svg>
                    <span>N</span>
                  </div>
                </div>
              </>
            ) : (
              <p className="lamina-sin-mapa">
                El mapa salió en blanco y no se incluyó. Pasa cuando la ventana está
                minimizada o detrás de otra: el navegador deja de dibujar y no hay nada que
                leer. Deja esta ventana a la vista, cierra la lámina y vuelve a abrirla. Las
                cifras de la derecha son correctas en cualquier caso.
              </p>
            )}

            {leyenda && (
              <div className="lamina-leyenda">
                <strong>{capa?.nombre}</strong>
                <ul>
                  {leyenda.coincidencias
                    ? leyenda.coincidencias.map((m) => (
                        <li key={m.valor}>
                          <span style={{ backgroundColor: m.color }} />
                          {m.rotulo}
                        </li>
                      ))
                    : tramos(leyenda.cortes ?? []).map((t, i) => (
                        <li key={t}>
                          <span style={{ backgroundColor: (leyenda.colores ?? [])[i] }} />
                          {(leyenda.cortes ?? []).length === 0 ? t : `${t} ${leyenda.unidad}`}
                        </li>
                      ))}
                </ul>
              </div>
            )}
          </section>

          <section className="lamina-cifras">
            {informe.secciones.map((s) => (
              <div key={s.titulo} className="lamina-bloque">
                <h2>{s.titulo}</h2>
                <table>
                  <tbody>
                    {s.filas.map((f) => (
                      <tr key={f.etiqueta}>
                        <th>{f.etiqueta}</th>
                        <td>{f.valor}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {s.lectura && <p className="lamina-lectura">{s.lectura}</p>}
              </div>
            ))}
          </section>
        </div>

        {informe.avisos.length > 0 && (
          <div className="lamina-avisos">
            {informe.avisos.map((a) => (
              <p key={a}>⚠ {a}</p>
            ))}
          </div>
        )}

        <footer className="lamina-pie">
          <span>{fuente}</span>
          <span>
            Mapa base: Esri, HERE, Garmin y © OpenStreetMap. Medidas sobre el elipsoide
            WGS84. Las distancias son en línea recta, no por la vía.
          </span>
        </footer>
      </div>
    </div>
  )
}
