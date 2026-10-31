import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resetInMemoryLicitacoes,
  insertInMemoryLicitacao,
  insertInMemoryUsuario,
} from "@/server/services/licitacoes-store";
import {
  getOportunidadeById,
  atualizarEquipe,
  adicionarArquivoEdital,
  removerArquivoEdital,
  buscarESincronizarArquivosEditalPncp,
} from "@/server/services/oportunidades.service";
import {
  criarDocumento,
  listarDocumentos,
  obterDocumento,
} from "@/server/services/documentos.service";
import { prisma } from "@/lib/prisma";

describe("Sprint New - Task 5: Dossiê (Equipe & Arquivos) e Salvamento de Documentação", () => {
  beforeEach(() => {
    resetInMemoryLicitacoes();
    vi.restoreAllMocks();
  });

  it("deve salvar e retornar a Equipe Operacional (responsavel e atribuidos) no Dossiê mesmo para licitação em memória", async () => {
    const lic = insertInMemoryLicitacao({
      idPncp: "12345678000190-1-000777/2026",
      numeroControlePNCP: "12345678000190-1-000777/2026",
      numeroEdital: "PE 777/2026",
      orgaoNome: "Prefeitura Municipal de Teste",
      orgaoCnpj: "12345678000190",
      uf: "GO",
      municipio: "Goiânia",
      esfera: "M",
      poder: "E",
      modalidade: "Pregão Eletrônico",
      modalidadeCodigo: 6,
      portalDisputa: "Compras.gov.br",
      miniResumo: "Aquisição de equipamentos",
      resumo: "Aquisição de equipamentos de informática",
      valorEstimado: 150000,
      dataAbertura: new Date("2026-11-20T10:00:00Z"),
      dataEncerramentoProposta: new Date("2026-11-20T10:00:00Z"),
      dataPublicacaoPncp: new Date("2026-10-30T10:00:00Z"),
      dataUltimaAtualizacao: new Date("2026-10-30T10:00:00Z"),
      status: "PENDENTE",
      parecerIA: "GO",
      justificativaIA: null,
      tipoSistemaCodigo: "INFRAESTRUTURA_EQUIPAMENTOS",
      segmentoMacro: "TECNOLOGIA_TELECOM",
      subcategorias: ["INFRAESTRUTURA_EQUIPAMENTOS"],
      atestadosExigidos: [],
      motivoRecusa: null,
      quantidadeLotes: 1,
      loteUnico: true,
      precoPorLote: false,
      isPresencial: false,
      distanciaGoianiaKm: 0,
      linkPncp: null,
      linkSistemaOrigem: null,
      hashCritico: "hash_777",
      valorArrematado: null,
      responsavelId: null,
    });

    const novoMembro = insertInMemoryUsuario({
      id: "usr_colab_99",
      name: "Carlos Operador",
      email: "carlos@empresa.com.br",
      role: "OPERADOR_TECNICO",
      ativo: true,
    });

    const atualizado = await atualizarEquipe(lic.id, {
      responsavelId: "usr_dir_1",
      atribuidoIds: ["usr_dir_1", novoMembro.id],
    });

    expect(atualizado.responsavelId).toBe("usr_dir_1");
    expect(atualizado.responsavel?.name).toBe("Vítor Henrique");
    expect(atualizado.atribuidos).toHaveLength(2);
    expect(atualizado.atribuidos.map((a: any) => a.usuarioId)).toEqual(
      expect.arrayContaining(["usr_dir_1", "usr_colab_99"]),
    );

    const recarregado = await getOportunidadeById(lic.id);
    expect(recarregado.responsavelId).toBe("usr_dir_1");
    expect(recarregado.atribuidos).toHaveLength(2);
  });

  it("deve salvar e exibir arquivos enviados por upload e sincronizados do PNCP no Dossiê", async () => {
    const lic = insertInMemoryLicitacao({
      idPncp: "12345678000190-1-000888/2026",
      numeroControlePNCP: "12345678000190-1-000888/2026",
      numeroEdital: "PE 888/2026",
      orgaoNome: "Secretaria de Saúde",
      orgaoCnpj: "12345678000190",
      uf: "GO",
      municipio: "Goiânia",
      esfera: "E",
      poder: "E",
      modalidade: "Pregão Eletrônico",
      modalidadeCodigo: 6,
      portalDisputa: "Compras.gov.br",
      miniResumo: "Insumos hospitalares",
      resumo: "Aquisição de insumos hospitalares e medicamentos",
      valorEstimado: 250000,
      dataAbertura: new Date("2026-11-25T10:00:00Z"),
      dataEncerramentoProposta: new Date("2026-11-25T10:00:00Z"),
      dataPublicacaoPncp: new Date("2026-10-30T10:00:00Z"),
      dataUltimaAtualizacao: new Date("2026-10-30T10:00:00Z"),
      status: "PENDENTE",
      parecerIA: "GO",
      justificativaIA: null,
      tipoSistemaCodigo: "SAUDE_MEDICAMENTOS_FARMACIA",
      segmentoMacro: "SAUDE_ODONTOLOGIA",
      subcategorias: ["SAUDE_MEDICAMENTOS_FARMACIA"],
      atestadosExigidos: [],
      motivoRecusa: null,
      quantidadeLotes: 1,
      loteUnico: true,
      precoPorLote: false,
      isPresencial: false,
      distanciaGoianiaKm: 0,
      linkPncp: null,
      linkSistemaOrigem: null,
      hashCritico: "hash_888",
      valorArrematado: null,
      responsavelId: null,
    });

    const upload = await adicionarArquivoEdital(lic.id, {
      nome: "Proposta_Comercial.pdf",
      tamanho: 512000,
      mimeType: "application/pdf",
      caminho: "/uploads/editais/Proposta_Comercial.pdf",
    });
    expect(upload.nome).toBe("Proposta_Comercial.pdf");

    // Simula sincronização PNCP (usando fallback quando fetch externo falha)
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("Offline"));
    const syncRes = await buscarESincronizarArquivosEditalPncp(lic.id);
    expect(syncRes.ok).toBe(true);
    expect(syncRes.sincronizados).toBeGreaterThanOrEqual(2);

    const dossie = await getOportunidadeById(lic.id);
    expect(dossie.arquivos.length).toBeGreaterThanOrEqual(3);
    expect(dossie.arquivos.map((a: any) => a.nome)).toContain("Proposta_Comercial.pdf");

    // Remove o arquivo enviado
    await removerArquivoEdital(lic.id, upload.id);
    const dossieAposRemover = await getOportunidadeById(lic.id);
    expect(dossieAposRemover.arquivos.map((a: any) => a.id)).not.toContain(upload.id);
  });

  it("deve salvar novo documento em Documentação e retorná-lo na listagem mesmo quando criadoPorId falha por FK ou banco retorna vazio", async () => {
    // Simula o cenário real de produção: prisma.documento.create falha na 1ª tentativa com criadoPorId inexistente
    // e prisma.documento.findMany retorna [] se caiu no fallback em memória
    const createSpy = vi
      .spyOn(prisma.documento, "create")
      .mockRejectedValueOnce(new Error("Foreign key constraint failed on the field: documento_criadoPorId_fkey"))
      .mockRejectedValueOnce(new Error("DB offline"));
    vi.spyOn(prisma.documento, "count").mockResolvedValue(0 as any);
    vi.spyOn(prisma.documento, "findMany").mockResolvedValue([] as any);

    const novoDoc = await criarDocumento(
      {
        nome: "Certidão Negativa de Débitos Estaduais GO",
        categoria: "FISCAL_TRABALHISTA",
        orgaoEmissor: "SEFAZ-GO",
        semValidade: false,
        dataEmissao: new Date("2026-10-01"),
        dataVencimento: new Date("2026-12-31"),
        arquivoNome: "cnd_sefaz_go.pdf",
      },
      "usr_in_memory_only",
    );

    expect(novoDoc.id).toBeDefined();
    expect(novoDoc.nome).toBe("Certidão Negativa de Débitos Estaduais GO");
    expect(createSpy).toHaveBeenCalledTimes(2); // Tentou com criadoPorId e depois tentou com criadoPorId: null

    const lista = await listarDocumentos({ categoria: "FISCAL_TRABALHISTA", page: 1, pageSize: 10 });
    expect(lista.total).toBeGreaterThanOrEqual(1);
    expect(lista.documentos.map((d) => d.nome)).toContain("Certidão Negativa de Débitos Estaduais GO");

    const detalhe = await obterDocumento(novoDoc.id);
    expect(detalhe?.documento.nome).toBe("Certidão Negativa de Débitos Estaduais GO");
  });
});

