/**
 * @file ID · Absenteísmo › Casos. Modos: status (Rota 0), agendar via Meet (Rota 1),
 * devolutiva (Rotas 1 e 2) e indicadores agregados (Rota 3). O RH nunca vê CID ou nota clínica.
 */

import { delegate, esc, icon } from '../core/dom.js';
import { createLogger } from '../core/logger.js';
import {
  addDays, fmtCnpj, fmtDate, fmtMonth, fmtSlot, plural,
} from '../core/format.js';
import {
  STATUS, TODAY, atualizarCaso, empresaDoCaso, getColaborador, getFocusCase, listarCasos,
} from '../core/store.js';
import { EMPRESAS } from '../data/seed.js';
import { DESFECHOS, CRITERIOS, contarReincidencia } from '../data/rules.js';
import { idHeader, idShell } from './id-shell.js';
import { handleIdSub } from './id-nav.js';

const log = createLogger('id.casos');

/** Formato do link do Google Meet (código xxx-xxxx-xxx). */
const MEET_RE = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/;

/** Estado local do formulário de agenda. */
const form = { slot: '', link: '', error: '' };

/**
 * @param {keyof STATUS} status
 * @returns {string}
 */
const pill = (status) => `<span class="pill ${STATUS[status].tone}">${esc(STATUS[status].label)}</span>`;

/**
 * Tabela de casos (visão RH, sem diagnóstico).
 * @param {string} focusId
 * @returns {string}
 */
const tabelaCasos = (focusId) => {
  const casos = [...listarCasos()].sort((a, b) => (b.criadoEm + b.id).localeCompare(a.criadoEm + a.id)).slice(0, 10);
  return `
    <div class="id-card">
      <div class="id-card-head"><div><h2 class="id-card-title">Casos recentes</h2><p class="id-card-desc">Status administrativo e datas. Diagnóstico e conversa clínica ficam com a equipe médica.</p></div></div>
      <div class="id-card-body id-table-wrap">
        <table class="id-table">
          <thead><tr><th>Caso</th><th>Colaborador</th><th>CNPJ</th><th>Afastamento</th><th>Status</th></tr></thead>
          <tbody>${casos.map((c) => {
    const col = getColaborador(c.colaboradorId);
    const emp = empresaDoCaso(c);
    return `<tr class="${c.id === focusId ? 'focus' : ''}"><td class="num">${esc(c.id)}</td><td>${esc(col?.nome ?? '')}<span class="sub">${esc(col?.cargo ?? '')}</span></td><td class="num">${esc(fmtCnpj(emp?.cnpj ?? ''))}</td><td class="num">${esc(fmtDate(c.dataInicio))} → ${esc(fmtDate(addDays(c.dataInicio, c.dias - 1)))}<span class="sub">${esc(plural(c.dias, 'dia', 'dias'))}</span></td><td>${pill(c.status)}</td></tr>`;
  }).join('')}</tbody>
        </table>
      </div>
    </div>`;
};

/**
 * Timeline visível ao RH (eventos já redigidos sem dado clínico).
 * @param {import('../core/store.js').Caso} caso
 * @returns {string}
 */
const timeline = (caso) => `<ol class="id-timeline">${[...caso.timeline].reverse().map((t) => `<li><div><span class="t">${esc(t.ts)}</span><div>${esc(t.text)}</div></div></li>`).join('')}</ol>`;

/**
 * Resumo administrativo do caso em foco.
 * @param {import('../core/store.js').Caso} caso
 * @returns {string}
 */
const resumoCaso = (caso) => {
  const col = getColaborador(caso.colaboradorId);
  const emp = empresaDoCaso(caso);
  return `
    <dl class="id-kv">
      <dt>Caso</dt><dd>${esc(caso.id)}</dd>
      <dt>Colaborador</dt><dd>${esc(col?.nome ?? '')} · ${esc(col?.cargo ?? '')}</dd>
      <dt>Empresa</dt><dd>${esc(emp?.razao ?? '')} · ${esc(fmtCnpj(emp?.cnpj ?? ''))}</dd>
      <dt>Afastamento</dt><dd>${esc(fmtDate(caso.dataInicio))} a ${esc(fmtDate(addDays(caso.dataInicio, caso.dias - 1)))} (${esc(plural(caso.dias, 'dia', 'dias'))})</dd>
      <dt>Status</dt><dd>${pill(caso.status)}</dd>
    </dl>`;
};

/**
 * Modo status (Rota 0).
 * @param {import('../core/store.js').Caso} caso
 * @returns {string}
 */
const modoStatus = (caso) => `
  <div class="id-grid-2">
    <div class="id-card"><div class="id-card-head"><h2 class="id-card-title">Caso acompanhado</h2></div><div class="id-card-body">${resumoCaso(caso)}</div></div>
    <div class="id-card"><div class="id-card-head"><h2 class="id-card-title">Histórico</h2></div><div class="id-card-body">${timeline(caso)}</div></div>
  </div>
  ${tabelaCasos(caso.id)}`;

/**
 * Modo agendar (Rota 1): RH escolhe horário proposto e informa o link do Meet.
 * @param {import('../core/store.js').Caso} caso
 * @returns {string}
 */
const modoAgendar = (caso) => {
  const col = getColaborador(caso.colaboradorId);
  let body = '';
  if (caso.status === 'aguardando_rh' && caso.agendamento) {
    const slots = caso.agendamento.slotsSugeridos;
    if (!form.slot && slots.length) form.slot = slots[0];
    body = `
      <form class="id-form" data-form="agenda" novalidate>
        <div class="id-note">${icon('clock', 'ic-sm')}<span>A equipe médica pediu uma consulta com <b>${esc(col?.nome ?? '')}</b>. Combine com o colaborador (telefone ${esc(col?.telefone ?? '—')}) e confirme um dos horários.</span></div>
        <div class="id-field"><span class="id-label">Horários propostos pelo médico</span>
          <div class="id-slots">${slots.map((s, i) => `<label class="id-slot"><input type="radio" name="slot" value="${esc(s)}" data-field="slot" ${s === form.slot ? 'checked' : ''} id="slot${i}"><span><b>${esc(fmtSlot(s).split(' · ')[0])}</b>${esc(fmtSlot(s).split(' · ')[1])}</span></label>`).join('')}</div>
        </div>
        <div class="id-field">
          <label class="id-label" for="meetLink">Link do Google Meet</label>
          <div class="id-actions"><input id="meetLink" class="id-input ${form.error ? 'err' : ''}" style="flex:1;min-width:16rem" placeholder="https://meet.google.com/abc-defg-hij" data-field="link" value="${esc(form.link)}" autocomplete="off">
          <button type="button" class="id-btn outline" data-action="gerar-link">${icon('link', 'ic-sm')} Gerar link de exemplo</button></div>
          ${form.error ? `<span class="id-err">${esc(form.error)}</span>` : '<span class="id-hint">Crie a reunião no Google Agenda com o colaborador e o médico como convidados e cole o link aqui.</span>'}
        </div>
        <div class="id-actions"><button type="submit" class="id-btn">${icon('calendar', 'ic-sm')} Confirmar agendamento</button></div>
      </form>`;
  } else if (caso.agendamento?.slot && caso.agendamento.canal === 'meet') {
    body = `
      <div class="id-success">
        <h3>${icon('check', 'ic-sm')} Consulta confirmada</h3>
        <dl class="id-kv"><dt>Quando</dt><dd>${esc(fmtSlot(caso.agendamento.slot))}</dd><dt>Link</dt><dd>${esc(caso.agendamento.link ?? '')}</dd><dt>Status</dt><dd>${pill(caso.status)}</dd></dl>
        <div class="id-actions"><button type="button" class="id-btn" data-action="next">Ir para a consulta ${icon('chevronRight', 'ic-sm')}</button></div>
      </div>`;
  } else {
    body = `
      <div class="id-empty">${icon('calendarDays', 'ic-big')}<p>Nenhum pedido de agenda pendente para este caso.</p>
        <button type="button" class="id-btn outline" data-action="goto" data-step="pedido">Voltar ao pedido do médico</button></div>`;
  }
  return `
    <div class="id-grid-2">
      <div class="id-card"><div class="id-card-head"><div><h2 class="id-card-title">Pedido de agenda</h2><p class="id-card-desc">Caso ${esc(caso.id)}</p></div>${pill(caso.status)}</div><div class="id-card-body">${body}</div></div>
      <div class="id-card"><div class="id-card-head"><h2 class="id-card-title">Histórico</h2></div><div class="id-card-body">${timeline(caso)}</div></div>
    </div>
    ${tabelaCasos(caso.id)}`;
};

/**
 * Modo devolutiva (Rotas 1 e 2).
 * @param {import('../core/store.js').Caso} caso
 * @param {import('../journey/navigator.js').ScreenCtx} ctx
 * @returns {string}
 */
const modoDevolutiva = (caso, ctx) => {
  const d = caso.desfecho;
  const stepDesfecho = ctx.rota.etapas.find((e) => e.screen === 'pro-consulta')?.id ?? 'desfecho';
  const body = d ? `
    <div class="id-success">
      <h3>${icon('shield', 'ic-sm')} ${esc(DESFECHOS[d.tipo]?.label ?? 'Devolutiva registrada')}</h3>
      <p>${esc(d.recomendacaoRH)}</p>
      <dl class="id-kv">
        <dt>Consulta</dt><dd>${esc(caso.agendamento?.slot ? fmtSlot(caso.agendamento.slot) : '—')} · ${caso.agendamento?.canal === 'meet' ? 'Google Meet' : 'App MediQuo'}</dd>
        <dt>Registrado em</dt><dd>${esc(fmtDate(d.registradoEm))}</dd>
        <dt>Retorno previsto</dt><dd>${esc(fmtDate(addDays(caso.dataInicio, caso.dias)))}</dd>
      </dl>
    </div>
    <div class="id-note">${icon('lock', 'ic-sm')}<span>A conversa clínica, hipóteses e prescrições ficam no prontuário da MediQuo. O RH recebe apenas a recomendação administrativa (LGPD, dado de saúde é sensível).</span></div>`
    : `<div class="id-empty">${icon('clipboard', 'ic-big')}<p>O médico ainda não registrou o desfecho deste caso.</p><button type="button" class="id-btn outline" data-action="goto" data-step="${esc(stepDesfecho)}">Ir para a consulta</button></div>`;
  return `
    <div class="id-grid-2">
      <div class="id-card"><div class="id-card-head"><div><h2 class="id-card-title">Devolutiva do caso</h2><p class="id-card-desc">${esc(getColaborador(caso.colaboradorId)?.nome ?? '')} · ${esc(caso.id)}</p></div>${pill(caso.status)}</div><div class="id-card-body" style="display:grid;gap:1rem">${body}</div></div>
      <div class="id-card"><div class="id-card-head"><h2 class="id-card-title">Histórico</h2></div><div class="id-card-body">${timeline(caso)}</div></div>
    </div>
    ${tabelaCasos(caso.id)}`;
};

/**
 * Barras horizontais.
 * @param {Array<{label: string, value: number}>} rows
 * @param {string} [suffix='']
 * @returns {string}
 */
const bars = (rows, suffix = '') => {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return `<div class="id-bars">${rows.map((r) => `<div class="id-bar"><span class="lab" title="${esc(r.label)}">${esc(r.label)}</span><span class="track"><span class="fill" style="width:${(r.value / max) * 100}%"></span></span><span class="val">${r.value}${suffix}</span></div>`).join('')}</div>`;
};

/**
 * Modo indicadores agregados (Rota 3).
 * @param {import('../core/store.js').Caso} caso
 * @returns {string}
 */
const modoIndicadores = (caso) => {
  const casos = listarCasos();
  const diasTotais = casos.reduce((acc, c) => acc + c.dias, 0);
  const media = (diasTotais / casos.length).toFixed(1);
  const acompanhados = casos.filter((c) => c.triagem.elegivel).length;
  const reincidentes = new Set(casos.filter((c) => contarReincidencia(casos, c.colaboradorId, TODAY) >= CRITERIOS.reincidenciaMinima).map((c) => c.colaboradorId)).size;
  /** @type {Map<string, number>} */
  const porMes = new Map();
  casos.forEach((c) => porMes.set(c.dataInicio.slice(0, 7), (porMes.get(c.dataInicio.slice(0, 7)) ?? 0) + c.dias));
  const meses = [...porMes.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => ({ label: fmtMonth(k), value: v }));
  const porEmpresa = EMPRESAS.map((e) => ({ label: e.razao.replace(/ (S\.A\.|Ltda\.)$/, ''), value: casos.filter((c) => empresaDoCaso(c)?.id === e.id).length }));
  const statusRows = ['em_acompanhamento', 'encaminhado', 'concluido', 'contato_pendente', 'registrado'].map((s) => ({ label: STATUS[s].label, value: casos.filter((c) => c.status === s).length }));
  return `
    <div class="id-kpis">
      <div class="id-card id-kpi"><p class="l">Atestados no período</p><p class="v">${casos.length}</p><p class="s">jun–out/2026</p></div>
      <div class="id-card id-kpi"><p class="l">Dias de afastamento</p><p class="v">${diasTotais}</p><p class="s">média ${media} por atestado</p></div>
      <div class="id-card id-kpi"><p class="l">Em acompanhamento ativo</p><p class="v">${Math.round((acompanhados / casos.length) * 100)}%</p><p class="s">${acompanhados} casos elegíveis</p></div>
      <div class="id-card id-kpi"><p class="l">Recorrência</p><p class="v">${reincidentes}</p><p class="s">colaboradores com ≥ ${CRITERIOS.reincidenciaMinima} atestados em 90 dias</p></div>
    </div>
    <div class="id-grid-2">
      <div class="id-card"><div class="id-card-head"><div><h2 class="id-card-title">Dias de afastamento por mês</h2><p class="id-card-desc">Soma dos dias dos atestados iniciados no mês</p></div></div><div class="id-card-body">${bars(meses, ' d')}</div></div>
      <div class="id-card"><div class="id-card-head"><div><h2 class="id-card-title">Atestados por CNPJ</h2><p class="id-card-desc">Empresas vinculadas a este RH</p></div></div><div class="id-card-body">${bars(porEmpresa)}</div></div>
    </div>
    <div class="id-grid-2">
      <div class="id-card"><div class="id-card-head"><div><h2 class="id-card-title">Desfechos e status</h2><p class="id-card-desc">Nenhum diagnóstico é exibido nesta visão</p></div></div><div class="id-card-body">${bars(statusRows)}</div></div>
      <div class="id-card"><div class="id-card-head"><div><h2 class="id-card-title">Caso acompanhado</h2><p class="id-card-desc">SLA de primeiro contato: 24h úteis</p></div>${pill(caso.status)}</div><div class="id-card-body" style="display:grid;gap:1rem">${resumoCaso(caso)}${caso.desfecho ? `<div class="id-note">${icon('shield', 'ic-sm')}<span>${esc(caso.desfecho.recomendacaoRH)}</span></div>` : ''}</div></div>
    </div>`;
};

const TITULOS = Object.freeze({
  status: ['Casos', 'Acompanhe o status dos atestados enviados.'],
  agendar: ['Casos · Agenda', 'Confirme horários pedidos pela equipe médica e informe o link da consulta.'],
  devolutiva: ['Casos · Devolutiva', 'Recomendações administrativas da equipe médica.'],
  indicadores: ['Indicadores de absenteísmo', 'Visão agregada para gestão. Sem dados individuais de saúde.'],
});

/**
 * @param {import('../journey/navigator.js').ScreenCtx} ctx
 * @returns {string}
 */
const render = (ctx) => {
  const modo = ctx.params.modo ?? 'status';
  const caso = getFocusCase();
  const [t, lead] = TITULOS[modo] ?? TITULOS.status;
  let content = '';
  if (modo === 'agendar') content = modoAgendar(caso);
  else if (modo === 'devolutiva') content = modoDevolutiva(caso, ctx);
  else if (modo === 'indicadores') content = modoIndicadores(caso);
  else content = modoStatus(caso);
  return idShell(modo === 'indicadores' ? 'indicadores' : 'casos', `${idHeader(t, lead)}${content}`, { showIndicadores: ctx.rota.id === 'esteira' });
};

/**
 * Gera um código de reunião no formato do Meet (aleatório, fictício).
 * @returns {string}
 */
const linkExemplo = () => {
  const letters = 'abcdefghijkmnopqrstuvwxyz';
  const pick = (n) => Array.from({ length: n }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  return `https://meet.google.com/${pick(3)}-${pick(4)}-${pick(3)}`;
};

/**
 * @param {HTMLElement} root
 * @param {import('../journey/navigator.js').ScreenCtx} ctx
 * @returns {function(): void}
 */
const bind = (root, ctx) => {
  const offClick = delegate(root, 'click', {
    'gerar-link': () => {
      form.link = linkExemplo();
      form.error = '';
      const input = /** @type {HTMLInputElement|null} */ (root.querySelector('#meetLink'));
      if (input) input.value = form.link;
    },
    goto: (el) => ctx.goTo(el.dataset.step),
    next: () => ctx.next(),
    'id-sub': (el) => handleIdSub(el.dataset.sub, ctx),
  });
  const onInput = (event) => {
    const el = /** @type {HTMLInputElement} */ (event.target);
    if (el.dataset.field === 'link') form.link = el.value.trim();
    if (el.dataset.field === 'slot') form.slot = el.value;
  };
  const onSubmit = (event) => {
    if (!/** @type {HTMLElement} */ (event.target).matches('[data-form="agenda"]')) return;
    event.preventDefault();
    const caso = getFocusCase();
    // Validação equivalente à do servidor: horário precisa estar entre os propostos e o link no formato do Meet.
    if (!caso.agendamento?.slotsSugeridos.includes(form.slot)) {
      form.error = 'Escolha um dos horários propostos.';
    } else if (!MEET_RE.test(form.link)) {
      form.error = 'Use um link do Google Meet no formato https://meet.google.com/abc-defg-hij.';
    } else {
      form.error = '';
    }
    if (form.error) {
      log.warn('Agenda recusada na validação');
      atualizarCaso(caso.id, {});
      return;
    }
    atualizarCaso(caso.id, { status: 'agendado', agendamento: { ...caso.agendamento, slot: form.slot, link: form.link } }, { actor: 'rh', text: `RH confirmou a consulta para ${fmtSlot(form.slot)} via Google Meet` });
    ctx.toast('Consulta confirmada. Colaborador e médico receberam o convite.', 'success');
    Object.assign(form, { slot: '', link: '', error: '' });
  };
  root.addEventListener('input', onInput);
  root.addEventListener('change', onInput);
  root.addEventListener('submit', onSubmit);
  return () => {
    offClick();
    root.removeEventListener('input', onInput);
    root.removeEventListener('change', onInput);
    root.removeEventListener('submit', onSubmit);
  };
};

/** @type {import('../journey/navigator.js').Screen} */
export const idCasosScreen = {
  frame: 'desktop',
  url: (ctx) => `id.mediquo.com.br/absenteismo/${ctx.params.modo === 'indicadores' ? 'indicadores' : 'casos'}`,
  render,
  bind,
};
