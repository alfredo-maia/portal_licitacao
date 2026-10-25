import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/server/audit";
import {
  calcularPrazoFatalImpugnacao,
  type ImpugnacaoAtualizarInput,
  type ImpugnacaoCriarInput,
  type ImpugnacaoItem,
  type ImpugnacaoListQuery,
  type ImpugnacaoListResponse,
  impugnacaoAtualizarInputSchema,
  impugnacaoCriarInputSchema,
  impugnacaoListQuerySchema,
} from "@/server/schemas/impugnacao.schema";
import {
  deleteInMemoryImpugnacao,
  getInMemoryImpugnacao,
  insertInMemoryImpugnacao,
  listInMemoryImpugnacoes,
  updateInMemoryImpugnacao,
} from "./licitacoes-store";

function anexarMetricasPrazoFatal(imp: any): ImpugnacaoItem {
  const agora = Date.now();
  const prazoFatalDate = imp.prazoFatal instanceof Date ? imp.prazoFatal : new Date(imp.prazoFatal);
  const diffMs = prazoFatalDate.getTime() - agora;
  const horasRestantes = Math.round(diffMs / (1000 * 60 * 60));
  const prazoVencido = diffMs < 0;

  return {
    id: imp.id,
    licitacaoId: imp.licitacaoId ?? null,
    numeroEdital: imp.numeroEdital,
    orgaoNome: imp.orgaoNome,
    objeto: imp.objeto ?? null,
    status: imp.status as any,
    motivoLegal: imp.motivoLegal,
    dataAberturaSessao: imp.dataAberturaSessao instanceof Date ? imp.dataAberturaSessao : new Date(imp.dataAberturaSessao),
    prazoFatal: prazoFatalDate,
    fundamentacao: imp.fundamentacao,
    pedidos: imp.pedidos,
    numeroProtocolo: imp.numeroProtocolo ?? null,
    dataProtocolo: imp.dataProtocolo ? (imp.dataProtocolo instanceof Date ? imp.dataProtocolo : new Date(imp.dataProtocolo)) : null,
    dataResposta: imp.dataResposta ? (imp.dataResposta instanceof Date ? imp.dataResposta : new Date(imp.dataResposta)) : null,
    decisaoJulgamento: imp.decisaoJulgamento ?? null,
    criadoPorId: imp.criadoPorId ?? null,
    criadoEm: imp.criadoEm instanceof Date ? imp.criadoEm : new Date(imp.criadoEm),
    atualizadoEm: imp.atualizadoEm instanceof Date ? imp.atualizadoEm : new Date(imp.atualizadoEm),
    horasRestantesPrazoFatal: horasRestantes,
    prazoVencido,
  };
}

export async function listarImpugnacoes(
  rawQuery?: Partial<ImpugnacaoListQuery>,
): Promise<ImpugnacaoListResponse> {
  const query = impugnacaoListQuerySchema.parse(rawQuery ?? {});

  try {
    const where: any = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.busca) {
      where.OR = [
        { numeroEdital: { contains: query.busca, mode: "insensitive" } },
        { orgaoNome: { contains: query.busca, mode: "insensitive" } },
        { motivoLegal: { contains: query.busca, mode: "insensitive" } },
        { numeroProtocolo: { contains: query.busca, mode: "insensitive" } },
      ];
    }

    const [total, doDb] = await Promise.all([
      prisma.impugnacao.count({ where }),
      prisma.impugnacao.findMany({
        where,
        orderBy: [{ prazoFatal: "asc" }, { criadoEm: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    let impugnacoes = doDb.map(anexarMetricasPrazoFatal);
    if (query.apenasCriticas) {
      impugnacoes = impugnacoes.filter(
        (i) => i.status === "RASCUNHO" && (i.horasRestantesPrazoFatal ?? 999) <= 48,
      );
    }

    return {
      ok: true,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize) || 0,
      impugnacoes,
    };
  } catch {
    // Fallback em memória resiliente
    let memoria = listInMemoryImpugnacoes();
    if (query.status) {
      memoria = memoria.filter((i) => i.status === query.status);
    }
    if (query.busca) {
      const termo = query.busca.toLowerCase();
      memoria = memoria.filter(
        (i) =>
          i.numeroEdital.toLowerCase().includes(termo) ||
          i.orgaoNome.toLowerCase().includes(termo) ||
          i.motivoLegal.toLowerCase().includes(termo) ||
          (i.numeroProtocolo && i.numeroProtocolo.toLowerCase().includes(termo)),
      );
    }

    let calculadas = memoria.map(anexarMetricasPrazoFatal);
    if (query.apenasCriticas) {
      calculadas = calculadas.filter(
        (i) => i.status === "RASCUNHO" && (i.horasRestantesPrazoFatal ?? 999) <= 48,
      );
    }

    const total = calculadas.length;
    const paginado = calculadas.slice(
      (query.page - 1) * query.pageSize,
      query.page * query.pageSize,
    );

    return {
      ok: true,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize) || 0,
      impugnacoes: paginado,
    };
  }
}

export async function obterImpugnacao(id: string): Promise<ImpugnacaoItem | null> {
  try {
    const item = await prisma.impugnacao.findUnique({ where: { id } });
    if (!item) return null;
    return anexarMetricasPrazoFatal(item);
  } catch {
    const item = getInMemoryImpugnacao(id);
    return item ? anexarMetricasPrazoFatal(item) : null;
  }
}

export async function criarImpugnacao(
  data: ImpugnacaoCriarInput,
  usuarioId?: string | null,
): Promise<ImpugnacaoItem> {
  const validado = impugnacaoCriarInputSchema.parse(data);
  const dataAbertura = new Date(validado.dataAberturaSessao);
  const prazoFatal = calcularPrazoFatalImpugnacao(dataAbertura);

  try {
    const criada = await prisma.impugnacao.create({
      data: {
        licitacaoId: validado.licitacaoId || null,
        numeroEdital: validado.numeroEdital,
        orgaoNome: validado.orgaoNome,
        objeto: validado.objeto || null,
        status: validado.status,
        motivoLegal: validado.motivoLegal,
        dataAberturaSessao: dataAbertura,
        prazoFatal,
        fundamentacao: validado.fundamentacao,
        pedidos: validado.pedidos,
        numeroProtocolo: validado.numeroProtocolo || null,
        dataProtocolo: validado.dataProtocolo || null,
        criadoPorId: usuarioId || null,
      },
    });

    await recordAuditLog({
      acao: "IMPUGNACAO_CRIADA",
      entidadeTipo: "IMPUGNACAO",
      entidadeId: criada.id,
      usuarioId: usuarioId ?? null,
      depois: {
        numeroEdital: criada.numeroEdital,
        status: criada.status,
        prazoFatal: criada.prazoFatal.toISOString(),
      },
    });

    return anexarMetricasPrazoFatal(criada);
  } catch {
    const memoria = insertInMemoryImpugnacao({
      ...validado,
      prazoFatal,
      criadoPorId: usuarioId ?? null,
    });

    await recordAuditLog({
      acao: "IMPUGNACAO_CRIADA",
      entidadeTipo: "IMPUGNACAO",
      entidadeId: memoria.id,
      usuarioId: usuarioId ?? null,
      depois: {
        numeroEdital: memoria.numeroEdital,
        status: memoria.status,
        prazoFatal: memoria.prazoFatal.toISOString(),
      },
    });

    return anexarMetricasPrazoFatal(memoria);
  }
}

export async function atualizarImpugnacao(
  id: string,
  data: ImpugnacaoAtualizarInput,
  usuarioId?: string | null,
): Promise<ImpugnacaoItem | null> {
  const validado = impugnacaoAtualizarInputSchema.parse(data);

  try {
    const atualizada = await prisma.impugnacao.update({
      where: { id },
      data: {
        ...(validado.status !== undefined ? { status: validado.status } : {}),
        ...(validado.motivoLegal !== undefined ? { motivoLegal: validado.motivoLegal } : {}),
        ...(validado.fundamentacao !== undefined ? { fundamentacao: validado.fundamentacao } : {}),
        ...(validado.pedidos !== undefined ? { pedidos: validado.pedidos } : {}),
        ...(validado.numeroProtocolo !== undefined ? { numeroProtocolo: validado.numeroProtocolo } : {}),
        ...(validado.dataProtocolo !== undefined ? { dataProtocolo: validado.dataProtocolo } : {}),
        ...(validado.dataResposta !== undefined ? { dataResposta: validado.dataResposta } : {}),
        ...(validado.decisaoJulgamento !== undefined ? { decisaoJulgamento: validado.decisaoJulgamento } : {}),
      },
    });

    await recordAuditLog({
      acao: "IMPUGNACAO_ATUALIZADA",
      entidadeTipo: "IMPUGNACAO",
      entidadeId: atualizada.id,
      usuarioId: usuarioId ?? null,
      depois: validado,
    });

    return anexarMetricasPrazoFatal(atualizada);
  } catch {
    const memoria = updateInMemoryImpugnacao(id, validado);
    if (!memoria) return null;

    await recordAuditLog({
      acao: "IMPUGNACAO_ATUALIZADA",
      entidadeTipo: "IMPUGNACAO",
      entidadeId: id,
      usuarioId: usuarioId ?? null,
      depois: validado,
    });

    return anexarMetricasPrazoFatal(memoria);
  }
}

export async function excluirImpugnacao(
  id: string,
  usuarioId?: string | null,
): Promise<boolean> {
  try {
    await prisma.impugnacao.delete({ where: { id } });
    await recordAuditLog({
      acao: "IMPUGNACAO_EXCLUIDA",
      entidadeTipo: "IMPUGNACAO",
      entidadeId: id,
      usuarioId: usuarioId ?? null,
    });
    return true;
  } catch {
    const deletado = deleteInMemoryImpugnacao(id);
    if (deletado) {
      await recordAuditLog({
        acao: "IMPUGNACAO_EXCLUIDA",
        entidadeTipo: "IMPUGNACAO",
        entidadeId: id,
        usuarioId: usuarioId ?? null,
      });
    }
    return deletado;
  }
}

export function gerarMinutaJuridica(
  impugnacao: ImpugnacaoItem,
  empresa = {
    razaoSocial: "EMPRESA LICITANTE LTDA",
    cnpj: "00.000.000/0001-00",
    cidade: "Goiânia",
    uf: "GO",
  },
): { minutaHtml: string; minutaTexto: string } {
  const dataHoje = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const minutaTexto = `
ILUSTRÍSSIMO(A) SENHOR(A) PREGOEIRO(A) / AGENTE DE CONTRATAÇÃO
${impugnacao.orgaoNome.toUpperCase()}
PROCESSO / EDITAL: ${impugnacao.numeroEdital}
DATA DA SESSÃO PÚBLICA: ${impugnacao.dataAberturaSessao.toLocaleDateString("pt-BR")}

${empresa.razaoSocial}, pessoa jurídica de direito privado inscrita no CNPJ sob o nº ${empresa.cnpj}, com sede em ${empresa.cidade} - ${empresa.uf}, vem mui respeitosamente, perante Vossa Senhoria, com fulcro no Art. 164 da Lei Federal nº 14.133/2021, interpor a presente

IMPUGNAÇÃO AO EDITAL DE LICITAÇÃO

em face das cláusulas e exigências editalícias a seguir delineadas, pelas razões fáticas e jurídicas que passa a expor:

1. DA TEMPESTIVIDADE
A presente impugnação é tempestiva, visto que apresentada dentro do prazo legal de até 3 (três) dias úteis anteriores à data de abertura da sessão pública, em estrita obediência ao Art. 164 da Lei nº 14.133/2021.

2. DA SÍNTESE DO OBJETO
O presente certame tem por objeto: ${impugnacao.objeto || "Contratação descrita no instrumento convocatório"}.

3. DAS IRREGULARIDADES APONTADAS E DO MOTIVO LEGAL
${impugnacao.motivoLegal}

4. DA FUNDAMENTAÇÃO JURÍDICA E JURISPRUDÊNCIA DO TCU
${impugnacao.fundamentacao}
Conforme remansosa jurisprudência do Tribunal de Contas da União (v.g. Súmula 273/TCU e Acórdãos correlatos), é vedado à Administração incluir exigências que frustrem o caráter competitivo do certame, devendo prevalecer o princípio da isonomia e a busca pela proposta mais vantajosa.

5. DOS PEDIDOS
Ante o exposto, REQUER-SE a Vossa Senhoria:
${impugnacao.pedidos}
Requer-se, ainda, a suspensão do certame até o efetivo julgamento desta impugnação e, caso acatada, a consequente republicação do edital com reabertura de prazos.

Nestes termos,
Pede Deferimento.

${empresa.cidade} - ${empresa.uf}, ${dataHoje}.

___________________________________________________
${empresa.razaoSocial}
CNPJ: ${empresa.cnpj}
`.trim();

  const minutaHtml = `
<div class="minuta-impugnacao" style="font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.6; color: #161616; padding: 2cm; background: #ffffff;">
  <p style="text-align: center; font-weight: bold; margin-bottom: 24px;">
    ILMO(A). SR(A). PREGOEIRO(A) / AGENTE DE CONTRATAÇÃO<br>
    ${impugnacao.orgaoNome.toUpperCase()}<br>
    EDITAL: ${impugnacao.numeroEdital}
  </p>
  <p style="text-align: justify; text-indent: 2cm;">
    <strong>${empresa.razaoSocial}</strong>, inscrita no CNPJ sob o nº ${empresa.cnpj}, vem, com fundamento no Art. 164 da Lei Federal nº 14.133/2021, interpor
  </p>
  <h2 style="text-align: center; font-size: 14pt; margin: 20px 0; font-weight: bold;">IMPUGNAÇÃO AO EDITAL</h2>
  
  <h3 style="font-size: 12pt; font-weight: bold; margin-top: 16px;">1. DA TEMPESTIVIDADE</h3>
  <p style="text-align: justify; text-indent: 2cm;">
    A presente impugnação é manifestamente tempestiva, eis que submetida em prazo superior a 3 (três) dias úteis que antecedem a abertura do certame, nos termos do Art. 164 da Lei nº 14.133/2021.
  </p>

  <h3 style="font-size: 12pt; font-weight: bold; margin-top: 16px;">2. DA IRREGULARIDADE APONTADA</h3>
  <p style="text-align: justify; text-indent: 2cm;">
    ${impugnacao.motivoLegal}
  </p>

  <h3 style="font-size: 12pt; font-weight: bold; margin-top: 16px;">3. DA FUNDAMENTAÇÃO JURÍDICA E SÚMULAS DO TCU</h3>
  <p style="text-align: justify; text-indent: 2cm;">
    ${impugnacao.fundamentacao}
  </p>

  <h3 style="font-size: 12pt; font-weight: bold; margin-top: 16px;">4. DOS PEDIDOS</h3>
  <p style="text-align: justify; text-indent: 2cm;">
    ${impugnacao.pedidos}
  </p>

  <p style="text-align: right; margin-top: 36px;">
    ${empresa.cidade} - ${empresa.uf}, ${dataHoje}.
  </p>
  <div style="text-align: center; margin-top: 48px;">
    <div style="border-top: 1px solid #000; display: inline-block; min-width: 300px; padding-top: 4px;">
      ${empresa.razaoSocial}<br>
      CNPJ: ${empresa.cnpj}
    </div>
  </div>
</div>
`.trim();

  return { minutaHtml, minutaTexto };
}
