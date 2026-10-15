/**
 * CHASKI · analizador de capas del GADM Riobamba.
 *
 * El visor de territorio responde preguntas que ya estaban planteadas: sus
 * capas se preparan con scripts que alguien corre desde su máquina, y para
 * añadir una pregunta nueva hay que tocar el código. Esto es lo contrario:
 * entra la capa que sea y el análisis se corre encima en el momento.
 *
 * Tres puertas a lo mismo. **Preguntas** rellena por dentro la herramienta que
 * toca, y es lo que de verdad separa esto de GOAT, cuya caja está escrita para
 * quien ya sabe SIG. **Herramientas** es esa caja entera. **Informe** corre
 * media docena de análisis seguidos y deja el diagnóstico escrito y una lámina
 * para imprimir, que es lo que pide una dirección cuando termina una campaña.
 *
 * Todo pasa en el navegador. No hay servidor que mantener ni datos que viajen
 * a ningún sitio, que para información municipal sin publicar es la única
 * respuesta aceptable mientras no haya una base institucional detrás.
 *
 * El nombre es el chaski, el mensajero que corría los caminos del
 * Tahuantinsuyo llevando información de un tambo al siguiente.
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import Mapa, { type Captura } from './components/Mapa'
import PanelCapas from './components/PanelCapas'
import PanelAnalisis from './components/PanelAnalisis'
import PanelGuiado from './components/PanelGuiado'
import PanelInforme, { INFORME_INICIAL, type AjustesInforme } from './components/PanelInforme'
import Lamina from './components/Lamina'
import { leerArchivo, type Capa } from './lib/cargar'
import { cajaDeCapa, piezasDe, puntosDe, recuadroDe, type PuntoAnalisis } from './lib/ambito'
import { HERRAMIENTAS, herramientasPara, type Herramienta } from './lib/herramientas'
import { diagnosticar, type Informe } from './lib/diagnostico'
import { ENTRADA, RECETAS } from './lib/recetas'
import { FUENTE_EJEMPLO, cargarEjemplo } from './lib/ejemplo'
import { FUENTE_MUNICIPIO, traerVarias, type CapaMunicipal } from './lib/municipio'
import { TODA_LA_CATEGORIA } from './lib/hotspot'
import { MAPA_BASE_INICIAL } from './config/mapasBase'
import { numero } from './lib/format'

/** Lo que hay que dibujar del último cálculo, además de su capa. */
interface Ultimo {
  puntos: PuntoAnalisis[]
  ambito: GeoJSON.FeatureCollection | null
  capaId: string
}

type Modo = 'guiado' | 'herramientas' | 'informe'

export default function App() {
  const [capas, setCapas] = useState<Capa[]>([])
  const [cargando, setCargando] = useState(false)
  const [recados, setRecados] = useState<{ texto: string; mal: boolean }[]>([])
  const [modo, setModo] = useState<Modo>('guiado')

  // Modo guiado
  const [recetaClave, setRecetaClave] = useState<string | null>(null)
  const [valoresGuiado, setValoresGuiado] = useState<Record<string, string>>({})

  // Modo herramientas
  const [capaId, setCapaId] = useState<string | null>(null)
  const [herramientaClave, setHerramientaClave] = useState<string | null>(null)
  const [valores, setValores] = useState<Record<string, string>>({})

  // Informe
  const [ajustesInforme, setAjustesInforme] = useState<AjustesInforme>(INFORME_INICIAL)
  const [informe, setInforme] = useState<Informe | null>(null)
  const [capaInforme, setCapaInforme] = useState<string | null>(null)
  const [laminaAbierta, setLaminaAbierta] = useState(false)
  const [captura, setCaptura] = useState<Captura | null>(null)

  const [ultimo, setUltimo] = useState<Ultimo | null>(null)
  const [calculando, setCalculando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mapaBase, setMapaBase] = useState(MAPA_BASE_INICIAL)
  const [encuadre, setEncuadre] = useState<[number, number, number, number] | null>(null)
  const capturaRef = useRef<(() => Promise<Captura | null>) | null>(null)

  const capa = capas.find((c) => c.id === capaId) ?? null
  const herramienta = HERRAMIENTAS.find((h) => h.clave === herramientaClave) ?? null
  const receta = RECETAS.find((r) => r.clave === recetaClave) ?? null

  /** Lo que cada control vale al empezar: la primera opción, o nada. */
  const arranque = useCallback((clave: string | null) => {
    const h = HERRAMIENTAS.find((x) => x.clave === clave)
    const base: Record<string, string> = {}
    for (const p of h?.parametros ?? []) {
      if (p.tipo === 'opcion') base[p.clave] = p.defecto ?? p.opciones[0].valor
      else if (p.tipo === 'numero') base[p.clave] = String(p.defecto)
      else if (p.tipo === 'valor') base[p.clave] = TODA_LA_CATEGORIA
      else base[p.clave] = ''
    }
    return base
  }, [])

  const elegirHerramienta = useCallback(
    (clave: string) => {
      setHerramientaClave(clave)
      setValores(arranque(clave))
      setError(null)
    },
    [arranque],
  )

  /** Al cambiar de capa, la herramienta elegida puede dejar de valer. */
  const elegirCapa = useCallback(
    (id: string) => {
      setCapaId(id || null)
      const nueva = capas.find((c) => c.id === id) ?? null
      const sirven = herramientasPara(nueva)
      const sigue = sirven.find((h) => h.clave === herramientaClave)
      const elegida = sigue?.clave ?? sirven[0]?.clave ?? null
      setHerramientaClave(elegida)
      setValores(arranque(elegida))
      setError(null)
    },
    [capas, herramientaClave, arranque],
  )

  const elegirReceta = useCallback((clave: string) => {
    setRecetaClave((previa) => (previa === clave ? null : clave))
    /*
     * Los huecos con valor por omisión arrancan con él puesto.
     *
     * Si no, el hueco enseña «500» y el cálculo usa el valor por omisión de la
     * herramienta, que puede ser otro: se lee una cifra en pantalla y sale otra
     * en el resultado. Es el peor fallo posible en algo que va a un informe, y
     * no avisa de nada: simplemente da un número equivocado.
     */
    const elegida = RECETAS.find((r) => r.clave === clave)
    const base: Record<string, string> = {}
    for (const parte of elegida?.frase ?? []) {
      if (typeof parte !== 'string' && parte.defecto) base[parte.clave] = parte.defecto
    }
    setValoresGuiado(base)
    setError(null)
  }, [])

  /** Mete capas nuevas en la lista y deja el mapa mirándolas. */
  const recibir = useCallback(
    (nuevas: Capa[]) => {
      if (nuevas.length === 0) return
      setCapas((previas) => [...previas, ...nuevas])
      const caja = cajaDeCapa(nuevas[0])
      if (caja) setEncuadre(caja)
      if (!capaId) {
        setCapaId(nuevas[0].id)
        const primera = herramientasPara(nuevas[0])[0]?.clave ?? null
        setHerramientaClave(primera)
        setValores(arranque(primera))
      }
    },
    [capaId, arranque],
  )

  const leer = useCallback(
    async (archivos: FileList | File[]) => {
      setCargando(true)
      const nuevos: { texto: string; mal: boolean }[] = []
      const nuevas: Capa[] = []
      for (const archivo of Array.from(archivos)) {
        try {
          const { capa: leida, aviso } = await leerArchivo(archivo)
          nuevas.push(leida)
          nuevos.push({
            texto: `${leida.nombre}: ${numero(leida.geo.features.length)} registros.`,
            mal: false,
          })
          if (aviso) nuevos.push({ texto: aviso, mal: false })
        } catch (e) {
          nuevos.push({
            texto: `${archivo.name}: ${e instanceof Error ? e.message : 'no se pudo leer.'}`,
            mal: true,
          })
        }
      }
      recibir(nuevas)
      setRecados(nuevos)
      setCargando(false)
    },
    [recibir],
  )

  const ejemplo = useCallback(async () => {
    setCargando(true)
    const { capas: nuevas, fallos } = await cargarEjemplo()
    recibir(nuevas)
    setRecados([
      ...(nuevas.length
        ? [{ texto: `${FUENTE_EJEMPLO} Ya puedes elegir una pregunta.`, mal: false }]
        : []),
      ...fallos.map((f) => ({ texto: f, mal: true })),
    ])
    setCargando(false)
  }, [recibir])

  const municipio = useCallback(
    async (entradas: CapaMunicipal[]) => {
      setCargando(true)
      const { capas: nuevas, fallos } = await traerVarias(entradas)
      recibir(nuevas)
      setRecados([
        ...(nuevas.length
          ? [
              {
                texto: `${nuevas.map((c) => c.nombre).join(', ')}. ${FUENTE_MUNICIPIO}`,
                mal: false,
              },
            ]
          : []),
        ...fallos.map((f) => ({ texto: f, mal: true })),
      ])
      setCargando(false)
    },
    [recibir],
  )

  /**
   * Corre una herramienta y mete el resultado en la lista de capas.
   *
   * Es el único camino: las preguntas y la caja de herramientas acaban las dos
   * aquí, con la misma capa, la misma herramienta y los mismos valores.
   */
  const ejecutar = useCallback(
    (laCapa: Capa, laHerramienta: Herramienta, losValores: Record<string, string>) => {
      setCalculando(true)
      setError(null)
      /*
       * Un cuadro de espera antes de calcular. Los cálculos son sincrónicos y
       * con una rejilla fina pueden tardar un par de segundos; sin esta pausa
       * el navegador no llega a pintar el «Calculando…» y la pantalla se queda
       * congelada sin explicar por qué.
       */
      setTimeout(() => {
        const salida = laHerramienta.correr({ capa: laCapa, valores: losValores, capas })
        if ('error' in salida) {
          setError(salida.error)
          setCalculando(false)
          return
        }
        setCapas((previas) => [salida.capa, ...previas])
        setUltimo({
          puntos: salida.puntos ?? [],
          ambito: salida.ambito ?? null,
          capaId: salida.capa.id,
        })
        setRecados(salida.aviso ? [{ texto: salida.aviso, mal: false }] : [])
        setCalculando(false)
      }, 30)
    },
    [capas],
  )

  const correrHerramienta = useCallback(() => {
    if (!capa || !herramienta) return
    ejecutar(capa, herramienta, valores)
  }, [capa, herramienta, valores, ejecutar])

  const correrReceta = useCallback(() => {
    if (!receta) return
    const entrada = capas.find((c) => c.id === valoresGuiado[ENTRADA])
    if (!entrada) {
      setError('Elige la capa que falta en la frase.')
      return
    }
    const h = HERRAMIENTAS.find((x) => x.clave === receta.herramienta)
    if (!h) {
      setError('Esa pregunta todavía no tiene herramienta detrás.')
      return
    }
    const { [ENTRADA]: _entrada, ...resto } = valoresGuiado
    void _entrada
    ejecutar(entrada, h, { ...arranque(h.clave), ...(receta.fijos ?? {}), ...resto })
  }, [receta, valoresGuiado, capas, ejecutar, arranque])

  /**
   * El informe: el diagnóstico escrito y las dos capas que lo ilustran.
   *
   * El reparto por zona y los puntos calientes se corren con las mismas
   * herramientas de la caja, no con una copia: así el mapa de la lámina y las
   * cifras del informe no pueden contradecirse.
   */
  const correrInforme = useCallback(() => {
    const reg = capas.find((c) => c.id === ajustesInforme.registros)
    if (!reg) return
    setCalculando(true)
    setError(null)
    setTimeout(() => {
      const campo = ajustesInforme.campo || null
      const puntos = puntosDe(reg, campo)
      if (puntos.length === 0) {
        setError('Esa capa no tiene registros que se puedan ubicar.')
        setCalculando(false)
        return
      }
      const capaAmbito = capas.find((c) => c.id === ajustesInforme.ambito) ?? null
      const piezas = capaAmbito ? piezasDe(capaAmbito) : recuadroDe(puntos)
      if (piezas.length === 0) {
        setError(`«${capaAmbito?.nombre}» no trae polígonos para hacer de límite.`)
        setCalculando(false)
        return
      }
      const capaZonas = capas.find((c) => c.id === ajustesInforme.zonas) ?? null

      const nuevas: Capa[] = []
      let capaPrincipal: string | null = null

      if (capaZonas) {
        const h = HERRAMIENTAS.find((x) => x.clave === 'agregar-puntos')!
        const r = h.correr({
          capa: reg,
          capas,
          valores: {
            ...arranque('agregar-puntos'),
            zonas: capaZonas.id,
            estadistico: 'cuenta',
            campo: campo ?? '',
            valor: TODA_LA_CATEGORIA,
          },
        })
        if (!('error' in r)) {
          nuevas.push(r.capa)
          capaPrincipal = r.capa.id
        }
      }

      const hs = HERRAMIENTAS.find((x) => x.clave === 'hotspot')!
      const rh = hs.correr({
        capa: reg,
        capas,
        valores: {
          ...arranque('hotspot'),
          campo: campo ?? '',
          valor: TODA_LA_CATEGORIA,
          ambito: capaAmbito?.id ?? '',
          celda: '150',
        },
      })
      if (!('error' in rh)) {
        nuevas.push(rh.capa)
        if (!capaPrincipal) capaPrincipal = rh.capa.id
      }

      const inf = diagnosticar({
        nombreCapa: reg.nombre,
        puntos,
        piezas,
        ambitoDeducido: capaAmbito === null,
        nombreAmbito: capaAmbito?.nombre ?? 'el recuadro de los registros',
        zonas: capaZonas ? { nombre: capaZonas.nombre, geo: capaZonas.geo } : null,
        campo,
        radio: Number.parseFloat(ajustesInforme.radio) || 500,
      })

      setCapas((previas) => [...nuevas, ...previas])
      setInforme(inf)
      setCapaInforme(capaPrincipal)
      setUltimo({ puntos, ambito: null, capaId: capaPrincipal ?? '' })
      setRecados([])
      setCalculando(false)
    }, 30)
  }, [ajustesInforme, capas, arranque])

  const abrirLamina = useCallback(async () => {
    // La foto se resuelve cuando el mapa deja de dibujar; puede tardar un par
    // de segundos si aún están llegando teselas. La lámina se abre igual
    // aunque falle: sin mapa, pero con las cifras y diciendo qué pasó.
    const foto = (await capturaRef.current?.()) ?? null
    setCaptura(foto)
    setLaminaAbierta(true)
  }, [])

  const quitar = useCallback(
    (id: string) => {
      setCapas((cs) => cs.filter((c) => c.id !== id))
      if (capaId === id) {
        setCapaId(null)
        setHerramientaClave(null)
        setValores({})
      }
      const limpiar = (v: Record<string, string>) =>
        Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x === id ? '' : x]))
      setValores(limpiar)
      setValoresGuiado(limpiar)
      setAjustesInforme((a) => ({
        ...a,
        registros: a.registros === id ? '' : a.registros,
        zonas: a.zonas === id ? '' : a.zonas,
        ambito: a.ambito === id ? '' : a.ambito,
      }))
      if (ultimo?.capaId === id) setUltimo(null)
      if (capaInforme === id) setCapaInforme(null)
    },
    [capaId, ultimo, capaInforme],
  )

  const encuadrar = useCallback(
    (id: string) => {
      const c = capas.find((x) => x.id === id)
      if (!c) return
      const caja = cajaDeCapa(c)
      if (caja) setEncuadre([...caja] as [number, number, number, number])
    },
    [capas],
  )

  const puntos = useMemo(() => ultimo?.puntos ?? [], [ultimo])

  const pestania = (clave: Modo, rotulo: string, nota: string) => (
    <button
      type="button"
      onClick={() => {
        setModo(clave)
        setError(null)
      }}
      title={nota}
      className={`flex-1 rounded px-2 py-1.5 text-sm ${
        modo === clave
          ? 'bg-[var(--gr-azul-500)] font-semibold text-white'
          : 'text-[var(--gr-tinta-2)] hover:bg-[var(--gr-azul-100)]'
      }`}
    >
      {rotulo}
    </button>
  )

  return (
    <>
      <div className="app-principal flex h-screen flex-col bg-[var(--gr-fondo)] text-[var(--gr-tinta)]">
        <header className="flex items-baseline gap-3 border-b border-[var(--gr-linea)] bg-[var(--gr-superficie)] px-4 py-2">
          <h1 className="text-lg font-bold tracking-tight text-[var(--gr-azul-500)]">CHASKI</h1>
          {/*
            Prototipo, y dicho donde se ve.

            Esto se publica para que se pueda probar y opinar, no para que
            nadie saque de aquí una cifra oficial sin revisarla. Decirlo en la
            cabecera cuesta nada y evita el malentendido.
          */}
          <span className="rounded border border-[var(--gr-aviso)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--gr-aviso)]">
            Prototipo
          </span>
          <p className="text-xs text-[var(--gr-tinta-3)]">
            Carga tus capas y analízalas · GADM Riobamba
          </p>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="w-[23rem] shrink-0 space-y-4 overflow-y-auto border-r border-[var(--gr-linea)] bg-[var(--gr-fondo)] p-3">
            <PanelCapas
              capas={capas}
              cargando={cargando}
              reciente={ultimo?.capaId ?? null}
              onArchivos={leer}
              onEjemplo={ejemplo}
              onMunicipio={municipio}
              onVisible={(id) =>
                setCapas((cs) =>
                  cs.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c)),
                )
              }
              onQuitar={quitar}
              onEncuadrar={encuadrar}
            />

            {recados.length > 0 && (
              <ul className="space-y-1">
                {recados.map((r, i) => (
                  <li
                    key={i}
                    className={`rounded border px-2 py-1 text-[11px] leading-snug ${
                      r.mal
                        ? 'border-[var(--gr-error)] text-[var(--gr-error)]'
                        : 'border-[var(--gr-linea)] text-[var(--gr-tinta-2)]'
                    }`}
                  >
                    {r.texto}
                  </li>
                ))}
              </ul>
            )}

            <div className="border-t border-[var(--gr-linea)] pt-3">
              <div className="mb-2 flex gap-1 rounded-md border border-[var(--gr-linea)] bg-[var(--gr-superficie)] p-1">
                {pestania('guiado', 'Preguntas', 'Elige una pregunta y completa la frase')}
                {pestania('herramientas', 'Herramientas', 'La caja entera, por categorías')}
                {pestania('informe', 'Informe', 'El diagnóstico completo, listo para imprimir')}
              </div>

              {modo === 'guiado' && (
                <PanelGuiado
                  capas={capas}
                  receta={receta}
                  onReceta={elegirReceta}
                  valores={valoresGuiado}
                  onValores={setValoresGuiado}
                  calculando={calculando}
                  onCorrer={correrReceta}
                  error={error}
                />
              )}
              {modo === 'herramientas' && (
                <PanelAnalisis
                  capas={capas}
                  capa={capa}
                  onCapa={elegirCapa}
                  herramienta={herramienta}
                  onHerramienta={elegirHerramienta}
                  valores={valores}
                  onValores={setValores}
                  calculando={calculando}
                  onCorrer={correrHerramienta}
                  error={error}
                />
              )}
              {modo === 'informe' && (
                <>
                  <PanelInforme
                    capas={capas}
                    ajustes={ajustesInforme}
                    onAjustes={setAjustesInforme}
                    calculando={calculando}
                    onCorrer={correrInforme}
                    hayInforme={informe !== null}
                    onLamina={abrirLamina}
                    error={error}
                  />
                  {informe && (
                    <div className="mt-3 space-y-2 border-t border-[var(--gr-linea)] pt-3">
                      {informe.avisos.map((a) => (
                        <p
                          key={a}
                          className="rounded border border-[var(--gr-aviso)] px-2 py-1 text-[11px] leading-snug text-[var(--gr-aviso)]"
                        >
                          {a}
                        </p>
                      ))}
                      {informe.secciones.map((s) => (
                        <div key={s.titulo}>
                          <h3 className="text-xs font-bold text-[var(--gr-tinta)]">{s.titulo}</h3>
                          <table className="w-full text-xs">
                            <tbody>
                              {s.filas.map((f) => (
                                <tr key={f.etiqueta} className="align-top">
                                  <th className="py-0.5 pr-2 text-left font-normal text-[var(--gr-tinta-3)]">
                                    {f.etiqueta}
                                  </th>
                                  <td className="py-0.5 text-right font-semibold text-[var(--gr-tinta)]">
                                    {f.valor}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {s.lectura && (
                            <p className="mt-0.5 text-[11px] leading-snug text-[var(--gr-tinta-3)]">
                              {s.lectura}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </aside>

          <main className="min-w-0 flex-1">
            <Mapa
              capas={capas}
              puntos={puntos}
              ambito={ultimo?.ambito ?? null}
              mapaBase={mapaBase}
              onMapaBase={setMapaBase}
              encuadre={encuadre}
              capturaRef={capturaRef}
            />
          </main>
        </div>
      </div>

      {laminaAbierta && informe && (
        <Lamina
          informe={informe}
          captura={captura}
          capa={capas.find((c) => c.id === capaInforme) ?? null}
          fuente={`Fuente: ${capas.find((c) => c.id === ajustesInforme.registros)?.origen ?? 'capa cargada en CHASKI'}`}
          onCerrar={() => setLaminaAbierta(false)}
        />
      )}
    </>
  )
}
