// Normaliza para comparar: minúsculas, sin tildes ni diéresis (conserva la ñ
// como "n" a propósito: quien teclea "senal" busca "señal"). Puro.

export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Las palabras de una consulta, normalizadas y sin repetir. */
export function palabrasDe(consulta: string): string[] {
  const vistas = new Set<string>();
  for (const p of normalizar(consulta).split(/[^a-z0-9ñ]+/).filter(Boolean)) vistas.add(p);
  return [...vistas];
}
