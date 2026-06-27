#!/usr/bin/env node
// scripts/whatsapp-catalog/export-catalog.mjs
//
// Exporta o catálogo de um número de WhatsApp Business (não precisa ser o
// seu número — o catálogo é público, qualquer conta consegue consultar)
// para JSON e CSV, baixando também as imagens dos produtos.
//
// COMO USAR:
//   cd scripts/whatsapp-catalog
//   npm install                      (só na primeira vez)
//   npm run export -- --number=554799964885
//
// Na primeira execução vai aparecer um QR code no terminal. Escaneie com
// QUALQUER WhatsApp (não precisa ser o número da loja, pode ser o seu
// celular pessoal) em: Configurações > Dispositivos conectados > Conectar
// um dispositivo. Da segunda vez em diante não pede QR de novo (a sessão
// fica salva em ./auth_info — pasta que NUNCA deve ir pro Git).
//
// COMO FUNCIONA:
// O WhatsApp não tem um botão de "exportar catálogo". Mas o catálogo é
// público dentro do protocolo do WhatsApp Web, e a biblioteca Baileys
// (open source, não-oficial) sabe consultar isso através de getCatalog().
// É o mesmo mecanismo que ferramentas pagas (2Chat, Whapi etc.) usam por
// baixo dos panos.
//
// AVISO: como é um protocolo não documentado oficialmente, os nomes exatos
// de alguns campos podem variar. Por isso este script salva também o JSON
// "bruto" dos primeiros produtos em catalogo-whatsapp/raw-debug.json — se
// algum campo (preço, imagem) não saiu como esperado, dá pra olhar ali e
// ajustar as funções extractImageUrls/extractPriceBRL abaixo.

import makeWASocket, { useMultiFileAuthState, DisconnectReason } from 'baileys';
import qrcodeTerminal from 'qrcode-terminal';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'catalogo-whatsapp');
const IMAGES_DIR = path.join(OUT_DIR, 'images');
const AUTH_DIR = path.join(__dirname, 'auth_info');

const numberArg = process.argv.find((a) => a.startsWith('--number='));
const RAW_NUMBER = (numberArg ? numberArg.split('=')[1] : process.env.WHATSAPP_CATALOG_NUMBER || '554799964885').replace(/\D/g, '');
const JID = `${RAW_NUMBER}@s.whatsapp.net`;

fs.mkdirSync(IMAGES_DIR, { recursive: true });

function csvField(value) {
  const s = value === undefined || value === null ? '' : String(value);
  if (/[",\n;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function downloadImage(url, destPath) {
  return new Promise((resolve) => {
    if (!url) return resolve(false);
    const client = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    const req = client.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        file.close();
        fs.unlink(destPath, () => {});
        return resolve(false);
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(true)));
    });
    req.on('error', () => {
      file.close();
      fs.unlink(destPath, () => {});
      resolve(false);
    });
    req.setTimeout(20000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

// Os nomes de campo de imagem variam entre versões do protocolo — tentamos
// os formatos mais comuns vistos na lib.
function extractImageUrls(product) {
  const candidates = [];
  if (Array.isArray(product.imageUrls)) candidates.push(...product.imageUrls);
  if (Array.isArray(product.images)) {
    for (const img of product.images) {
      if (typeof img === 'string') candidates.push(img);
      else if (img?.url) candidates.push(img.url);
    }
  }
  if (product.productImage?.url) candidates.push(product.productImage.url);
  if (product.imageUrl) candidates.push(product.imageUrl);
  if (product.signedUrl) candidates.push(product.signedUrl);
  return [...new Set(candidates.filter(Boolean))];
}

// priceAmount1000 = preço multiplicado por 1000 (padrão do protocolo do WhatsApp)
function extractPriceBRL(product) {
  if (typeof product.priceAmount1000 === 'number') return product.priceAmount1000 / 1000;
  if (typeof product.price === 'number') {
    return product.price > 100000 ? product.price / 1000 : product.price;
  }
  return '';
}

async function fetchCatalog(sock) {
  const all = [];
  let cursor;
  for (let page = 0; page < 50; page++) {
    const { products, nextPageCursor } = await sock.getCatalog({ jid: JID, limit: 100, cursor });
    if (!products || products.length === 0) break;
    all.push(...products);
    if (!nextPageCursor) break;
    cursor = nextPageCursor;
  }

  if (all.length === 0) {
    console.warn(
      `\n⚠️  Nenhum produto encontrado para ${RAW_NUMBER}. Possíveis causas:\n` +
        '   - número errado ou sem o código do país (use --number=5547999999999)\n' +
        '   - catálogo vazio ou com visibilidade restrita\n' +
        '   - os nomes de campo do protocolo mudaram nesta versão do baileys\n'
    );
  }

  fs.writeFileSync(path.join(OUT_DIR, 'raw-debug.json'), JSON.stringify(all.slice(0, 3), null, 2));

  const rows = [];
  for (let i = 0; i < all.length; i++) {
    const p = all[i];
    const id = p.id || p.productId || `item_${i}`;
    const retailerId = p.retailerId || '';
    const nome = p.name || p.title || '';
    const descricao = (p.description || '').replace(/\r?\n/g, ' ');
    const preco = extractPriceBRL(p);
    const moeda = p.currency || p.currencyCode || 'BRL';
    const disponibilidade = p.isHidden === true ? 'oculto' : p.availability || 'disponivel';
    const urls = extractImageUrls(p);

    const localPaths = [];
    for (let j = 0; j < urls.length; j++) {
      const filename = `${(retailerId || id).toString().replace(/[^a-zA-Z0-9_-]/g, '_')}_${j}.jpg`;
      const dest = path.join(IMAGES_DIR, filename);
      const ok = await downloadImage(urls[j], dest);
      if (ok) localPaths.push(path.join('images', filename));
    }

    rows.push({
      id,
      retailerId,
      nome,
      descricao,
      preco,
      moeda,
      disponibilidade,
      imagens_locais: localPaths.join(';'),
      imagens_urls: urls.join(';'),
      // Colunas vazias propositalmente — preencha antes de importar pro site:
      categoria: '',
      tamanho: '',
      tecido: '',
      cor_hex: '',
      cor_nome: '',
      peso_kg: '',
      ativo: 'sim',
    });
    console.log(`  [${i + 1}/${all.length}] ${nome || '(sem nome)'} — ${localPaths.length} imagem(ns) baixada(s)`);
  }

  fs.writeFileSync(path.join(OUT_DIR, 'catalogo.json'), JSON.stringify(rows, null, 2));

  const headers = [
    'id', 'retailerId', 'nome', 'descricao', 'preco', 'moeda', 'disponibilidade',
    'imagens_locais', 'imagens_urls', 'categoria', 'tamanho', 'tecido', 'cor_hex', 'cor_nome', 'peso_kg', 'ativo',
  ];
  const csvLines = [headers.join(',')];
  for (const r of rows) csvLines.push(headers.map((h) => csvField(r[h])).join(','));
  fs.writeFileSync(path.join(OUT_DIR, 'catalogo.csv'), csvLines.join('\n'), 'utf8');

  console.log(`\n✅ Pronto! ${rows.length} produto(s) exportado(s) para:`);
  console.log('  ', path.join(OUT_DIR, 'catalogo.csv'), '(abra no Excel/Google Sheets)');
  console.log('  ', path.join(OUT_DIR, 'catalogo.json'));
  console.log('  ', IMAGES_DIR, '(imagens baixadas)');
  console.log('\nPróximo passo: abra o catalogo.csv e preencha categoria, tamanho, tecido, cor_hex, cor_nome e peso_kg antes de importar (veja o README.md).');
}

async function main() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const sock = makeWASocket({ auth: state, printQRInTerminal: false });
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\nEscaneie este QR code com o WhatsApp (Configurações > Dispositivos conectados > Conectar um dispositivo):\n');
      qrcodeTerminal.generate(qr, { small: true });
    }

    if (connection === 'open') {
      console.log(`✅ Conectado ao WhatsApp. Buscando catálogo de ${RAW_NUMBER}...`);
      try {
        await fetchCatalog(sock);
      } catch (err) {
        console.error('Erro ao buscar catálogo:', err);
      }
      await sock.end();
      process.exit(0);
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.error('❌ Sessão deslogada do WhatsApp. Apague a pasta auth_info e rode de novo para escanear o QR.');
        process.exit(1);
      } else {
        console.log('Conexão caiu, tentando reconectar...');
        main();
      }
    }
  });
}

main().catch((err) => {
  console.error('Erro:', err);
  process.exit(1);
});
