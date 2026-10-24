import { z } from "zod";
import {
  TIPOS_SISTEMA_CODIGOS,
  type TipoSistemaCodigo,
  normalizarTipoSistemaCodigo,
} from "@/config/tipos-sistema";

/**
 * Enum estrito dos 22 códigos de Tipo de Sistema (PRD §5.1 / sprint-1-spec §2.1).
 * Rejeita qualquer valor fora do vocabulário controlado.
 */
export const tipoSistemaCodigoSchema = z.enum(TIPOS_SISTEMA_CODIGOS);

/**
 * Variante resiliente para payloads externos (esteira PNCP): normaliza
 * capitalização e separadores (espaço/hífen → underscore) e converte valores
 * vazios, não textuais ou desconhecidos no fallback `OUTROS`
 * (sprint-1-spec §2.2 — "normalizar ou validar conforme o enum dos 22 tipos").
 */
export const tipoSistemaCodigoNormalizadoSchema = z
  .unknown()
  .transform((value): TipoSistemaCodigo => normalizarTipoSistemaCodigo(value))
  .pipe(tipoSistemaCodigoSchema);

export type TipoSistemaCodigoContract = z.infer<typeof tipoSistemaCodigoSchema>;
