/**
 * @file Parser puro do texto de atestados médicos (pt-BR).
 * Recebe o texto extraído do PDF e devolve campos estruturados com confiança por campo.
 * Não acessa DOM nem rede: testável isoladamente.
 */

import { brToIso, digits, normalize } from '../core/format.js';

/**
 * @typedef {Object} CampoExtraido
 * @property {string|number|null} value
 * @property {number} confidence 0 (não encontrado) a 1 (rótulo explícito).
 * @property {string} [source]   Trecho que originou o valor (para auditoria visual).
 */

/**
 * @typedef {Object} AtestadoExtraido
 * @property {CampoExtraido} nome
 * @property {CampoExtraido} cpf
 * @property {CampoExtraido} cid
 * @property {CampoExtraido} dias
 * @property {CampoExtraido} dataInicio  ISO.
 * @property {CampoExtraido} dataEmissao ISO.
 * @property {CampoExtraido} medico
 * @property {CampoExtraido} crm
 * @property {number} chars Tamanho do texto analisado.
 */

const NUMEROS_EXTENSO = Object.freeze({
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, vinte: 20, trinta: 30,
});

const MESES = Object.freeze({
  janeiro: '01', fevereiro: '02', marco: '03', abril: '04', maio: '05', junho: '06',
  julho: '07', agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12',
});

/**
 * @param {string|number|null} value
 * @param {number} confidence
 * @param {string} [source]
 * @returns {CampoExtraido}
 */
const campo = (value, confidence, source) => ({ value, confidence: value === null ? 0 : confidence, source });

/**
 * Primeiro grupo de captura que casar entre várias regex, com a confiança associada.
 * @param {string} text
 * @param {Array<[RegExp, number]>} patterns
 * @returns {{match: RegExpExecArray, confidence: number}|null}
 */
const firstMatch = (text, patterns) => {
  for (let i = 0; i < patterns.length; i += 1) {
    const [re, confidence] = patterns[i];
    const match = re.exec(text);
    if (match) return { match, confidence };
  }
  return null;
};

/**
 * Limpa nome capturado (remove títulos, espaços extras e pontuação final).
 * @param {string} raw
 * @returns {string}
 */
const limparNome = (raw) => raw
  .replace(/\b(sr|sra|srta)\.?\s*(\(a\))?\.?/gi, '')
  .replace(/[,.;:]+$/, '')
  .replace(/\s+/g, ' ')
  .trim();

/** @param {string} text @returns {CampoExtraido} */
const extrairNome = (text) => {
  const found = firstMatch(text, [
    [/(?:paciente|nome(?: do paciente)?)\s*[:\-]\s*([A-ZÀ-Ý][A-Za-zÀ-ÿ' ]{4,80}?)(?=\s*(?:\n|CPF|RG|Data|Idade|$))/i, 0.95],
    [/atesto[^.]{0,40}?que\s+(?:o\s*\(a\)\s*|a\s+|o\s+)?(?:sr\.?\s*\(a\)\.?|sra?\.?|senhora?)?\s*([A-ZÀ-Ý][A-Za-zÀ-ÿ' ]{4,80}?)(?=,|\s+portador|\s+inscrit|\s+CPF|\s+esteve|\s+foi)/i, 0.85],
  ]);
  if (!found) return campo(null, 0);
  const nome = limparNome(found.match[1]);
  return nome.split(' ').length >= 2 ? campo(nome, found.confidence, found.match[0].slice(0, 80)) : campo(null, 0);
};

/** @param {string} text @returns {CampoExtraido} */
const extrairCpf = (text) => {
  const match = /(?:CPF\s*(?:n[ºo°.]?\s*)?[:\-]?\s*)?(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/i.exec(text);
  return match ? campo(digits(match[1]), /CPF/i.test(match[0]) ? 0.95 : 0.6, match[0]) : campo(null, 0);
};

/** @param {string} text @returns {CampoExtraido} */
const extrairCid = (text) => {
  const found = firstMatch(text, [
    [/C\.?I\.?D\.?(?:[\s-]*10)?\s*[:\-–]?\s*([A-TV-Z]\d{2}(?:\.\d)?)\b/i, 0.95],
    [/\b([A-TV-Z]\d{2}\.\d)\b/, 0.55],
  ]);
  return found ? campo(found.match[1].toUpperCase(), found.confidence, found.match[0]) : campo(null, 0);
};

/**
 * Converte "03", "3" ou "três" em número.
 * @param {string} token
 * @returns {number|null}
 */
const toNumber = (token) => {
  if (/^\d{1,3}$/.test(token)) return Number(token);
  return NUMEROS_EXTENSO[normalize(token)] ?? null;
};

/** @param {string} text @returns {CampoExtraido} */
const extrairDias = (text) => {
  const found = firstMatch(text, [
    [/(?:afastamento|afastad[oa]|repouso|per[ií]odo(?: de afastamento)?|necessitando de)[^\d\n]{0,40}?(\d{1,3})\s*(?:\([a-zà-ú\s]+\)\s*)?dias?/i, 0.95],
    [/(?:afastamento|repouso|necessitando de)[^\n]{0,30}?\b(um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|vinte|trinta)\s+dias?/i, 0.85],
    [/\b(\d{1,3})\s*(?:\([a-zà-ú\s]+\)\s*)?dias?\b/i, 0.55],
  ]);
  if (!found) return campo(null, 0);
  const n = toNumber(found.match[1]);
  return n && n > 0 && n <= 365 ? campo(n, found.confidence, found.match[0]) : campo(null, 0);
};

/**
 * Converte "12 de outubro de 2026" em ISO.
 * @param {string} text
 * @returns {{iso: string, source: string}|null}
 */
const dataPorExtenso = (text) => {
  const match = /(\d{1,2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})/i.exec(normalize(text));
  if (!match) return null;
  const mes = MESES[match[2]];
  if (!mes) return null;
  const iso = brToIso(`${match[1].padStart(2, '0')}/${mes}/${match[3]}`);
  return iso ? { iso, source: match[0] } : null;
};

/** @param {string} text @returns {CampoExtraido} */
const extrairDataInicio = (text) => {
  const found = firstMatch(text, [
    [/(?:a partir d[eao]|a contar d[eao]|in[ií]cio(?: do afastamento)?|desde)\s*(?:o dia|dia)?\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i, 0.95],
    [/(?:data do atendimento|atendid[oa] em|consulta em)\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i, 0.75],
    [/(\d{2}\/\d{2}\/\d{4})/, 0.5],
  ]);
  if (found) {
    const iso = brToIso(found.match[1]);
    if (iso) return campo(iso, found.confidence, found.match[0]);
  }
  const ext = dataPorExtenso(text);
  return ext ? campo(ext.iso, 0.5, ext.source) : campo(null, 0);
};

/** @param {string} text @returns {CampoExtraido} */
const extrairDataEmissao = (text) => {
  const labeled = /(?:data(?: de emiss[aã]o)?|emitido em)\s*[:\-]\s*(\d{2}\/\d{2}\/\d{4})/i.exec(text);
  if (labeled) {
    const iso = brToIso(labeled[1]);
    if (iso) return campo(iso, 0.9, labeled[0]);
  }
  const ext = dataPorExtenso(text);
  if (ext) return campo(ext.iso, 0.85, ext.source);
  const all = [...text.matchAll(/(\d{2}\/\d{2}\/\d{4})/g)];
  const last = all.length ? brToIso(all[all.length - 1][1]) : null;
  return last ? campo(last, 0.5, all[all.length - 1][0]) : campo(null, 0);
};

/** @param {string} text @returns {CampoExtraido} */
const extrairMedico = (text) => {
  const match = /\b(Dra?\.[ ]*[A-ZÀ-Ý][a-zà-ÿ]+(?:[ ]+(?:d[aeo]s?[ ]+)?[A-ZÀ-Ý][a-zà-ÿ]+){1,4})/.exec(text);
  return match ? campo(match[1].replace(/\s+/g, ' ').trim(), 0.85, match[0]) : campo(null, 0);
};

/** @param {string} text @returns {CampoExtraido} */
const extrairCrm = (text) => {
  const match = /CRM\s*[-/]?\s*([A-Z]{2})?\s*[-/:nº°]*\s*(\d{4,7})(?:\s*[-/]\s*([A-Z]{2}))?/i.exec(text);
  if (!match) return campo(null, 0);
  const uf = (match[1] || match[3] || '').toUpperCase();
  return campo(uf ? `CRM-${uf} ${match[2]}` : `CRM ${match[2]}`, uf ? 0.95 : 0.7, match[0]);
};

/**
 * Extrai todos os campos de um atestado a partir do texto.
 * @param {string} rawText Texto bruto (linhas separadas por \n).
 * @returns {AtestadoExtraido}
 */
export const parseAtestado = (rawText) => {
  const text = String(rawText ?? '').replace(/ /g, ' ').replace(/[ \t]+/g, ' ');
  return {
    nome: extrairNome(text),
    cpf: extrairCpf(text),
    cid: extrairCid(text),
    dias: extrairDias(text),
    dataInicio: extrairDataInicio(text),
    dataEmissao: extrairDataEmissao(text),
    medico: extrairMedico(text),
    crm: extrairCrm(text),
    chars: text.length,
  };
};

/**
 * @typedef {Object} MatchColaborador
 * @property {string|null} id
 * @property {number} score   0–1.
 * @property {'cpf'|'nome'|null} by
 */

/**
 * Associa o atestado a um colaborador da base do cliente (CPF exato > similaridade de nome).
 * @param {AtestadoExtraido} extraido
 * @param {ReadonlyArray<{id: string, nome: string, cpf: string}>} colaboradores
 * @returns {MatchColaborador}
 */
export const matchColaborador = (extraido, colaboradores) => {
  const cpf = typeof extraido.cpf.value === 'string' ? extraido.cpf.value : '';
  if (cpf) {
    const byCpf = colaboradores.find((c) => c.cpf === cpf);
    if (byCpf) return { id: byCpf.id, score: 1, by: 'cpf' };
  }
  const nome = typeof extraido.nome.value === 'string' ? normalize(extraido.nome.value) : '';
  if (!nome) return { id: null, score: 0, by: null };
  const tokens = new Set(nome.split(' ').filter((t) => t.length > 2));
  let best = { id: /** @type {string|null} */ (null), score: 0, by: /** @type {'nome'|null} */ (null) };
  colaboradores.forEach((c) => {
    const ct = normalize(c.nome).split(' ').filter((t) => t.length > 2);
    const hits = ct.filter((t) => tokens.has(t)).length;
    const score = hits / Math.max(ct.length, tokens.size);
    if (score > best.score) best = { id: c.id, score, by: 'nome' };
  });
  return best.score >= 0.5 ? best : { id: null, score: best.score, by: null };
};
