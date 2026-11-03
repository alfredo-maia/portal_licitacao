import {
  CATALOGO_MACRO_SEGMENTOS,
  type MacroSegmentoDef,
} from "@/server/schemas/segmentos.schema";

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Filtra a árvore de 40 macro-categorias / 188 subatividades por texto livre
 * (nome da macro-categoria, nome ou código da subatividade), insensível a acentos.
 * Busca vazia devolve o catálogo completo.
 */
export function filtrarCatalogoSegmentos(busca: string): MacroSegmentoDef[] {
  const termo = normalizar(busca);
  const todos = Object.values(CATALOGO_MACRO_SEGMENTOS);
  if (!termo) return todos;
  return todos.filter(
    (macro) =>
      normalizar(macro.nome).includes(termo) ||
      macro.subcategorias.some(
        (sub) => normalizar(sub.nome).includes(termo) || sub.codigo.includes(termo),
      ),
  );
}

