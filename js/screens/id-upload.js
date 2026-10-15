/**
 * @file ID · Absenteísmo › Enviar atestado. Upload, extração real do PDF e revisão pelo RH.
 */

import { delegate, esc, icon, qs } from '../core/dom.js';
import { createLogger } from '../core/logger.js';
import { fmtCnpj, fmtDate, plural } from '../core/format.js';
import {
  STATUS, criarCaso, empresaDoCaso, getColaborador, getEmpresa, listarCasos,
} from '../core/store.js';
import { COLABORADORES, EMPRESAS, MEDICOS_EMISSORES } from '../data/seed.js';
import { PdfError, extrairTexto, lerArquivoPdf } from '../pdf/extract.js';
import { matchColaborador, parseAtestado } from '../pdf/parse.js';
import { gerarAtestadoPdf } from '../pdf/generate.js';
import { idHeader, idShell } from './id-shell.js';
import { handleIdSub } from './id-nav.js';

const log = createLogger('id.upload');

/**
 * @typedef {Object} EtapaProc
 * @property {string} label
 * @property {'wait'|'run'|'ok'} state
 * @property {number|null} ms
 */

/**
 * @typedef {Object} FormValues
 * @property {string} colaboradorId
 * @property {string} dataInicio
 * @property {string} dias
 * @property {string} dataEmissao
 * @property {string} medicoEmissor
 * @property {string} crm
 * @property {string} cid
 * @property {boolean} ciente
 */

/** Estado local da tela (sobrevive a re-renders do store). */
const ui = {
  /** @type {'idle'|'processing'|'review'|'done'} */
  phase: 'idle',
  /** @type {EtapaProc[]} */
  steps: [],
  /** @type {{name: string, size: number}|null} */
  file: null,
  /** @type {Uint8Array|null} */
  bytes: null,
  /** @type {import('../pdf/parse.js').AtestadoExtraido|null} */
  extraido: null,
  /** @type {import('../pdf/parse.js').MatchColaborador|null} */
  match: null,
  text: '',
  /** @type {FormValues|null} */
  form: null,
  /** @type {Object<string, string>} */
  errors: {},
  /** @type {string|null} */
  createdId: null,
  /** @type {'upload'|'exemplo'} */
  origem: 'upload',
  error: '',
};

/**
 * Atestados de exemplo (gerados como PDF real e lidos pelo mesmo pipeline do upload).
 * @type {ReadonlyArray<{key: string, layout: import('../pdf/generate.js').LayoutAtestado, colab: string, cid: string, dias: number, inicio: string, med: number, titulo: string, sub: string}>}
 */
const EXEMPLOS = Object.freeze([
  { key: 'a', layout: 'corrido', colab: 'col-02', cid: 'M54.5', dias: 5, inicio: '2026-10-12', med: 3, titulo: 'Texto corrido · Rafael Monteiro Lins', sub: '5 dias · 3º atestado em 90 dias' },
  { key: 'b', layout: 'upa', colab: 'col-07', cid: 'J11', dias: 3, inicio: '2026-10-13', med: 1, titulo: 'Formulário de UPA · Larissa Moura Campos', sub: '3 dias · primeiro atestado no ano' },
  { key: 'c', layout: 'receituario', colab: 'col-11', cid: 'O21.0', dias: 4, inicio: '2026-10-12', med: 3, titulo: 'Receituário · Aline Rezende Castro', sub: '4 dias · grupo com condução diferenciada' },
]);

/** Volta ao estado inicial. */
const resetUi = () => {
  Object.assign(ui, {
    phase: 'idle', steps: [], file: null, bytes: null, extraido: null, match: null, text: '', form: null, errors: {}, createdId: null, error: '',
  });
};

/**
 * Selo de confiança da extração.
 * @param {number} c
 * @returns {string}
 */
const confBadge = (c) => {
  if (c >= 0.85) return '<span class="conf hi" title="Encontrado com rótulo explícito">lido do PDF</span>';
  if (c >= 0.5) return '<span class="conf mid" title="Encontrado por aproximação — confira">confira</span>';
  return '<span class="conf lo" title="Não encontrado no PDF">não encontrado</span>';
};

/**
 * Texto extraído com CID ocultado (o RH não deve visualizar diagnóstico).
 * @param {string} text
 * @returns {string} HTML seguro.
 */
const textoRedigido = (text) => esc(text).replace(/\b([A-TV-Z]\d{2}(?:\.\d)?)\b/g, (m) => `<mark>${'█'.repeat(m.length)}</mark>`);

/**
 * Opções de colaborador agrupadas por empresa.
 * @param {string} selected
 * @returns {string}
 */
const colaboradorOptions = (selected) => `<option value="">Selecione…</option>${EMPRESAS.map((e) => `
  <optgroup label="${esc(e.razao)}">${COLABORADORES.filter((c) => c.empresaId === e.id).map((c) => `<option value="${esc(c.id)}" ${c.id === selected ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</optgroup>`).join('')}`;

/** @returns {string} */
const renderIdle = () => `
  <div class="id-drop" data-drop>
    ${icon('upload', 'ic-big')}
    <div>
      <label for="atestadoInput" class="id-link">Selecionar atestado em PDF</label>
      <input id="atestadoInput" type="file" accept="application/pdf,.pdf" hidden>
      <p class="id-hint">ou arraste o arquivo aqui · Tamanho máximo: 20MB</p>
    </div>
  </div>
  ${ui.error ? `<p class="id-err" role="alert">${esc(ui.error)}</p>` : ''}
  <div class="id-samples">
    <p class="id-samples-title">Sem um PDF à mão? Gere um atestado fictício</p>
    ${EXEMPLOS.map((ex) => `
      <button type="button" class="id-sample" data-action="sample" data-key="${ex.key}">
        ${icon('fileText')}<span><b>${esc(ex.titulo)}</b><small>${esc(ex.sub)}</small></span>
      </button>`).join('')}
  </div>`;

/** @returns {string} */
const renderSteps = () => `<ol class="id-steps">${ui.steps.map((s) => `<li class="${s.state}">${esc(s.label)}${s.ms !== null ? `<span class="ms">${s.ms} ms</span>` : ''}</li>`).join('')}</ol>`;

/** @returns {string} */
const renderFileBox = () => (ui.file ? `
  <div class="id-file">${icon('fileText')}<div class="meta"><b>${esc(ui.file.name)}</b><small>${(ui.file.size / 1024).toFixed(1)} KB · ${ui.origem === 'exemplo' ? 'PDF gerado pelo protótipo' : 'enviado do seu computador'}</small></div>
  ${ui.phase !== 'processing' ? '<button type="button" class="id-btn outline sm" data-action="trocar">Trocar arquivo</button>' : ''}</div>` : '');

/**
 * Formulário de revisão do RH.
 * @returns {string}
 */
const renderReview = () => {
  const f = /** @type {FormValues} */ (ui.form);
  const x = ui.extraido;
  const e = ui.errors;
  const colab = getColaborador(f.colaboradorId);
  const emp = colab ? getEmpresa(colab.empresaId) : undefined;
  const semTexto = (x?.chars ?? 0) < 30;
  const matchInfo = ui.match?.id
    ? `<span class="conf hi">${ui.match.by === 'cpf' ? 'CPF confere com a base' : 'nome confere com a base'}</span>`
    : '<span class="conf lo">selecione manualmente</span>';
  return `
    <form class="id-form" data-form="review" novalidate>
      ${semTexto ? `<div class="id-note">${icon('alert', 'ic-sm')}<span>Este PDF não tem texto selecionável (foto ou digitalização). Preencha os campos à mão. A leitura por OCR entra numa próxima versão.</span></div>` : ''}
      <div class="id-form-grid">
        <div class="id-field full">
          <label class="id-label" for="fColab">Colaborador ${matchInfo}</label>
          <select id="fColab" class="id-input ${e.colaboradorId ? 'err' : ''}" data-field="colaboradorId">${colaboradorOptions(f.colaboradorId)}</select>
          ${e.colaboradorId ? `<span class="id-err">${esc(e.colaboradorId)}</span>` : ''}
        </div>
        <div class="id-field"><label class="id-label" for="fEmp">Empresa</label><input id="fEmp" class="id-input" readonly value="${esc(emp?.razao ?? '—')}"></div>
        <div class="id-field"><label class="id-label" for="fCnpj">CNPJ vinculado</label><input id="fCnpj" class="id-input" readonly value="${esc(emp ? fmtCnpj(emp.cnpj) : '—')}"></div>
        <div class="id-field">
          <label class="id-label" for="fIni">Início do afastamento ${confBadge(x?.dataInicio.confidence ?? 0)}</label>
          <input id="fIni" type="date" class="id-input ${e.dataInicio ? 'err' : ''}" data-field="dataInicio" value="${esc(f.dataInicio)}">
          ${e.dataInicio ? `<span class="id-err">${esc(e.dataInicio)}</span>` : ''}
        </div>
        <div class="id-field">
          <label class="id-label" for="fDias">Dias de afastamento ${confBadge(x?.dias.confidence ?? 0)}</label>
          <input id="fDias" type="number" min="1" max="365" inputmode="numeric" class="id-input ${e.dias ? 'err' : ''}" data-field="dias" value="${esc(f.dias)}">
          ${e.dias ? `<span class="id-err">${esc(e.dias)}</span>` : ''}
        </div>
        <div class="id-field"><label class="id-label" for="fMed">Médico emissor ${confBadge(x?.medico.confidence ?? 0)}</label><input id="fMed" class="id-input" data-field="medicoEmissor" maxlength="120" value="${esc(f.medicoEmissor)}"></div>
        <div class="id-field"><label class="id-label" for="fCrm">CRM ${confBadge(x?.crm.confidence ?? 0)}</label><input id="fCrm" class="id-input" data-field="crm" maxlength="40" value="${esc(f.crm)}"></div>
        <div class="id-field full">
          <span class="id-label">CID-10</span>
          <div class="id-masked">${icon('lock', 'ic-sm')}${f.cid ? 'CID identificado no documento. Visível apenas para a equipe médica.' : 'CID não identificado. A equipe médica completa na análise.'}</div>
        </div>
      </div>
      ${ui.text ? `<details class="id-details"><summary>Texto lido do PDF (${ui.text.length} caracteres, CID ocultado)</summary><pre>${textoRedigido(ui.text)}</pre></details>` : ''}
      <label class="id-check"><input type="checkbox" id="fCiente" data-field="ciente" ${f.ciente ? 'checked' : ''}><span>Confirmo que o colaborador foi informado de que a MediQuo fará contato para acompanhamento clínico, conforme a política de privacidade da empresa.</span></label>
      ${e.ciente ? `<span class="id-err">${esc(e.ciente)}</span>` : ''}
      <div class="id-actions">
        <button type="submit" class="id-btn">${icon('send', 'ic-sm')} Enviar para a MediQuo</button>
        <button type="button" class="id-btn outline" data-action="trocar">Cancelar</button>
      </div>
    </form>`;
};

/**
 * Confirmação após envio.
 * @param {import('../journey/navigator.js').ScreenCtx} ctx
 * @returns {string}
 */
const renderDone = (ctx) => {
  const caso = listarCasos().find((c) => c.id === ui.createdId);
  if (!caso) return '';
  const colab = getColaborador(caso.colaboradorId);
  const proxima = ctx.rota.etapas[ctx.index + 1];
  return `
    <div class="id-success">
      <h3>${icon('check', 'ic-sm')} Atestado enviado</h3>
      <p>O caso foi aberto e já aparece para a equipe médica no MediQuo Pro.</p>
      <dl class="id-kv">
        <dt>Caso</dt><dd>${esc(caso.id)}</dd>
        <dt>Colaborador</dt><dd>${esc(colab?.nome ?? '')}</dd>
        <dt>Período</dt><dd>${esc(fmtDate(caso.dataInicio))} · ${esc(plural(caso.dias, 'dia', 'dias'))}</dd>
        <dt>Status</dt><dd><span class="pill ${STATUS[caso.status].tone}">${esc(STATUS[caso.status].label)}</span></dd>
      </dl>
      <div class="id-actions">
        ${proxima ? `<button type="button" class="id-btn" data-action="next">${esc(proxima.label)} ${icon('chevronRight', 'ic-sm')}</button>` : ''}
        <button type="button" class="id-btn outline" data-action="trocar">Enviar outro atestado</button>
      </div>
    </div>`;
};

/** @returns {string} */
const renderRecentes = () => {
  const recentes = [...listarCasos()].sort((a, b) => (b.criadoEm + b.id).localeCompare(a.criadoEm + a.id)).slice(0, 6);
  return `
    <div class="id-card">
      <div class="id-card-head"><div><h2 class="id-card-title">Envios recentes</h2><p class="id-card-desc">O RH vê status e datas. Diagnóstico fica restrito à equipe médica.</p></div></div>
      <div class="id-card-body id-table-wrap">
        <table class="id-table">
          <thead><tr><th>Caso</th><th>Colaborador</th><th>CNPJ</th><th>Período</th><th>Status</th></tr></thead>
          <tbody>${recentes.map((c) => {
    const col = getColaborador(c.colaboradorId);
    const emp = empresaDoCaso(c);
    return `<tr class="${c.id === ui.createdId ? 'focus' : ''}"><td class="num">${esc(c.id)}<span class="sub">${esc(fmtDate(c.criadoEm))}</span></td><td>${esc(col?.nome ?? '')}<span class="sub">${esc(col?.cargo ?? '')}</span></td><td class="num">${esc(fmtCnpj(emp?.cnpj ?? ''))}<span class="sub">${esc(emp?.razao ?? '')}</span></td><td class="num">${esc(fmtDate(c.dataInicio))}<span class="sub">${esc(plural(c.dias, 'dia', 'dias'))}</span></td><td><span class="pill ${STATUS[c.status].tone}">${esc(STATUS[c.status].label)}</span></td></tr>`;
  }).join('')}</tbody>
        </table>
      </div>
    </div>`;
};

/**
 * @param {import('../journey/navigator.js').ScreenCtx} ctx
 * @returns {string}
 */
const render = (ctx) => {
  let right = '';
  if (ui.phase === 'review') right = renderReview();
  else if (ui.phase === 'done') right = renderDone(ctx);
  else if (ui.phase === 'processing') right = '<div class="id-empty">Lendo o atestado…</div>';
  else right = `<div class="id-empty">${icon('fileText', 'ic-big')}<p>Os dados do atestado aparecem aqui para conferência antes do envio.</p></div>`;

  const left = ui.phase === 'idle' ? renderIdle() : `${renderFileBox()}${renderSteps()}`;

  const content = `
    ${idHeader('Absenteísmo', 'Envie atestados médicos para acompanhamento clínico pela equipe MediQuo.')}
    <div class="id-card">
      <div class="id-card-head"><div><h2 class="id-card-title">Enviar atestado</h2><p class="id-card-desc">O PDF é lido no navegador, os campos são preenchidos automaticamente e você confere antes de enviar.</p></div></div>
      <div class="id-card-body id-grid-2">
        <div>${left}</div>
        <div>${right}</div>
      </div>
    </div>
    ${renderRecentes()}`;
  return idShell('enviar', content);
};

/**
 * Atualiza uma etapa do processamento e re-renderiza só a tela.
 * @param {number} i
 * @param {'run'|'ok'} state
 * @param {function(): void} rerender
 * @param {number|null} [ms=null]
 */
const setStep = (i, state, rerender, ms = null) => {
  ui.steps[i] = { ...ui.steps[i], state, ms };
  rerender();
};

/** @param {number} ms @returns {Promise<void>} */
const pause = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Pipeline: ler → extrair texto (PDF.js) → identificar campos → associar colaborador.
 * @param {Uint8Array} bytes
 * @param {{name: string, size: number}} file
 * @param {function(): void} rerender
 * @returns {Promise<void>}
 */
const processar = async (bytes, file, rerender) => {
  log.info('Processamento iniciado', { origem: ui.origem, bytes: bytes.byteLength });
  Object.assign(ui, { phase: 'processing', file, bytes, error: '', errors: {} });
  ui.steps = ['Arquivo validado (PDF, até 20MB)', 'Lendo o texto com PDF.js', 'Identificando campos do atestado', 'Associando à base de colaboradores'].map((label) => ({ label, state: 'wait', ms: null }));
  setStep(0, 'ok', rerender, 0);
  try {
    setStep(1, 'run', rerender);
    const { text, ms } = await extrairTexto(bytes);
    ui.text = text;
    setStep(1, 'ok', rerender, ms);

    setStep(2, 'run', rerender);
    const t0 = performance.now();
    ui.extraido = parseAtestado(text);
    await pause(220);
    setStep(2, 'ok', rerender, Math.round(performance.now() - t0));

    setStep(3, 'run', rerender);
    const t1 = performance.now();
    ui.match = matchColaborador(ui.extraido, COLABORADORES);
    await pause(180);
    setStep(3, 'ok', rerender, Math.round(performance.now() - t1));

    const x = ui.extraido;
    ui.form = {
      colaboradorId: ui.match.id ?? '',
      dataInicio: typeof x.dataInicio.value === 'string' ? x.dataInicio.value : '',
      dias: x.dias.value !== null ? String(x.dias.value) : '',
      dataEmissao: typeof x.dataEmissao.value === 'string' ? x.dataEmissao.value : '',
      medicoEmissor: typeof x.medico.value === 'string' ? x.medico.value : '',
      crm: typeof x.crm.value === 'string' ? x.crm.value : '',
      cid: typeof x.cid.value === 'string' ? x.cid.value : '',
      ciente: false,
    };
    ui.phase = 'review';
    log.info('Extração concluída', { campos: Object.entries(x).filter(([, v]) => v?.confidence > 0).length, match: ui.match.by });
  } catch (err) {
    log.error('Falha no processamento', { code: err.code ?? 'UNKNOWN', message: err.message });
    resetUi();
    ui.error = err instanceof PdfError ? err.message : 'Não foi possível ler o atestado. Tente outro arquivo.';
  }
  rerender();
};

/**
 * Envia o caso (validação no "servidor" simulado).
 * @param {import('../journey/navigator.js').ScreenCtx} ctx
 * @param {function(): void} rerender
 */
const enviar = (ctx, rerender) => {
  const f = /** @type {FormValues} */ (ui.form);
  if (!f.ciente) {
    ui.errors = { ciente: 'Confirme a ciência do colaborador para enviar.' };
    rerender();
    return;
  }
  const result = criarCaso({
    colaboradorId: f.colaboradorId, cid: f.cid, dias: f.dias, dataInicio: f.dataInicio, dataEmissao: f.dataEmissao,
    medicoEmissor: f.medicoEmissor, crm: f.crm, origem: ui.origem, arquivoNome: ui.file?.name ?? 'atestado.pdf',
    pdfBytes: ui.bytes, confianca: ui.extraido ? Object.fromEntries(Object.entries(ui.extraido).filter(([k]) => k !== 'chars').map(([k, v]) => [k, v.confidence])) : null,
  });
  if (!result.ok) {
    ui.errors = result.errors;
    rerender();
    return;
  }
  ui.errors = {};
  ui.createdId = result.caso.id;
  ui.phase = 'done';
  ctx.toast('Atestado enviado para a equipe médica.', 'success');
  rerender();
};

/**
 * @param {HTMLElement} root
 * @param {import('../journey/navigator.js').ScreenCtx} ctx
 * @returns {function(): void}
 */
const bind = (root, ctx) => {
  const rerender = () => {
    const main = root.querySelector('.id-main');
    const top = main ? main.scrollTop : 0;
    const host = qs('.device-viewport', root);
    host.innerHTML = render(ctx);
    const nextMain = host.querySelector('.id-main');
    if (nextMain) nextMain.scrollTop = top;
  };

  /** @param {File} file */
  const onFile = async (file) => {
    try {
      const bytes = await lerArquivoPdf(file);
      ui.origem = 'upload';
      await processar(bytes, { name: file.name, size: file.size }, rerender);
    } catch (err) {
      ui.error = err instanceof PdfError ? err.message : 'Não foi possível ler o arquivo.';
      log.warn('Arquivo recusado', { code: err.code ?? 'UNKNOWN' });
      rerender();
    }
  };

  const offClick = delegate(root, 'click', {
    sample: (el) => {
      const ex = EXEMPLOS.find((s) => s.key === el.dataset.key);
      const colab = ex ? getColaborador(ex.colab) : undefined;
      if (!ex || !colab) return;
      const med = MEDICOS_EMISSORES[ex.med];
      try {
        const bytes = gerarAtestadoPdf({ nome: colab.nome, cpf: colab.cpf, cid: ex.cid, dias: ex.dias, dataInicio: ex.inicio, medico: med.nome, crm: med.crm, local: med.local }, ex.layout);
        ui.origem = 'exemplo';
        processar(bytes, { name: `atestado_${colab.nome.split(' ')[0].toLowerCase()}_${ex.inicio}.pdf`, size: bytes.byteLength }, rerender);
      } catch (err) {
        log.error('Falha ao gerar exemplo', { message: err.message });
        ui.error = 'Não foi possível gerar o atestado de exemplo. Recarregue a página.';
        rerender();
      }
    },
    trocar: () => { resetUi(); rerender(); },
    next: () => ctx.next(),
    'id-sub': (el) => handleIdSub(el.dataset.sub, ctx),
  });

  const onChange = (event) => {
    const el = /** @type {HTMLInputElement} */ (event.target);
    if (el.id === 'atestadoInput' && el.files?.[0]) {
      onFile(el.files[0]);
      return;
    }
    const field = el.dataset?.field;
    if (!field || !ui.form) return;
    ui.form[field] = el.type === 'checkbox' ? el.checked : el.value;
    if (field === 'colaboradorId') rerender();
  };
  const onInput = (event) => {
    const el = /** @type {HTMLInputElement} */ (event.target);
    const field = el.dataset?.field;
    if (field && ui.form && el.type !== 'checkbox') ui.form[field] = el.value;
  };
  const onSubmit = (event) => {
    if (!/** @type {HTMLElement} */ (event.target).matches('[data-form="review"]')) return;
    event.preventDefault();
    enviar(ctx, rerender);
  };
  const onDrag = (event) => {
    const drop = /** @type {HTMLElement} */ (event.target).closest?.('[data-drop]');
    if (!drop) return;
    event.preventDefault();
    drop.classList.toggle('drag', event.type === 'dragover');
    if (event.type === 'drop' && event.dataTransfer?.files?.[0]) onFile(event.dataTransfer.files[0]);
  };

  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  root.addEventListener('submit', onSubmit);
  ['dragover', 'dragleave', 'drop'].forEach((t) => root.addEventListener(t, onDrag));
  return () => {
    offClick();
    root.removeEventListener('change', onChange);
    root.removeEventListener('input', onInput);
    root.removeEventListener('submit', onSubmit);
    ['dragover', 'dragleave', 'drop'].forEach((t) => root.removeEventListener(t, onDrag));
  };
};

/** Reinicia o estado local (usado pelo botão Reiniciar do shell). */
export const resetIdUpload = resetUi;

/** @type {import('../journey/navigator.js').Screen} */
export const idUploadScreen = {
  frame: 'desktop',
  url: () => 'id.mediquo.com.br/absenteismo/enviar',
  render,
  bind,
};
