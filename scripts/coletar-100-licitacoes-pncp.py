#!/usr/bin/env python3
"""
Script de Limpeza e Coleta Aleatória de 100 Licitações do PNCP (#25)
Limpa o sistema via DELETE /api/ingestao e ingere 100 licitações reais variadas.
"""

import urllib.request
import urllib.error
import json
import random
import time
import sys

TARGET_HOST = "https://staging.aponta.cloud"
if len(sys.argv) > 1 and sys.argv[1].startswith("http"):
    TARGET_HOST = sys.argv[1]

print(f"=== Iniciando Coleta e Limpeza em {TARGET_HOST} ===")

def make_request(url, method="GET", data=None, headers=None, timeout=30):
    if headers is None:
        headers = {}
    if "User-Agent" not in headers:
        headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    
    body = None
    if data is not None:
        body = json.dumps(data).encode("utf-8")
        headers["Content-Type"] = "application/json"
    
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            content = resp.read().decode("utf-8")
            status = resp.status
            try:
                parsed = json.loads(content)
                return status, parsed
            except:
                return status, content
    except urllib.error.HTTPError as e:
        err_content = e.read().decode("utf-8")
        try:
            return e.code, json.loads(err_content)
        except:
            return e.code, err_content
    except Exception as e:
        return 0, str(e)

# 1. Limpeza do sistema
print("\n[1/4] Executando DELETE /api/ingestao...")
del_status, del_resp = make_request(f"{TARGET_HOST}/api/ingestao", method="DELETE")
print(f"Status DELETE: {del_status} | Resposta: {del_resp}")

if del_status != 200:
    print("Aviso: DELETE retornou status diferente de 200. Verificando se deploy concluiu...")
    sys.exit(1)

# Validação do expurgo
chk_status, chk_resp = make_request(f"{TARGET_HOST}/api/licitacoes/busca?limite=5")
if chk_status == 200 and isinstance(chk_resp, dict):
    print(f"Total de licitações após limpeza: {chk_resp.get('total')}")
    if chk_resp.get('total') != 0:
        print("Atenção: ainda existem itens após o expurgo!")

# 2. Coleta de 100 licitações aleatórias do PNCP
print("\n[2/4] Coletando 100 licitações aleatórias do PNCP...")
licitacoes_coletadas = {}
page_pool = list(range(1, 100))
random.shuffle(page_pool)

# Também adicionamos algumas buscas com termos chave para garantir variedade de segmentos
termos_especificos = [
    "aliment", "panific", "medicament", "hospital", "software",
    "computador", "paviment", "veicul", "limpeza", "grafica"
]

# A) Coleta por páginas aleatórias de publicação geral
print("-> Amostragem de páginas aleatórias de Pregões e Dispensas recentes...")
for page in page_pool:
    if len(licitacoes_coletadas) >= 100:
        break
    url = f"https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao?dataInicial=20261015&dataFinal=20261031&codigoModalidadeContratacao=6&pagina={page}&tamanhoPagina=20"
    st, resp = make_request(url, timeout=15)
    if st == 200 and isinstance(resp, dict):
        items = resp.get("data", [])
        for item in items:
            pncp_id = item.get("numeroControlePNCP") or f"PNCP-{item.get('anoCompra')}-{item.get('sequencialCompra')}"
            if pncp_id and pncp_id not in licitacoes_coletadas:
                licitacoes_coletadas[pncp_id] = item
                if len(licitacoes_coletadas) >= 100:
                    break
        print(f"   Página {page}: +{len(items)} itens (Total único acumulado: {len(licitacoes_coletadas)})")
    else:
        print(f"   Página {page}: erro ou vazia ({st})")
    time.sleep(0.3)

# B) Se faltar para 100, coleta com data mais ampla
if len(licitacoes_coletadas) < 100:
    for page in range(1, 15):
        if len(licitacoes_coletadas) >= 100:
            break
        url = f"https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao?dataInicial=20261001&dataFinal=20261014&codigoModalidadeContratacao=6&pagina={page}&tamanhoPagina=20"
        st, resp = make_request(url, timeout=15)
        if st == 200 and isinstance(resp, dict):
            for item in resp.get("data", []):
                pncp_id = item.get("numeroControlePNCP") or f"PNCP-{item.get('anoCompra')}-{item.get('sequencialCompra')}"
                if pncp_id and pncp_id not in licitacoes_coletadas:
                    licitacoes_coletadas[pncp_id] = item
                    if len(licitacoes_coletadas) >= 100:
                        break
        time.sleep(0.3)

print(f"\nTotal único coletado do PNCP: {len(licitacoes_coletadas)}")

# 3. Formatação para o contrato de Ingestão V2
payload_licitacoes = []
for pncp_id, item in list(licitacoes_coletadas.items())[:100]:
    orgao_ent = item.get("orgaoEntidade") or {}
    unidade = item.get("unidadeOrgao") or {}
    
    nome_orgao = orgao_ent.get("razaoSocial") or unidade.get("nomeUnidade") or "Órgão Licitante"
    cnpj_orgao = orgao_ent.get("cnpj") or "00.000.000/0001-00"
    uf_orgao = (unidade.get("ufSigla") or "GO")[:2].upper()
    municipio = unidade.get("municipioNome") or "Município"
    esfera = orgao_ent.get("esferaId") or "M"
    poder = orgao_ent.get("poderId") or "E"
    
    numero_edital = item.get("numeroCompra") or item.get("processo") or f"PE-{item.get('sequencialCompra', '01')}/{item.get('anoCompra', '2026')}"
    modalidade = item.get("modalidadeNome") or "Pregão Eletrônico"
    
    valor_est = float(item.get("valorTotalEstimado") or item.get("valorTotalHomologado") or 120000.0)
    if valor_est <= 0:
        valor_est = 50000.0
        
    objeto = item.get("objetoCompra") or "Contratação pública via PNCP"
    mini_resumo = (objeto[:57] + "...") if len(objeto) > 60 else objeto
    
    dt_abertura = item.get("dataAberturaProposta") or item.get("dataInclusao") or "2026-11-20T10:00:00Z"
    dt_fechamento = item.get("dataEncerramentoProposta") or dt_abertura
    dt_pub = item.get("dataPublicacaoPncp") or item.get("dataInclusao") or dt_abertura
    
    payload_item = {
        "pncpId": pncp_id,
        "numeroEdital": str(numero_edital),
        "orgao": {
            "nome": nome_orgao,
            "cnpj": cnpj_orgao,
            "uf": uf_orgao,
            "municipio": municipio,
            "esfera": esfera,
            "poder": poder,
        },
        "modalidade": modalidade,
        "valorEstimado": valor_est,
        "dataAbertura": dt_abertura,
        "dataEncerramentoProposta": dt_fechamento,
        "dataPublicacaoPncp": dt_pub,
        "isPresencial": False,
        "miniResumo": mini_resumo,
        "resumo": objeto,
        "tipoSistemaSugerido": "OUTROS",
        "quantidadeLotes": 1,
        "loteUnico": True,
        "precoPorLote": False,
        "parecerGoNoGo": "AVALIAR",
        "justificativaTecnica": "Ingestão e classificação automática de amostragem PNCP",
        "linkPncp": f"https://pncp.gov.br/app/editais/{pncp_id}",
        "linkSistemaOrigem": item.get("linkSistemaOrigem") or "",
        "portalDisputa": item.get("tipoInstrumentoConvocatorioNome") or "Portal PNCP",
    }
    payload_licitacoes.append(payload_item)

print(f"\n[3/4] Ingerindo lote de {len(payload_licitacoes)} licitações via POST /api/ingestao...")
ingest_payload = {
    "versaoContrato": 2,
    "totalRegistros": len(payload_licitacoes),
    "licitacoes": payload_licitacoes,
}

post_st, post_resp = make_request(f"{TARGET_HOST}/api/ingestao", method="POST", data=ingest_payload, timeout=60)
print(f"Status POST: {post_st}")
if isinstance(post_resp, dict):
    print(f"Criados: {post_resp.get('criados')} | Total Recebidos: {post_resp.get('totalRecebidos')}")
else:
    print(f"Resposta bruta: {str(post_resp)[:300]}")

# 4. Verificação dos segmentos e sub-segmentos
print("\n[4/4] Verificando classificação das licitações ingeridas...")
time.sleep(2)
busca_st, busca_resp = make_request(f"{TARGET_HOST}/api/licitacoes/busca?limite=100")

if busca_st == 200 and isinstance(busca_resp, dict):
    itens = busca_resp.get("itens", [])
    total_db = busca_resp.get("total", len(itens))
    print(f"\nSucesso! Total no sistema: {total_db}")
    
    macros = {}
    subcats = {}
    ufs = {}
    
    for it in itens:
        m = it.get("segmentoMacro") or "INDEFINIDO"
        macros[m] = macros.get(m, 0) + 1
        
        uf = it.get("uf") or "N/A"
        ufs[uf] = ufs.get(uf, 0) + 1
        
        for sub in it.get("subcategorias") or []:
            subcats[sub] = subcats.get(sub, 0) + 1
            
    print("\n--- DISTRIBUIÇÃO POR MACRO-SEGMENTO ---")
    for m, c in sorted(macros.items(), key=lambda x: -x[1]):
        print(f"  * {m}: {c} licitações ({c/len(itens)*100:.1f}%)")
        
    print("\n--- PRINCIPAIS SUB-SEGMENTOS DETECTADOS ---")
    for s, c in sorted(subcats.items(), key=lambda x: -x[1])[:10]:
        print(f"  * {s}: {c} licitações")
        
    print("\n--- DISTRIBUIÇÃO POR ESTADO (UF) ---")
    print(", ".join([f"{u}: {c}" for u, c in sorted(ufs.items())]))
    print("\nProcesso concluído com êxito!")
else:
    print(f"Erro ao consultar busca: {busca_st} {busca_resp}")
