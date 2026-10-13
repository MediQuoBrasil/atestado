/**
 * @file Logger com mascaramento de dados sensíveis (LGPD).
 * Nunca registra nome completo, CPF, CID ou conteúdo do atestado em texto claro.
 */

/** @typedef {'debug'|'info'|'warn'|'error'} LogLevel */

/**
 * @typedef {Object} LogEntry
 * @property {string} ts      ISO timestamp.
 * @property {LogLevel} level Nível do log.
 * @property {string} scope   Módulo de origem.
 * @property {string} msg     Mensagem.
 * @property {Object} [data]  Payload já mascarado.
 */

/** Chaves cujo valor é sempre mascarado no log. */
const SENSITIVE_KEYS = new Set(['nome', 'cpf', 'cid', 'cidDesc', 'texto', 'rawText', 'medicoEmissor', 'crm', 'telefone']);

/** @type {LogEntry[]} */
const buffer = [];
const MAX_ENTRIES = 300;

/**
 * Mascara um valor sensível mantendo apenas pistas de diagnóstico (tamanho, iniciais).
 * @param {unknown} value
 * @returns {string}
 */
const maskValue = (value) => {
  if (value === null || value === undefined) return String(value);
  const str = String(value);
  if (str.length <= 2) return '**';
  return `${str[0]}***(${str.length})`;
};

/**
 * Retorna cópia rasa do payload com campos sensíveis mascarados.
 * @param {Object} [data]
 * @returns {Object|undefined}
 */
const sanitize = (data) => {
  if (!data || typeof data !== 'object') return undefined;
  return Object.fromEntries(Object.entries(data).map(([key, val]) => {
    if (SENSITIVE_KEYS.has(key)) return [key, maskValue(val)];
    if (val instanceof Uint8Array || val instanceof ArrayBuffer) return [key, `<bytes ${val.byteLength}>`];
    return [key, val];
  }));
};

/**
 * Cria um logger com escopo.
 * @param {string} scope Nome do módulo.
 * @returns {{debug: Function, info: Function, warn: Function, error: Function, time: function(string): function(): number}}
 */
export const createLogger = (scope) => {
  /**
   * @param {LogLevel} level
   * @returns {function(string, Object=): void}
   */
  const write = (level) => (msg, data) => {
    /** @type {LogEntry} */
    const entry = { ts: new Date().toISOString(), level, scope, msg, data: sanitize(data) };
    buffer.push(entry);
    if (buffer.length > MAX_ENTRIES) buffer.shift();
    const fn = level === 'debug' ? 'log' : level;
    // eslint-disable-next-line no-console
    console[fn](`[${entry.ts}] [${level.toUpperCase()}] [${scope}] ${msg}`, entry.data ?? '');
  };

  return {
    debug: write('debug'),
    info: write('info'),
    warn: write('warn'),
    error: write('error'),
    /**
     * Inicia um cronômetro; a função retornada encerra e devolve a duração em ms.
     * @param {string} label
     * @returns {function(): number}
     */
    time: (label) => {
      const start = performance.now();
      return () => {
        const ms = Math.round(performance.now() - start);
        write('debug')(`${label} concluído`, { ms });
        return ms;
      };
    },
  };
};

/**
 * Entradas recentes do log (somente leitura).
 * @returns {ReadonlyArray<LogEntry>}
 */
export const getLogEntries = () => buffer.slice();
