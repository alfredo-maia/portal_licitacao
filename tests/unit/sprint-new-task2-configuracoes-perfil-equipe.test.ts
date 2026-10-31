import { describe, it, expect, beforeEach } from "vitest";
import {
  obterMeuPerfil,
  atualizarMeuPerfil,
  listarEquipe,
  criarMembroEquipe,
} from "@/server/services/configuracoes.service";
import { authorizeCredentials } from "@/server/auth";

describe("Sprint New — Task 2: Configurações (Meu Perfil, CPF, Equipe e Multi-CNPJ)", () => {
  it("obterMeuPerfil deve retornar o e-mail real da sessão (ex: vitorhenrique018@gmail.com) e nunca usuario@empresa.com.br", async () => {
    const perfil = await obterMeuPerfil("id_inexistente_sessao", {
      email: "vitorhenrique018@gmail.com",
      name: "Vítor Henrique",
    });

    expect(perfil.email).toBe("vitorhenrique018@gmail.com");
    expect(perfil.name).toBe("Vítor Henrique");
    expect(perfil.email).not.toBe("usuario@empresa.com.br");
  });

  it("atualizarMeuPerfil deve rejeitar CPF inválido usando isValidCpf", async () => {
    await expect(
      atualizarMeuPerfil(
        "usr_teste_cpf",
        {
          name: "Vítor Henrique",
          cpf: "111.111.111-11",
        },
        {
          email: "vitorhenrique018@gmail.com",
          name: "Vítor Henrique",
        },
      ),
    ).rejects.toThrow(/CPF inválido/i);
  });

  it("atualizarMeuPerfil deve persistir Nome, CPF válido, Endereço e Senha e manter os dados ao recarregar obterMeuPerfil", async () => {
    const cpfValido = "529.982.247-25";
    await atualizarMeuPerfil(
      "usr_persist_test",
      {
        name: "Vítor Henrique Atualizado",
        cpf: cpfValido,
        telefone: "(62) 99999-8888",
        cep: "74115-030",
        logradouro: "Av. República do Líbano",
        numero: "1200",
        complemento: "Sala 10",
        bairro: "Setor Oeste",
        cidade: "Goiânia",
        uf: "GO",
      },
      {
        email: "vitorhenrique018@gmail.com",
        name: "Vítor Henrique",
      },
    );

    const recarregado = await obterMeuPerfil("usr_persist_test", {
      email: "vitorhenrique018@gmail.com",
      name: "Vítor Henrique",
    });

    expect(recarregado.name).toBe("Vítor Henrique Atualizado");
    expect(recarregado.cpf).toBe(cpfValido);
    expect(recarregado.cep).toBe("74115-030");
    expect(recarregado.logradouro).toBe("Av. República do Líbano");
    expect(recarregado.numero).toBe("1200");
    expect(recarregado.cidade).toBe("Goiânia");
    expect(recarregado.uf).toBe("GO");
  });

  it("listarEquipe deve sempre incluir o próprio usuário logado do sistema e permitir criar novo colaborador que faz login", async () => {
    const tenantId = "tenant_equipe_sprint_new";
    const currentUser = {
      id: "usr_titular_sprint_new",
      name: "Vítor Titular",
      email: "vitorhenrique018@gmail.com",
      role: "DIRETORIA",
    };

    const listagemInicial = await listarEquipe(tenantId, currentUser);
    expect(
      listagemInicial.usuarios.some(
        (u) => u.email.toLowerCase() === "vitorhenrique018@gmail.com",
      ),
    ).toBe(true);

    const novoColaborador = await criarMembroEquipe(
      {
        name: "João Analista",
        email: "joao.analista@empresa.com.br",
        role: "ANALISTA_COMERCIAL",
        password: " Senh@Forte123 ".trim(),
        ativo: true,
      },
      currentUser.id,
      { id: currentUser.id, role: "DIRETORIA" },
      tenantId,
    );

    expect(novoColaborador.email).toBe("joao.analista@empresa.com.br");

    const listagemAposCriacao = await listarEquipe(tenantId, currentUser);
    expect(
      listagemAposCriacao.usuarios.some(
        (u) => u.email.toLowerCase() === "joao.analista@empresa.com.br",
      ),
    ).toBe(true);

    // O novo colaborador deve conseguir autenticar imediatamente
    const sessaoColaborador = await authorizeCredentials({
      email: "joao.analista@empresa.com.br",
      password: "Senh@Forte123",
    });
    expect(sessaoColaborador).not.toBeNull();
    expect(sessaoColaborador?.email).toBe("joao.analista@empresa.com.br");
  });
});

