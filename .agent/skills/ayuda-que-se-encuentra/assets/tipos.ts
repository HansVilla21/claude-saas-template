// =============================================================================
// Tipos de la sección Ayuda. El contenido vive en `contenido/*.ts` como DATO; la
// interfaz (`components/ayuda/`) solo lo dibuja y el asistente de IA lo lee con
// `manualComoTexto()`. Este archivo no importa nada.
// =============================================================================

/** Cómo se agrupa el manual. El orden de PARTES es el orden en pantalla. */
export const PARTES = [
  { id: 'primeros-pasos', titulo: 'Primeros pasos' },
  { id: 'dia-a-dia', titulo: 'Tu día a día' },
  { id: 'conversaciones', titulo: 'Conversaciones' },
  { id: 'contactos', titulo: 'Contactos' },
  { id: 'formularios-seguimientos', titulo: 'Formularios y seguimientos' },
  { id: 'agenda-envios', titulo: 'Agenda y envíos' },
  { id: 'chatbot', titulo: 'El chatbot' },
  { id: 'configuracion', titulo: 'Configuración' },
  { id: 'glosario', titulo: 'Glosario' },
  { id: 'roles', titulo: 'Los roles' },
  { id: 'preguntas', titulo: 'Preguntas frecuentes' },
] as const;
export type ParteAyuda = (typeof PARTES)[number]['id'];

export type BloqueAyuda =
  | { kind: 'parrafo'; texto: string }
  /** Se numeran. Cada paso nombra el botón tal como se ve, entre «». */
  | { kind: 'pasos'; items: string[] }
  | { kind: 'lista'; items: string[] }
  /** El corazón del manual: lo que busca quien está parado frente a la pantalla. */
  | { kind: 'botones'; items: { nombre: string; hace: string }[] }
  | { kind: 'definiciones'; items: { termino: string; que: string }[] }
  | { kind: 'nota'; tono: 'info' | 'ojo' | 'tip'; texto: string };

export interface PantallaAyuda {
  /** Cómo se llama en el menú o en el título de la pantalla: "Contactos". */
  nombre: string;
  /**
   * Ruta RELATIVA a `/a/<slug>/`, sin barra al principio. `''` = Resumen (la raíz).
   * Con rutas dinámicas, el patrón: `leads/[id]`. Es lo que enlaza el «?» de cada
   * pantalla con su artículo y lo que mira la prueba de cobertura.
   */
  ruta: string;
}

export interface ArticuloAyuda {
  /** Único y ESTABLE (kebab-case, en español). El asistente y los enlaces lo usan. */
  id: string;
  /** Una tarea desde lo que la persona quiere: «¿Cómo hago para…?». */
  titulo: string;
  parte: ParteAyuda;
  /** Las pantallas donde se hace. La primera es la principal. Vacío solo en glosario/roles/preguntas. */
  pantallas: PantallaAyuda[];
  /** Quién la ve, según el gate REAL del código: "Todos", "Dueño y admin", "Todos menos viewer"… */
  quienLaVe: string;
  /** Una oración. Se ve con el artículo cerrado y pesa en el buscador. */
  resumen: string;
  bloques: BloqueAyuda[];
  /** Lo que la gente TECLEA (sinónimos), no el nombre interno. "plata", "presupuesto", "borrar". */
  palabras?: string[];
  /** Ids de artículos que conviene leer después. */
  relacionados?: string[];
}
