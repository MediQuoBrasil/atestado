/**
 * @file Dicionário reduzido de CID-10 usado no protótipo (descrição + capítulo).
 * Em produção, usar a tabela oficial completa (DATASUS) servida pelo backend.
 */

/**
 * @typedef {Object} CidInfo
 * @property {string} code      Código CID-10 (ex.: 'M54.5').
 * @property {string} desc      Descrição curta.
 * @property {string} chapter   Capítulo/agrupamento clínico.
 * @property {boolean} [special] Grupo que exige tratamento diferenciado (gestação, acidente).
 */

/** @type {ReadonlyArray<CidInfo>} */
const CID_LIST = Object.freeze([
  { code: 'J11', desc: 'Influenza (gripe)', chapter: 'Respiratório' },
  { code: 'J06.9', desc: 'Infecção aguda das vias aéreas superiores', chapter: 'Respiratório' },
  { code: 'J01.9', desc: 'Sinusite aguda', chapter: 'Respiratório' },
  { code: 'A09', desc: 'Diarreia e gastroenterite infecciosa', chapter: 'Digestivo e infeccioso' },
  { code: 'K29.7', desc: 'Gastrite', chapter: 'Digestivo e infeccioso' },
  { code: 'M54.5', desc: 'Dor lombar baixa', chapter: 'Osteomuscular' },
  { code: 'M75.1', desc: 'Síndrome do manguito rotador', chapter: 'Osteomuscular' },
  { code: 'M79.1', desc: 'Mialgia', chapter: 'Osteomuscular' },
  { code: 'F41.1', desc: 'Ansiedade generalizada', chapter: 'Saúde mental' },
  { code: 'F32.1', desc: 'Episódio depressivo moderado', chapter: 'Saúde mental' },
  { code: 'F43.2', desc: 'Transtornos de adaptação', chapter: 'Saúde mental' },
  { code: 'R51', desc: 'Cefaleia', chapter: 'Neurológico' },
  { code: 'G43.9', desc: 'Enxaqueca', chapter: 'Neurológico' },
  { code: 'S93.4', desc: 'Entorse do tornozelo', chapter: 'Lesões e acidentes', special: true },
  { code: 'N39.0', desc: 'Infecção do trato urinário', chapter: 'Geniturinário' },
  { code: 'H10.9', desc: 'Conjuntivite', chapter: 'Oftalmológico' },
  { code: 'O21.0', desc: 'Hiperêmese gravídica leve', chapter: 'Gestação', special: true },
]);

const CID_MAP = new Map(CID_LIST.map((c) => [c.code, c]));

/**
 * Normaliza código CID (maiúsculas, ponto opcional) e retorna metadados.
 * Códigos fora do dicionário retornam capítulo "Outros".
 * @param {string} code
 * @returns {CidInfo|null}
 */
export const lookupCid = (code) => {
  if (typeof code !== 'string') return null;
  const clean = code.trim().toUpperCase().replace(/\s/g, '');
  if (!/^[A-Z]\d{2}(\.?\d)?$/.test(clean)) return null;
  const withDot = clean.length === 4 && !clean.includes('.') ? `${clean.slice(0, 3)}.${clean[3]}` : clean;
  return CID_MAP.get(withDot) ?? CID_MAP.get(withDot.slice(0, 3)) ?? { code: withDot, desc: 'CID fora do dicionário do protótipo', chapter: 'Outros' };
};

/**
 * Lista completa (para selects).
 * @returns {ReadonlyArray<CidInfo>}
 */
export const listCids = () => CID_LIST;
