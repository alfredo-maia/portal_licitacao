import { beforeEach, describe, expect, it } from "vitest";
import type { RbacUser } from "@/lib/rbac";
import {
  calcularCotaAnaliseIA,
  inicioMesCivilBRT,
  mesReferenciaBRT,
  proximoMesCivilBRT,
} from "@/server/schemas/analise-ia.schema";
import { PLAN_LIMITS } from "@/server/schemas/tenant.schema";
import {
  atualizarNotaSchema,
  criarNotaSchema,
} from "@/server/schemas/licitacao-nota.schema";
import {
  insertInMemoryLicitacao,
  insertInMemoryLicitacaoArquivo,
  insertInMemoryUsuario,
  listInMemoryNotificacoesUsuario,
  resetInMemoryLicitacoes,
} from "@/server/services/licitacoes-store";
import {
  atualizarNota,
  criarNota,
  excluirNota,
  listarNotas,
  LicitacaoNotasError,
} from "@/server/services/licitacao-notas.service";
import {
  adicionarArquivoEdital,
  atualizarEquipe,
  atualizarKanbanStatus,
  atualizarLicitacao,
  removerArquivoEdital,
} from "@/server/services/oportunidades.service";
import { criarDocumento } from "@/server/services/documentos.service";
import { criarPortal } from "@/server/services/portais.service";
import {
  aguardarProcessamentoAnaliseIA,
  iniciarAnaliseParticipacaoAssincrona,
  obterAnaliseIAPorId,
  obterStatusCotaAnaliseIA,
} from "@/server/services/analise-ia-participacao.service";
import { inMemoryTenants } from "@/server/services/tenant.service";

const TENANT = "tenant_notas_t1";

type FixedUser = RbacUser & { id: string };

const DIRETORA: FixedUser = { id: "usr_nota_dir", name: "Diana Diretora", email: "diana@empresa.com.br", role: "DIRETORIA", ativo: true };
const ANALISTA: FixedUser = { id: "usr_nota_ana", name: "Ana Analista", email: "ana@empresa.com.br", role: "ANALISTA_COMERCIAL", ativo: true };
const OPERADOR: FixedUser = { id: "usr_nota_ope", name: "Otavio Operador", email: "otavio@empresa.com.br", role: "OPERADOR", ativo: true };

function seedLicitacao(): string {
  const lic = insertInMemoryLicitacao({
    idPncp: `00000000000100-1-${Math.floor(Math.random() * 1e6)}/2026`,
    numeroControlePNCP: null,
    numeroEdital: "PE 321/2026",
    orgaoNome: "Prefeitura de Teste",
    orgaoCnpj: "00000000000100",
    uf: "GO",
    municipio: "Goiânia",
    esfera: "M",
    poder: "E",
    modalidade: "Pregão Eletrônico",
    modalidadeCodigo: 6,
    portalDisputa: "Compras.gov.br",
    miniResumo: "Aquisição de materiais",
    resumo: "Aquisição de materiais de escritório",
    valorEstimado: 90_000,
    dataAbertura: new Date("2026-12-10T13:00:00Z"),
    dataEncerramentoProposta: new Date("2026-12-10T13:00:00Z"),
    dataPublicacaoPncp: new Date("2026-11-01T13:00:00Z"),
    dataUltimaAtualizacao: new Date("2026-11-01T13:00:00Z"),
    status: "PENDENTE",
    parecerIA: "GO",
    justificativaIA: null,
    tipoSistemaCodigo: "SISTEMA_NOVO",
    segmentoMacro: "ESCRITORIO_E_GRAFICA",
    subcategorias: [],
    atestadosExigidos: [],
    motivoRecusa: null,
    quantidadeLotes: 1,
    loteUnico: true,
    precoPorLote: false,
    isPresencial: false,
    distanciaGoianiaKm: 0,
    linkPncp: null,
    linkSistemaOrigem: null,
    hashCritico: `hash_${Math.random()}`,
    valorArrematado: null,
    responsavelId: null,
    arquivos: [
      {
        id: "arq_seed_edital_1",
        nome: "Edital_PE_321_2026.pdf",
        url: "https://pncp.gov.br/doc/1",
        tamanho: 1048576,
        tipo: "EDITAL",
      },
    ],
  } as any);
  insertInMemoryLicitacaoArquivo(lic.id, {
    id: `arq_${lic.id}`,
    nome: "Edital_PE_321_2026.pdf",
    url: "https://pncp.gov.br/doc/1",
    tamanho: 1048576,
    tipo: "EDITAL",
  });
  return lic.id;
}

function seedEquipe() {
  for (const u of [DIRETORA, ANALISTA, OPERADOR]) {
    insertInMemoryUsuario({ ...u, tenantId: TENANT });
  }
}

describe("Issue #36 — Cota mensal de análises de IA por plano", () => {
  it("define os limites mensais oficiais: Básico 5, Pro/Trial 15, Enterprise 30", () => {
    expect(PLAN_LIMITS.BASICO.aiAnalisesMes).toBe(5);
    expect(PLAN_LIMITS.PRO.aiAnalisesMes).toBe(15);
    expect(PLAN_LIMITS.ENTERPRISE.aiAnalisesMes).toBe(30);
  });

  it("calcula usados/limite e restantes (0/5 → 1/5)", () => {
    const zero = calcularCotaAnaliseIA({ plano: "BASICO", usadas: 0 });
    expect(zero).toMatchObject({ limite: 5, usadas: 0, restantes: 5, atingiuLimite: false, acaoSugerida: null });

    const uma = calcularCotaAnaliseIA({ plano: "BASICO", usadas: 1 });
    expect(uma).toMatchObject({ limite: 5, usadas: 1, restantes: 4, atingiuLimite: false });
  });

  it("Básico no limite recomenda upgrade de plano", () => {
    const cota = calcularCotaAnaliseIA({ plano: "BASICO", usadas: 5 });
    expect(cota.atingiuLimite).toBe(true);
    expect(cota.acaoSugerida).toBe("UPGRADE");
    expect(cota.mensagemBloqueio).toMatch(/upgrade/i);
    expect(cota.mensagemBloqueio).toMatch(/Pro/);
  });

  it("Pro no limite recomenda upgrade para Enterprise", () => {
    const cota = calcularCotaAnaliseIA({ plano: "PRO", usadas: 15 });
    expect(cota.atingiuLimite).toBe(true);
    expect(cota.acaoSugerida).toBe("UPGRADE");
    expect(cota.mensagemBloqueio).toMatch(/Enterprise/);
  });

  it("Enterprise no limite orienta contato com a equipe de vendas", () => {
    const cota = calcularCotaAnaliseIA({ plano: "ENTERPRISE", usadas: 30 });
    expect(cota.atingiuLimite).toBe(true);
    expect(cota.acaoSugerida).toBe("CONTATO_VENDAS");
    expect(cota.mensagemBloqueio).toMatch(/vendas/i);
  });

  it("o mês civil é apurado em America/Sao_Paulo e renova no dia 1º", () => {
    // 01/12/2026 02:00 UTC ainda é 30/11 23:00 em Brasília → ainda é novembro
    const viradaUtc = new Date("2026-12-01T02:00:00Z");
    expect(mesReferenciaBRT(viradaUtc)).toBe("2026-11");
    expect(inicioMesCivilBRT(viradaUtc).toISOString()).toBe("2026-11-01T03:00:00.000Z");
    expect(proximoMesCivilBRT(viradaUtc).toISOString()).toBe("2026-12-01T03:00:00.000Z");

    const dezembro = new Date("2026-12-01T12:00:00Z");
    expect(mesReferenciaBRT(dezembro)).toBe("2026-12");
    expect(proximoMesCivilBRT(dezembro).toISOString()).toBe("2027-01-01T03:00:00.000Z");
  });
});

describe("Issue #36 — Aba Notas: contrato Zod", () => {
  it("exige texto e limita menções", () => {
    expect(() => criarNotaSchema.parse({ texto: "   " })).toThrow();
    const ok = criarNotaSchema.parse({ texto: "  Revisar TR  " });
    expect(ok.texto).toBe("Revisar TR");
    expect(ok.mencionadosIds).toEqual([]);
    expect(() => atualizarNotaSchema.parse({ texto: "x", mencionadosIds: Array(21).fill("u") })).toThrow();
  });
});

describe("Issue #36 — Aba Notas: regras de permissão e menções", () => {
  beforeEach(() => {
    resetInMemoryLicitacoes();
    seedEquipe();
  });

  it("qualquer membro da empresa pode criar nota", async () => {
    const licId = seedLicitacao();
    const nota = await criarNota({
      licitacaoId: licId,
      tenantId: TENANT,
      user: OPERADOR,
      input: { texto: "Edital exige visita técnica.", mencionadosIds: [] },
    });
    expect(nota.autorId).toBe(OPERADOR.id);
    expect(nota.autorNome).toBe("Otavio Operador");
    expect(nota.editada).toBe(false);

    const lista = await listarNotas({ licitacaoId: licId, tenantId: TENANT, user: ANALISTA });
    expect(lista).toHaveLength(1);
    expect(lista[0].podeEditar).toBe(false);
    expect(lista[0].podeExcluir).toBe(false);
  });

  it("apenas o autor edita a própria nota (outros recebem 403 — nem a Diretoria)", async () => {
    const licId = seedLicitacao();
    const nota = await criarNota({
      licitacaoId: licId,
      tenantId: TENANT,
      user: ANALISTA,
      input: { texto: "Versão inicial", mencionadosIds: [] },
    });

    const editada = await atualizarNota({
      licitacaoId: licId,
      notaId: nota.id,
      tenantId: TENANT,
      user: ANALISTA,
      input: { texto: "Versão revisada", mencionadosIds: [] },
    });
    expect(editada.texto).toBe("Versão revisada");
    expect(editada.editada).toBe(true);

    await expect(
      atualizarNota({
        licitacaoId: licId,
        notaId: nota.id,
        tenantId: TENANT,
        user: DIRETORA,
        input: { texto: "Tentativa da diretoria", mencionadosIds: [] },
      }),
    ).rejects.toMatchObject({ status: 403, code: "NOTA_EDICAO_RESTRITA_AO_AUTOR" });

    const lista = await listarNotas({ licitacaoId: licId, tenantId: TENANT, user: ANALISTA });
    expect(lista[0].podeEditar).toBe(true);
  });

  it("apenas a DIRETORIA exclui notas (autor sem cargo de diretoria recebe 403)", async () => {
    const licId = seedLicitacao();
    const nota = await criarNota({
      licitacaoId: licId,
      tenantId: TENANT,
      user: ANALISTA,
      input: { texto: "Nota a remover", mencionadosIds: [] },
    });

    await expect(
      excluirNota({ licitacaoId: licId, notaId: nota.id, tenantId: TENANT, user: ANALISTA }),
    ).rejects.toMatchObject({ status: 403, code: "NOTA_EXCLUSAO_RESTRITA_DIRETORIA" });

    const antes = await listarNotas({ licitacaoId: licId, tenantId: TENANT, user: DIRETORA });
    expect(antes).toHaveLength(1);
    expect(antes[0].podeExcluir).toBe(true);

    await excluirNota({ licitacaoId: licId, notaId: nota.id, tenantId: TENANT, user: DIRETORA });
    const depois = await listarNotas({ licitacaoId: licId, tenantId: TENANT, user: DIRETORA });
    expect(depois).toHaveLength(0);
  });

  it("menção @ notifica o colaborador mencionado (N9) com link para a aba Notas", async () => {
    const licId = seedLicitacao();
    await criarNota({
      licitacaoId: licId,
      tenantId: TENANT,
      user: DIRETORA,
      input: { texto: "@Ana Analista confira a planilha de custos", mencionadosIds: [ANALISTA.id] },
    });

    const notifs = listInMemoryNotificacoesUsuario(ANALISTA.id);
    const n9 = notifs.filter((n) => n.notificacao.tipo === "N9_MENCAO_NOTA");
    expect(n9).toHaveLength(1);
    expect(n9[0].notificacao.titulo).toMatch(/Diana Diretora/);
    expect(n9[0].notificacao.linkDestino).toBe(`/oportunidades/${licId}?aba=notas`);

    // o autor não é notificado por mencionar a si mesmo / outros membros não mencionados não recebem
    expect(listInMemoryNotificacoesUsuario(DIRETORA.id).filter((n) => n.notificacao.tipo === "N9_MENCAO_NOTA")).toHaveLength(0);
    expect(listInMemoryNotificacoesUsuario(OPERADOR.id).filter((n) => n.notificacao.tipo === "N9_MENCAO_NOTA")).toHaveLength(0);
  });

  it("ignora ids mencionados que não pertencem à equipe ou não aparecem no texto", async () => {
    const licId = seedLicitacao();
    await criarNota({
      licitacaoId: licId,
      tenantId: TENANT,
      user: DIRETORA,
      input: { texto: "Sem menção real no texto", mencionadosIds: [OPERADOR.id, "usuario_de_outra_empresa"] },
    });
    expect(listInMemoryNotificacoesUsuario(OPERADOR.id).filter((n) => n.notificacao.tipo === "N9_MENCAO_NOTA")).toHaveLength(0);
    expect(listInMemoryNotificacoesUsuario("usuario_de_outra_empresa")).toHaveLength(0);
  });

  it("ao editar, notifica somente os NOVOS mencionados", async () => {
    const licId = seedLicitacao();
    const nota = await criarNota({
      licitacaoId: licId,
      tenantId: TENANT,
      user: DIRETORA,
      input: { texto: "@Ana Analista veja isto", mencionadosIds: [ANALISTA.id] },
    });
    await atualizarNota({
      licitacaoId: licId,
      notaId: nota.id,
      tenantId: TENANT,
      user: DIRETORA,
      input: { texto: "@Ana Analista e @Otavio Operador vejam isto", mencionadosIds: [ANALISTA.id, OPERADOR.id] },
    });

    const n9Ana = listInMemoryNotificacoesUsuario(ANALISTA.id).filter((n) => n.notificacao.tipo === "N9_MENCAO_NOTA");
    const n9Ope = listInMemoryNotificacoesUsuario(OPERADOR.id).filter((n) => n.notificacao.tipo === "N9_MENCAO_NOTA");
    expect(n9Ana).toHaveLength(1);
    expect(n9Ope).toHaveLength(1);
  });

  it("filtra por autor e por busca textual", async () => {
    const licId = seedLicitacao();
    await criarNota({ licitacaoId: licId, tenantId: TENANT, user: DIRETORA, input: { texto: "Prazo de entrega curto", mencionadosIds: [] } });
    await criarNota({ licitacaoId: licId, tenantId: TENANT, user: ANALISTA, input: { texto: "Falta atestado técnico", mencionadosIds: [] } });

    const porAutor = await listarNotas({ licitacaoId: licId, tenantId: TENANT, user: DIRETORA, filtros: { autorId: ANALISTA.id } });
    expect(porAutor).toHaveLength(1);
    expect(porAutor[0].texto).toMatch(/atestado/);

    const porBusca = await listarNotas({ licitacaoId: licId, tenantId: TENANT, user: DIRETORA, filtros: { busca: "ENTREGA" } });
    expect(porBusca).toHaveLength(1);
    expect(porBusca[0].autorId).toBe(DIRETORA.id);
  });

  it("isola notas por empresa (tenant)", async () => {
    const licId = seedLicitacao();
    await criarNota({ licitacaoId: licId, tenantId: TENANT, user: DIRETORA, input: { texto: "Nota da empresa A", mencionadosIds: [] } });
    const outraEmpresa = await listarNotas({ licitacaoId: licId, tenantId: "tenant_outra_empresa", user: DIRETORA });
    expect(outraEmpresa).toHaveLength(0);
  });

  it("retorna 404 para licitação inexistente", async () => {
    await expect(
      listarNotas({ licitacaoId: "nao-existe", tenantId: TENANT, user: DIRETORA }),
    ).rejects.toBeInstanceOf(Error);
    await expect(
      criarNota({ licitacaoId: "nao-existe", tenantId: TENANT, user: DIRETORA, input: { texto: "x", mencionadosIds: [] } }),
    ).rejects.toBeDefined();
    expect(new LicitacaoNotasError("X", "y", 400).status).toBe(400);
  });
});

describe("Issue #36 — Notificações N6/N7 imediatas e N10 para usuários assignados", () => {
  beforeEach(() => {
    resetInMemoryLicitacoes();
    seedEquipe();
  });

  it("dispara N10_MOVIMENTACAO_LICITACAO para Coordenador e Membros Atribuídos ao mudar status, arquivos e datas", async () => {
    const licId = seedLicitacao();

    // Atribui Coordenador (ANALISTA) e Membro da Equipe (OPERADOR)
    await atualizarEquipe(
      licId,
      { responsavelId: ANALISTA.id, atribuidoIds: [OPERADOR.id] },
      DIRETORA,
      undefined,
      TENANT,
    );

    // 1. Mudança de status
    await atualizarKanbanStatus(
      licId,
      { status: "ANALISE_TECNICA" },
      DIRETORA,
      undefined,
      TENANT,
    );

    const n10AnalistaAfterStatus = listInMemoryNotificacoesUsuario(ANALISTA.id).filter(
      (n) => n.notificacao.tipo === "N10_MOVIMENTACAO_LICITACAO",
    );
    const n10OperadorAfterStatus = listInMemoryNotificacoesUsuario(OPERADOR.id).filter(
      (n) => n.notificacao.tipo === "N10_MOVIMENTACAO_LICITACAO",
    );
    expect(n10AnalistaAfterStatus).toHaveLength(1);
    expect(n10OperadorAfterStatus).toHaveLength(1);
    expect(n10AnalistaAfterStatus[0].notificacao.titulo).toMatch(/Alteração de Status/);

    // 2. Upload e remoção de arquivo do edital
    const arq = await adicionarArquivoEdital(
      licId,
      {
        nome: "Termo_Referencia_Retificado.pdf",
        tamanho: 204800,
        mimeType: "application/pdf",
        caminho: "/uploads/tr.pdf",
        tenantId: TENANT,
      },
      DIRETORA,
    );
    await removerArquivoEdital(licId, arq.id, DIRETORA);

    const n10AfterArquivos = listInMemoryNotificacoesUsuario(ANALISTA.id).filter(
      (n) => n.notificacao.tipo === "N10_MOVIMENTACAO_LICITACAO",
    );
    expect(n10AfterArquivos).toHaveLength(3);

    // 3. Mudança de datas
    await atualizarLicitacao(
      licId,
      { dataEncerramentoProposta: new Date("2026-12-22T14:00:00Z") },
      DIRETORA,
    );

    const n10AfterDatas = listInMemoryNotificacoesUsuario(OPERADOR.id).filter(
      (n) => n.notificacao.tipo === "N10_MOVIMENTACAO_LICITACAO",
    );
    expect(n10AfterDatas).toHaveLength(4);
    expect(n10AfterDatas[0].notificacao.titulo).toMatch(/Mudança de Datas/);
  });

  it("dispara N7 e N6 imediatamente ao cadastrar documento ou portal próximo do vencimento", async () => {
    const daquiDezDias = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

    await criarDocumento(
      {
        nome: "CND Estadual SEFAZ",
        categoria: "FISCAL_TRABALHISTA",
        semValidade: false,
        dataVencimento: daquiDezDias,
      },
      DIRETORA.id,
      TENANT,
    );

    const n7 = listInMemoryNotificacoesUsuario(ANALISTA.id).filter(
      (n) => n.notificacao.tipo === "N7_VENCIMENTO_DOCUMENTO",
    );
    expect(n7).toHaveLength(1);

    await criarPortal(
      {
        nome: "Bolsa Nacional de Compras (BNC)",
        url: "https://bnc.org.br",
        status: "CADASTRADO",
        periodicidade: "ANUAL",
        dataVencimento: daquiDezDias,
        aceitaRobo: true,
        exigeCertificadoDigital: true,
      },
      DIRETORA.id,
      TENANT,
    );

    const n6 = listInMemoryNotificacoesUsuario(DIRETORA.id).filter(
      (n) => n.notificacao.tipo === "N6_VENCIMENTO_PORTAL",
    );
    expect(n6).toHaveLength(1);
  });
});

describe("Issue #36 — Análise Assíncrona de Participação IA + PDF + Cota + Notificação N11", () => {
  beforeEach(() => {
    resetInMemoryLicitacoes();
    seedEquipe();
    inMemoryTenants.set(TENANT, {
      id: TENANT,
      razaoSocial: "Empresa Teste Básico",
      cnpj: "11.222.333/0001-44",
      plano: "BASICO",
      billingStatus: "ATIVA",
      maxCnpjs: 1,
      maxUsers: 5,
      ativo: true,
      criadoEm: new Date(),
      updatedAt: new Date(),
    });
  });

  it("incrementa a cota ao solicitar (0/5 → 1/5), gera PDF válido em background e notifica os assignados (N11)", async () => {
    const licId = seedLicitacao();
    await atualizarEquipe(
      licId,
      { responsavelId: ANALISTA.id, atribuidoIds: [OPERADOR.id] },
      DIRETORA,
      undefined,
      TENANT,
    );

    const refNovembro = new Date("2026-11-15T15:00:00Z");
    const cotaInicial = await obterStatusCotaAnaliseIA(TENANT, refNovembro);
    expect(cotaInicial.usadas).toBe(0);
    expect(cotaInicial.limite).toBe(5);

    const inicio = await iniciarAnaliseParticipacaoAssincrona(
      licId,
      { observacoes: "Verificar exigência de amostras no lote 1" },
      DIRETORA,
      undefined,
      TENANT,
      { referencia: refNovembro },
    );

    expect(inicio.status).toBe("PROCESSANDO");
    expect(inicio.cota.usadas).toBe(1);
    expect(inicio.cota.limite).toBe(5);

    // Aguarda conclusão do processamento assíncrono
    const concluida = await aguardarProcessamentoAnaliseIA(inicio.analiseId);
    expect(concluida).toBeTruthy();
    expect(concluida.status).toBe("CONCLUIDO");
    expect(concluida.pdfBase64).toBeTruthy();
    expect(concluida.pdfNome).toMatch(/\.pdf$/);

    const pdfDecoded = Buffer.from(concluida.pdfBase64, "base64").toString("ascii");
    expect(pdfDecoded.startsWith("%PDF-1.4")).toBe(true);
    expect(pdfDecoded).toContain("RELATORIO EXECUTIVO DE PARTICIPACAO E VIABILIDADE");
    expect(pdfDecoded).toContain("%%EOF");

    // Verifica que N11_RELATORIO_IA_PRONTO foi enviada para Coordenador, Membro e Solicitante
    for (const uid of [ANALISTA.id, OPERADOR.id, DIRETORA.id]) {
      const n11 = listInMemoryNotificacoesUsuario(uid).filter(
        (n) => n.notificacao.tipo === "N11_RELATORIO_IA_PRONTO",
      );
      expect(n11).toHaveLength(1);
      expect(n11[0].notificacao.linkDestino).toBe(`/oportunidades/${licId}?aba=historico-ia`);
    }

    // Verifica recuperação por ID e reset no mês seguinte
    const buscada = await obterAnaliseIAPorId(licId, inicio.analiseId, TENANT);
    expect(buscada?.id).toBe(inicio.analiseId);

    const refDezembro = new Date("2026-12-02T15:00:00Z");
    const cotaDezembro = await obterStatusCotaAnaliseIA(TENANT, refDezembro);
    expect(cotaDezembro.usadas).toBe(0);
    expect(cotaDezembro.limite).toBe(5);
  });

  it("bloqueia a 6ª solicitação no plano Básico (5/5) recomendando upgrade de plano", async () => {
    const licId = seedLicitacao();
    const refNovembro = new Date("2026-11-15T15:00:00Z");

    for (let i = 0; i < 5; i++) {
      const r = await iniciarAnaliseParticipacaoAssincrona(
        licId,
        {},
        DIRETORA,
        undefined,
        TENANT,
        { referencia: refNovembro, aguardarConclusao: true },
      );
      expect(r.cota.usadas).toBe(i + 1);
    }

    await expect(
      iniciarAnaliseParticipacaoAssincrona(
        licId,
        {},
        DIRETORA,
        undefined,
        TENANT,
        { referencia: refNovembro },
      ),
    ).rejects.toMatchObject({
      code: "COTA_MENSAL_IA_ATINGIDA",
      status: 403,
    });
  });
});
