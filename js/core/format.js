/**
 * @file Formatação e validação puras (datas, CNPJ, CPF, iniciais). Sem efeitos colaterais.
 */

const MS_DAY = 86400000;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS_SEMANA = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.'];

/**
 * Converte 'AAAA-MM-DD' em Date local (meia-noite). Retorna null se inválido.
 * @param {string} iso
 * @returns {Date|null}
 */
export const parseIsoDate = (iso) => {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getMonth() === m - 1 ? date : null;
};

/**
 * Converte 'DD/MM/AAAA' em 'AAAA-MM-DD'. Retorna null se inválido.
 * @param {string} br
 * @returns {string|null}
 */
export const brToIso = (br) => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(br).trim());
  if (!match) return null;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  return parseIsoDate(iso) ? iso : null;
};

/**
 * Date → 'AAAA-MM-DD'.
 * @param {Date} date
 * @returns {string}
 */
export const toIso = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/**
 * 'AAAA-MM-DD' → 'DD/MM/AAAA'.
 * @param {string} iso
 * @returns {string}
 */
export const fmtDate = (iso) => {
  const d = parseIsoDate(iso);
  if (!d) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

/**
 * 'AAAA-MM-DD' → 'seg., 24 de agosto' (padrão do app cliente).
 * @param {string} iso
 * @returns {string}
 */
export const fmtDateLong = (iso) => {
  const d = parseIsoDate(iso);
  if (!d) return '—';
  return `${DIAS_SEMANA[d.getDay()]}, ${d.getDate()} de ${MESES_LONGOS[d.getMonth()]}`;
};

/**
 * 'AAAA-MM' → 'ago/26'.
 * @param {string} ym
 * @returns {string}
 */
export const fmtMonth = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return `${MESES[m - 1]}/${String(y).slice(2)}`;
};

/**
 * Soma dias a uma data ISO.
 * @param {string} iso
 * @param {number} days
 * @returns {string}
 */
export const addDays = (iso, days) => {
  const d = parseIsoDate(iso);
  if (!d) return iso;
  return toIso(new Date(d.getTime() + days * MS_DAY));
};

/**
 * Diferença em dias inteiros (b - a).
 * @param {string} aIso
 * @param {string} bIso
 * @returns {number}
 */
export const diffDays = (aIso, bIso) => {
  const a = parseIsoDate(aIso);
  const b = parseIsoDate(bIso);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / MS_DAY);
};

/**
 * Apenas dígitos.
 * @param {string} value
 * @returns {string}
 */
export const digits = (value) => String(value ?? '').replace(/\D/g, '');

/**
 * Formata CNPJ (14 dígitos) como 00.000.000/0000-00.
 * @param {string} value
 * @returns {string}
 */
export const fmtCnpj = (value) => {
  const d = digits(value);
  if (d.length !== 14) return String(value ?? '');
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
};

/**
 * Valida dígitos verificadores do CNPJ.
 * @param {string} value
 * @returns {boolean}
 */
export const isValidCnpj = (value) => {
  const d = digits(value);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  /** @param {number} len */
  const calc = (len) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + Number(d[i]) * w, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
};

/**
 * Mascara CPF para exibição: ***.456.789-**.
 * @param {string} value
 * @returns {string}
 */
export const maskCpf = (value) => {
  const d = digits(value);
  if (d.length !== 11) return '—';
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
};

/**
 * Iniciais (duas letras) para avatar.
 * @param {string} name
 * @returns {string}
 */
export const initials = (name) => {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return `${first}${last}`.toUpperCase();
};

/**
 * Normaliza texto para busca (minúsculas, sem acento).
 * @param {string} value
 * @returns {string}
 */
export const normalize = (value) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * "1 dia" / "3 dias".
 * @param {number} n
 * @param {string} singular
 * @param {string} plural
 * @returns {string}
 */
export const plural = (n, singular, plural) => `${n} ${n === 1 ? singular : plural}`;

/**
 * Celular brasileiro: '11987654471' → '(11) 98765-4471'. Valor fora do formato volta como veio.
 * @param {string} value
 * @returns {string}
 */
export const fmtTelefone = (value) => {
  const d = digits(value);
  if (d.length !== 11) return String(value ?? '');
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

/** Formatador de moeda reaproveitado (Intl é caro de instanciar). */
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/**
 * Valor em reais sem centavos: 12345.6 → 'R$ 12.346'.
 * @param {number} value
 * @returns {string}
 */
export const fmtBRL = (value) => BRL.format(Number.isFinite(value) ? value : 0);

/**
 * 'AAAA-MM-DDTHH:mm' →'qua., 14 de outubro · 09:30 – 10:00' (consultas de 30 min).
 * @param {string} slot
 * @returns {string}
 */
export const fmtSlot = (slot) => {
  const [date, time] = String(slot ?? '').split('T');
  if (!date || !/^\d{2}:\d{2}$/.test(time ?? '')) return '—';
  const [h, m] = time.split(':').map(Number);
  const endMin = h * 60 + m + 30;
  const end = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
  return `${fmtDateLong(date)} · ${time} – ${end}`;
};
