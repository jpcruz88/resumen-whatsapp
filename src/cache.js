// Caché con renovación en segundo plano para una consulta lenta.
// La primera vez hay que esperar al origen; después se responde al instante con el último valor y,
// si ya pasó el plazo, se renueva por detrás. Si la renovación falla se sigue sirviendo el último valor
// bueno. Varias llamadas a la vez comparten una sola consulta.
export function conCache(origen, { ttlMs = 5 * 60 * 1000, ahora = Date.now } = {}) {
  let valor;
  let hayValor = false;
  let cargadoEn = 0;
  let enCurso = null;

  const cargar = () => {
    if (!enCurso) {
      let consulta;
      try { consulta = Promise.resolve(origen()); } catch (e) { consulta = Promise.reject(e); }
      enCurso = consulta
        .then((v) => { valor = v; hayValor = true; cargadoEn = ahora(); return v; })
        .finally(() => { enCurso = null; });
    }
    return enCurso;
  };

  async function obtener() {
    if (!hayValor) return cargar();
    if (ahora() - cargadoEn > ttlMs) cargar().catch(() => {});
    return valor;
  }
  // Se llama al arrancar para que la primera petición real ya encuentre la lista cargada.
  obtener.precalentar = () => { cargar().catch(() => {}); };
  return obtener;
}
