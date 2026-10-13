/**
 * @file Integração com PDF.js: validação do arquivo, extração de texto e renderização de páginas.
 * O worker é publicado junto à página (vendor/), pois o sandbox só permite workers do próprio domínio.
 */

import { createLogger } from '../core/logger.js';

const log = createLogger('pdf.extract');

export const MAX_PDF_BYTES = 20 * 1024 * 1024;
const WORKER_SRC = 'vendor/pdf.worker.min.js';
const LOAD_TIMEOUT_MS = 15000;

/**
 * @typedef {Object} TextoExtraido
 * @property {string} text   Texto com quebras de linha reconstruídas pela posição vertical.
 * @property {number} pages
 * @property {number} ms     Tempo de extração.
 */

/**
 * Erro com mensagem segura para o usuário final.
 */
export class PdfError extends Error {
  /**
   * @param {string} userMessage Mensagem exibível.
   * @param {string} code        Código interno para log.
   */
  constructor(userMessage, code) {
    super(userMessage);
    this.name = 'PdfError';
    this.code = code;
  }
}

/**
 * Retorna a lib PDF.js já configurada.
 * @returns {any}
 */
const getPdfJs = () => {
  const lib = window.pdfjsLib;
  if (!lib?.getDocument) throw new PdfError('O leitor de PDF não carregou. Recarregue a página e tente de novo.', 'LIB_MISSING');
  if (lib.GlobalWorkerOptions.workerSrc !== WORKER_SRC) lib.GlobalWorkerOptions.workerSrc = WORKER_SRC;
  return lib;
};

/**
 * Valida tipo, tamanho e assinatura binária (%PDF-) do arquivo enviado.
 * @param {File} file
 * @returns {Promise<Uint8Array>} Bytes do arquivo.
 */
export const lerArquivoPdf = async (file) => {
  if (!(file instanceof File)) throw new PdfError('Nenhum arquivo selecionado.', 'NO_FILE');
  const isPdfName = /\.pdf$/i.test(file.name);
  if (file.type && file.type !== 'application/pdf' && !isPdfName) {
    throw new PdfError('Envie o atestado em PDF.', 'BAD_TYPE');
  }
  if (file.size > MAX_PDF_BYTES) throw new PdfError('O arquivo passa de 20MB. Reduza o tamanho e envie de novo.', 'TOO_BIG');
  if (file.size === 0) throw new PdfError('O arquivo está vazio.', 'EMPTY');

  const bytes = new Uint8Array(await file.arrayBuffer());
  const magic = String.fromCharCode(...bytes.slice(0, 5));
  if (magic !== '%PDF-') throw new PdfError('O arquivo não é um PDF válido.', 'BAD_MAGIC');
  log.info('Arquivo PDF validado', { bytes: bytes.byteLength });
  return bytes;
};

/**
 * Abre o documento com timeout. Copia os bytes porque o PDF.js transfere o buffer ao worker.
 * @param {Uint8Array} bytes
 * @returns {Promise<any>} PDFDocumentProxy
 */
const abrirDocumento = async (bytes) => {
  const lib = getPdfJs();
  const task = lib.getDocument({ data: bytes.slice(), isEvalSupported: false });
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new PdfError('O PDF demorou demais para abrir.', 'TIMEOUT')), LOAD_TIMEOUT_MS);
  });
  try {
    return await Promise.race([task.promise, timeout]);
  } catch (err) {
    task.destroy?.();
    if (err instanceof PdfError) throw err;
    if (err?.name === 'PasswordException') throw new PdfError('O PDF está protegido por senha.', 'PASSWORD');
    throw new PdfError('Não foi possível ler este PDF. Ele pode estar corrompido.', 'OPEN_FAIL');
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Reconstrói linhas agrupando itens pela coordenada Y.
 * @param {Array<{str: string, transform: number[]}>} items
 * @returns {string}
 */
const itensParaLinhas = (items) => {
  /** @type {Map<number, Array<{x: number, str: string}>>} */
  const linhas = new Map();
  items.forEach((it) => {
    if (!it.str) return;
    const y = Math.round(it.transform[5]);
    const key = [...linhas.keys()].find((k) => Math.abs(k - y) <= 2) ?? y;
    if (!linhas.has(key)) linhas.set(key, []);
    linhas.get(key).push({ x: it.transform[4], str: it.str });
  });
  return [...linhas.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, parts]) => parts.sort((a, b) => a.x - b.x).map((p) => p.str).join(' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
};

/**
 * Extrai o texto de todas as páginas do PDF.
 * @param {Uint8Array} bytes
 * @returns {Promise<TextoExtraido>}
 */
export const extrairTexto = async (bytes) => {
  const done = log.time('extrairTexto');
  const doc = await abrirDocumento(bytes);
  try {
    const pageTexts = [];
    for (let n = 1; n <= doc.numPages; n += 1) {
      // Páginas são lidas em sequência para manter a ordem do texto.
      // eslint-disable-next-line no-await-in-loop
      const page = await doc.getPage(n);
      // eslint-disable-next-line no-await-in-loop
      const content = await page.getTextContent();
      pageTexts.push(itensParaLinhas(content.items));
    }
    const text = pageTexts.join('\n');
    const ms = done();
    log.info('Texto extraído', { pages: doc.numPages, chars: text.length, ms });
    return { text, pages: doc.numPages, ms };
  } finally {
    doc.destroy();
  }
};

/**
 * Renderiza as páginas em canvases dentro do contêiner.
 * @param {Uint8Array} bytes
 * @param {HTMLElement} container
 * @param {number} [cssWidth=640] Largura alvo em px CSS.
 * @returns {Promise<number>} Número de páginas renderizadas.
 */
export const renderizarPaginas = async (bytes, container, cssWidth = 640) => {
  const doc = await abrirDocumento(bytes);
  try {
    container.replaceChildren();
    const ratio = window.devicePixelRatio || 1;
    for (let n = 1; n <= Math.min(doc.numPages, 5); n += 1) {
      // eslint-disable-next-line no-await-in-loop
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (cssWidth / base.width) * ratio });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${cssWidth}px`;
      canvas.className = 'pdf-page';
      container.append(canvas);
      // eslint-disable-next-line no-await-in-loop
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    }
    return doc.numPages;
  } finally {
    doc.destroy();
  }
};
