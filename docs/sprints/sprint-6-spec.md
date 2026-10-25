# Especificação da Sprint 6: Configurações, Trilha de Auditoria & Hardening v1.0

> **Épico no Paperclip:** `AV-80`  
> **Status:** Em Execução (TDD Estrito)  
> **Responsáveis:** Squad de Engenharia  
> **Referências:** PRD §4.11, §7, Anexo 4, ADR 0006 e Lei nº 14.133/2021.

---

## 1. Escopo Funcional & Critérios de Aceite

### 1.1. Configurações Corporativas (`/configuracoes`)
- **Aba 1: Perfil do Usuário**
  - Exibição dos dados do usuário logado (Nome, E-mail, Papel, Data de Criação).
  - Preferências visuais (Tema Claro/Escuro sincronizado com localStorage).
- **Aba 2: Dados da Empresa Licitante**
  - Cadastro societário: Razão Social, CNPJ, Inscrição Estadual, CNAE Principal, Endereço Completo da Sede.
  - Dados do Representante Legal (Nome, CPF, RG, Cargo).
  - Dados Bancários para propostas (Banco, Agência, Conta Corrente, Chave Pix).
  - Botão de salvamento com auditoria imediata.
- **Aba 3: Gestão de Equipe & RBAC (Anexo 4 do PRD)**
  - Tabela com todos os usuários do sistema.
  - Colunas: Nome, E-mail, Papel (`DIRETORIA`, `ANALISTA_COMERCIAL`, `OPERADOR_TECNICO`), Status (`Ativo`/`Inativo`), Data de Criação e Ações.
  - Modal para adicionar colaborador e modal para alterar papel/status.
  - Somente usuários com role `DIRETORIA` podem criar ou alterar colaboradores.
- **Aba 4: Trilha de Auditoria Corporativa (`audit_log`)**
  - Tabela Carbon com paginação e filtros por:
    - Entidade (`LICITACAO`, `PORTAL`, `DOCUMENTO`, `DECLARACAO`, `IMPUGNACAO`, `CONFIGURACAO`, `USUARIO`).
    - Ação (`CREATE`, `UPDATE`, `DELETE`, `MOVE_KANBAN`, `DECIDE_GO_NOGO`, `LOGIN`, etc.).
    - Busca textual por termo ou ID de entidade.
  - Expansão de linha ou modal de visualização de diff JSON (`antes` vs `depois`).
  - Botão "Exportar Relatório CSV" sanitizado contra injeção de fórmulas.

---

## 2. Contratos de Dados & Schemas Zod

### 2.1. Empresa
```typescript
export const configuracaoEmpresaSchema = z.object({
  razaoSocial: z.string().min(2),
  cnpj: z.string().min(14),
  inscricaoEstadual: z.string().optional().nullable(),
  cnae: z.string().optional().nullable(),
  endereco: z.string().min(5),
  cidade: z.string().min(2),
  uf: z.string().length(2),
  cep: z.string().min(8),
  representanteNome: z.string().min(2),
  representanteCpf: z.string().min(11),
  representanteRg: z.string().optional().nullable(),
  representanteCargo: z.string().min(2),
  bancoNome: z.string().optional().nullable(),
  agencia: z.string().optional().nullable(),
  contaCorrente: z.string().optional().nullable(),
  chavePix: z.string().optional().nullable(),
});
```

### 2.2. Equipe
```typescript
export const usuarioRoleSchema = z.enum(["DIRETORIA", "ANALISTA_COMERCIAL", "OPERADOR_TECNICO"]);
```

### 2.3. Auditoria
```typescript
export const auditViewerQuerySchema = z.object({
  entidadeTipo: z.string().optional(),
  acao: z.string().optional(),
  busca: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(15),
});
```
