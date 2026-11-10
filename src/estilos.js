// Base visual compartida por el reporte y la conversación (la misma que usa el panel):
// colores, tipografía, foco y el enlace de vuelta. Claro y oscuro siguen al sistema.
export const BASE_CSS = `
:root{color-scheme:light dark;--bg:#f3f6f5;--sup:#fff;--sup2:#eaf0ee;--texto:#142420;--suave:#51615c;--borde:#d3ddd9;--acento:#0b6e63;--acento-suave:#d9efea;--t0:#9a3412;--t1:#1d4ed8;--t2:#7e22ce;--t3:#15803d;--t4:#be123c}
@media (prefers-color-scheme:dark){:root{--bg:#0d1311;--sup:#151d1a;--sup2:#1d2824;--texto:#e8f0ed;--suave:#9db0a9;--borde:#2b3a35;--acento:#3ccbb6;--acento-suave:#143a34;--t0:#fdba74;--t1:#93c5fd;--t2:#d8b4fe;--t3:#86efac;--t4:#fda4af}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--texto);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
::selection{background:var(--acento-suave);color:var(--texto)}
:focus-visible{outline:2px solid var(--acento);outline-offset:2px}
.pagina{max-width:44rem;margin:0 auto;padding:12px 16px 40px}
.volver{display:inline-flex;align-items:center;gap:6px;min-height:44px;color:var(--suave);text-decoration:none;font-weight:600;font-size:.95rem}
.volver:hover{color:var(--texto)}
.volver svg{width:18px;height:18px}
.pie{margin-top:24px;color:var(--suave);font-size:.85rem}
.acciones{margin:14px 0 0}
.boton-enlace{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 16px;border:1px solid var(--borde);border-radius:10px;background:var(--sup);color:var(--texto);font-weight:600;text-decoration:none}
.boton-enlace:hover{border-color:var(--suave)}
.boton-enlace svg{width:18px;height:18px}
`;

export const FLECHA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
export const ICONO_CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4.5 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 9h8M8 12h5"/></svg>';
export const ICONO_IMAGEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m20.5 16-4.5-4.5L8 19.5"/></svg>';
export const ICONO_AUDIO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/></svg>';
export const ICONO_BUSCAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
