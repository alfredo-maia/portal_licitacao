import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let val = match[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));

async function main() {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME || "portal-licitacoes";
  const publicDomain = process.env.CLOUDFLARE_R2_PUBLIC_DOMAIN;

  console.log("Configurações detectadas:");
  console.log(`- Account ID: ${accountId}`);
  console.log(`- Bucket: ${bucketName}`);
  console.log(`- Public Domain: ${publicDomain}`);
  console.log(`- Endpoint S3: https://${accountId}.r2.cloudflarestorage.com`);

  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: accessKeyId || "",
      secretAccessKey: secretAccessKey || "",
    },
  });

  const chave = "testes/teste-conexao-r2.pdf";
  const conteudo = Buffer.from(
    "%PDF-1.4\n" +
    "1 0 obj << /Title (Teste Cloudflare R2) /Author (Squad Antigravity) >> endobj\n" +
    "stream\n" +
    "Conexao com Cloudflare R2 efetuada com sucesso pelo Portal de Licitacoes!\n" +
    "endstream\n" +
    "endobj\n"
  );

  console.log(`\n1. Enviando arquivo de teste '${chave}' para o bucket '${bucketName}'...`);
  const putResult = await s3.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: chave,
      Body: conteudo,
      ContentType: "application/pdf",
      Metadata: {
        ambiente: "teste-live",
        criadoPor: "Squad Antigravity",
      },
    }),
  );

  console.log("Upload concluído com sucesso!");
  console.log("ETag retornado:", putResult.ETag);

  console.log("\n2. Verificando existência do arquivo no bucket via HeadObject...");
  const headResult = await s3.send(
    new HeadObjectCommand({
      Bucket: bucketName,
      Key: chave,
    }),
  );

  console.log("Arquivo confirmado no bucket!");
  console.log(`- Content-Type: ${headResult.ContentType}`);
  console.log(`- Tamanho: ${headResult.ContentLength} bytes`);
  console.log(`- Modificado em: ${headResult.LastModified}`);

  const urlPublica = `${publicDomain?.replace(/\/+$/, "")}/${chave}`;
  console.log(`\n3. Testando download direto via URL Pública: ${urlPublica}`);

  try {
    const res = await fetch(urlPublica);
    console.log(`- Status HTTP da URL Pública: ${res.status} ${res.statusText}`);
    if (res.ok) {
      console.log("\n>>> SUCESSO TOTAL! O arquivo já está acessível publicamente via CDN Cloudflare. <<<");
    } else {
      console.log(`Nota: Status ${res.status}. Se acabou de ativar o domínio público, pode levar alguns segundos para propagar.`);
    }
  } catch (err: any) {
    console.log("Erro ao testar fetch da URL pública:", err.message);
  }
}

main().catch((err) => {
  console.error("ERRO na conexão com o Cloudflare R2:", err);
  process.exit(1);
});
