/**
 * @file MediQuo Pro · Caso de absenteísmo. Dados do atestado, histórico do colaborador e ação da rota:
 * validação documental (Rota 0), pedido de agenda ao RH (Rota 1) ou convite no app (Rota 2).
 */

import { delegate, esc, icon } from '../core/dom.js';
import { createLogger } from '../core/logger.js';
import {
  addDays, diffDays, fmtCnpj, fmtDate, fmtSlot, plural,
} from '../core/format.js';
import {
  STATUS, TODAY, atualizarCaso, empresaDoCaso, getColaborador, getFocusCase, horariosDisponiveis, listarCasos,
} from '../core/store.js';
import { lookupCid } from '../data/cid.js';
import { abrirAtestado } from '../ui/pdf-viewer.js';
import { goProHome, proShell } from './pro-shell.js';

const log = createLogger('pro.caso');

/** Horários selecionados pelo médico (por caso). */
const selecionados = new Map();

/**
 * @param {keyof STATUS} s
 * @returns {string}
 */
const badge = (s) => `<span class="badge ${STATUS[s].tone}">${esc(STATUS[s].label)}</span>`;

/**
 * Card com dados do atestado.
 * @param {import('../core/store.js').Caso} caso
 * @returns {string}
 */
const cardAtestado = (caso) => {
  const cid = caso.cid ? lookupCid(caso.cid) : null;
  const emp = empresaDoCaso(caso);
  const conf = caso.confianca;
  const extr = conf ? `<p class="pro-card-sub" style="margin-top:.5rem">${icon('sparkles', 'ic-sm')} Campos extraídos automaticamente do PDF: ${Object.values(conf).filter((v) => v >= 0.85).length} de ${Object.keys(conf).length} com alta confiança.</p>` : '';
  return `
    <div class="pro-card">
      <div class="pro-card-head"><div><h3 class="pro-card-title">Atestado</h3><p class="pro-card-sub">Recebido em ${esc(fmtDate(caso.criadoEm))} · ${esc(caso.enviadoPor)}</p></div>${badge(caso.status)}</div>
      <div class="pro-card-body pro-stack">
        <div class="pro-pdf-thumb"><span class="doc">PDF</span><div class="meta"><b>${esc(caso.arquivoNome)}</b>${caso.pdfBytes ? 'Arquivo original enviado pelo RH' : 'Atestado de exemplo'}</div><button type="button" class="pro-btn outline sm" data-action="ver-pdf">${icon('eye', 'ic-sm')} Abrir</button></div>
        <dl class="pro-kv">
          <dt>CID-10</dt><dd>${cid ? `<span class="cid" style="font-family:ui-monospace,monospace">${esc(cid.code)}</span> · ${esc(cid.desc)} <span class="badge neutral">${esc(cid.chapter)}</span>` : 'Não informado no documento'}</dd>
          <dt>Afastamento</dt><dd>${esc(plural(caso.dias, 'dia', 'dias'))} · ${esc(fmtDate(caso.dataInicio))} a ${esc(fmtDate(addDays(caso.dataInicio, caso.dias - 1)))}</dd>
          <dt>Emissor</dt><dd>${esc(caso.medicoEmissor || '—')} · ${esc(caso.crm || 'CRM não informado')}</dd>
          <dt>Empresa</dt><dd>${esc(emp?.razao ?? '')} · ${esc(fmtCnpj(emp?.cnpj ?? ''))}</dd>
        </dl>
        ${extr}
      </div>
    </div>`;
};

/**
 * Histórico de atestados do colaborador e triagem.
 * @param {import('../core/store.js').Caso} caso
 * @returns {string}
 */
const cardHistorico = (caso) => {
  const hist = listarCasos().filter((c) => c.colaboradorId === caso.colaboradorId).sort((a, b) => b.dataInicio.localeCompare(a.dataInicio));
  const t = caso.triagem;
  return `
    <div class="pro-card">
      <div class="pro-card-head"><div><h3 class="pro-card-title">Histórico do colaborador</h3><p class="pro-card-sub">${esc(plural(hist.length, 'atestado', 'atestados'))} · ${esc(plural(t.reincidencia, 'atestado', 'atestados'))} nos últimos 90 dias</p></div>
        <span class="badge ${t.elegivel ? (t.prioridade === 'alta' ? 'alert' : 'warn') : 'neutral'}">${t.elegivel ? `Elegível · prioridade ${esc(t.prioridade)}` : 'Fora dos critérios'}</span></div>
      <div class="pro-card-body pro-stack">
        <ul class="pro-history">${hist.map((h) => {
    const cid = h.cid ? lookupCid(h.cid) : null;
    return `<li class="${h.id === caso.id ? 'cur' : ''}"><span class="d">${esc(fmtDate(h.dataInicio))}</span><span>${esc(cid ? `${cid.code} · ${cid.desc}` : 'CID não informado')} · ${esc(plural(h.dias, 'dia', 'dias'))}</span>${badge(h.status)}</li>`;
  }).join('')}</ul>
        ${t.motivos.length ? `<div><p class="pro-label">Critérios de entrada atingidos</p><ul class="pro-motivos">${t.motivos.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></div>` : ''}
      </div>
    </div>`;
};

/**
 * Seleção de horários da agenda do médico.
 * @param {import('../core/store.js').Caso} caso
 * @returns {string}
 */
const slotPicker = (caso) => {
  const slots = horariosDisponiveis(6);
  if (!selecionados.has(caso.id)) selecionados.set(caso.id, new Set(slots.slice(0, 3)));
  const sel = selecionados.get(caso.id);
  return `<div class="pro-slots">${slots.map((s, i) => {
    const [dia, hora] = fmtSlot(s).split(' · ');
    return `<label class="pro-slot"><input type="checkbox" id="pslot${i}" value="${esc(s)}" data-action="slot" ${sel.has(s) ? 'checked' : ''}><span><b>${esc(hora)}</b><small>${esc(dia)}</small></span></label>`;
  }).join('')}</div>`;
};

/**
 * Checagens documentais automáticas (Rota 0).
 * @param {import('../core/store.js').Caso} caso
 * @returns {Array<{ok: boolean, text: string}>}
 */
const checagens = (caso) => {
  const crmOk = /^CRM-[A-Z]{2} \d{4,7}$/.test(caso.crm);
  const emissaoOk = caso.dataEmissao <= TODAY;
  const retro = diffDays(caso.dataEmissao, caso.dataInicio);
  return [
    { ok: crmOk, text: crmOk ? `CRM no formato válido (${caso.crm})` : 'CRM ausente ou fora do padrão CRM-UF 000000' },
    { ok: emissaoOk, text: emissaoOk ? 'Data de emissão não é futura' : 'Data de emissão no futuro' },
    { ok: retro >= -2, text: retro >= -2 ? 'Início do afastamento compatível com a emissão' : `Afastamento começa ${Math.abs(retro)} dias antes da emissão` },
    { ok: caso.dias <= 15, text: caso.dias <= 15 ? 'Até 15 dias: responsabilidade da empresa' : 'Acima de 15 dias: orientar encaminhamento ao INSS' },
    { ok: Boolean(caso.cid), text: caso.cid ? 'CID presente no documento' : 'CID não informado (permitido, depende do paciente)' },
  ];
};

/**
 * Painel de ação conforme a rota.
 * @param {import('../core/store.js').Caso} caso
 * @param {string} modo
 * @returns {string}
 */
const cardAcao = (caso, modo) => {
  const col = getColaborador(caso.colaboradorId);
  if (modo === 'registro') {
    const checks = checagens(caso);
    const feito = caso.status === 'validado';
    return `
      <div class="pro-card">
        <div class="pro-card-head"><div><h3 class="pro-card-title">Revisão documental</h3><p class="pro-card-sub">Checagens automáticas sobre os dados extraídos</p></div></div>
        <div class="pro-card-body pro-stack">
          <ul class="pro-checks">${checks.map((c) => `<li><span class="${c.ok ? 'ok' : 'warn'}">${icon(c.ok ? 'check' : 'alert', 'ic-sm')}</span>${esc(c.text)}</li>`).join('')}</ul>
          ${feito ? `<div class="pro-callout">${icon('check')}<span>Documento validado. O RH já vê o novo status no ID.</span></div><button type="button" class="pro-btn" data-action="next">Ver status no ID ${icon('chevronRight', 'ic-sm')}</button>`
    : `<div class="pro-split"><button type="button" class="pro-btn" data-action="validar">${icon('check', 'ic-sm')} Validar documento</button><button type="button" class="pro-btn outline" data-action="reenvio">Pedir reenvio ao RH</button></div>`}
        </div>
      </div>`;
  }
  const canal = modo === 'meet' ? 'meet' : 'app';
  const enviado = caso.agendamento && caso.agendamento.canal === canal && ['aguardando_rh', 'convite_enviado', 'agendado', 'em_consulta', 'em_acompanhamento', 'concluido', 'encaminhado'].includes(caso.status);
  if (enviado) {
    const slots = caso.agendamento.slotsSugeridos.map((s) => `<li>${esc(fmtSlot(s))}</li>`).join('');
    const proximo = canal === 'meet' ? 'Ver pedido no ID' : 'Ver notificação no celular';
    return `
      <div class="pro-card">
        <div class="pro-card-head"><div><h3 class="pro-card-title">${canal === 'meet' ? 'Pedido enviado ao RH' : 'Convite enviado pelo app'}</h3><p class="pro-card-sub">${esc(col?.nome ?? '')}</p></div>${badge(caso.status)}</div>
        <div class="pro-card-body pro-stack">
          <div class="pro-callout">${icon(canal === 'meet' ? 'clock' : 'bell')}<span>${canal === 'meet' ? 'O RH vai combinar um dos horários com o colaborador e informar o link do Google Meet.' : 'O colaborador recebeu uma notificação push e escolhe o horário no app.'}</span></div>
          <div><p class="pro-label">Horários oferecidos</p><ul class="pro-motivos">${slots}</ul></div>
          ${caso.agendamento.slot ? `<p class="pro-label">Confirmado: <b>${esc(fmtSlot(caso.agendamento.slot))}</b></p>` : ''}
          <button type="button" class="pro-btn" data-action="next">${esc(proximo)} ${icon('chevronRight', 'ic-sm')}</button>
        </div>
      </div>`;
  }
  return `
    <div class="pro-card">
      <div class="pro-card-head"><div><h3 class="pro-card-title">${canal === 'meet' ? 'Pedir consulta via RH' : 'Liberar agendamento no app'}</h3><p class="pro-card-sub">Escolha os horários da sua agenda que serão oferecidos</p></div></div>
      <div class="pro-card-body pro-stack">
        ${slotPicker(caso)}
        ${canal === 'app' ? `<div class="pro-mini"><span>Prévia da notificação</span><b>MediQuo · Avaliação de afastamento</b><span>Olá, ${esc((col?.nome ?? '').split(' ')[0])}. A equipe médica quer acompanhar sua recuperação. Escolha um horário para conversar.</span></div>`
    : `<div class="pro-mini"><span>O RH receberá</span><b>Pedido de agenda · ${esc(col?.nome ?? '')}</b><span>Somente nome, horários e telefone de contato. Nenhum dado clínico.</span></div>`}
        <button type="button" class="pro-btn" data-action="enviar-${canal}">${icon(canal === 'meet' ? 'send' : 'bell', 'ic-sm')} ${canal === 'meet' ? 'Enviar pedido ao RH' : 'Enviar convite pelo app'}</button>
      </div>
    </div>`;
};

/**
 * @param {import('../journey/navigator.js').ScreenCtx} ctx
 * @returns {string}
 */
const render = (ctx) => {
  const caso = getFocusCase();
  const col = getColaborador(caso.colaboradorId);
  return proShell({
    title: `${col?.nome ?? 'Caso'} · ${caso.id}`,
    subtitle: `${col?.cargo ?? ''} · Absenteísmo`,
    actions: `<button type="button" class="pro-btn outline" data-action="voltar">${icon('arrowLeft', 'ic-sm')} Painel</button>`,
    content: `<div class="pro-case"><div class="pro-stack">${cardAtestado(caso)}${cardHistorico(caso)}</div><div class="pro-stack">${cardAcao(caso, ctx.params.modo ?? 'meet')}</div></div>`,
  });
};

/**
 * @param {HTMLElement} root
 * @param {import('../journey/navigator.js').ScreenCtx} ctx
 * @returns {function(): void}
 */
const bind = (root, ctx) => {
  /**
   * @param {'meet'|'app'} canal
   */
  const enviar = (canal) => {
    const caso = getFocusCase();
    const slots = [...(selecionados.get(caso.id) ?? [])].sort();
    if (slots.length === 0) {
      ctx.toast('Escolha pelo menos um horário.', 'error');
      return;
    }
    const status = canal === 'meet' ? 'aguardando_rh' : 'convite_enviado';
    const text = canal === 'meet' ? `Médico pediu ao RH agenda em ${slots.length} horário(s)` : `Convite enviado pelo app com ${slots.length} horário(s); push disparado`;
    atualizarCaso(caso.id, { status, agendamento: { canal, slotsSugeridos: slots, slot: null, link: null } }, { actor: 'medico', text });
    log.info('Agenda solicitada', { canal, slots: slots.length });
    ctx.toast(canal === 'meet' ? 'Pedido enviado ao RH.' : 'Convite enviado. O colaborador recebeu o push.', 'success');
  };
  const off = delegate(root, 'click', {
    'ver-pdf': () => abrirAtestado(getFocusCase()),
    voltar: () => goProHome(ctx),
    next: () => ctx.next(),
    slot: (el) => {
      const input = /** @type {HTMLInputElement} */ (el);
      const set = selecionados.get(getFocusCase().id);
      if (!set) return;
      if (input.checked) set.add(input.value); else set.delete(input.value);
    },
    'enviar-meet': () => enviar('meet'),
    'enviar-app': () => enviar('app'),
    validar: () => {
      const caso = getFocusCase();
      atualizarCaso(caso.id, { status: 'validado' }, { actor: 'medico', text: 'Equipe médica validou o documento' });
      ctx.toast('Documento validado.', 'success');
    },
    reenvio: () => {
      const caso = getFocusCase();
      atualizarCaso(caso.id, { status: 'registrado' }, { actor: 'medico', text: 'Equipe médica pediu reenvio do atestado com CRM legível' });
      ctx.toast('Pedido de reenvio registrado para o RH.');
    },
    'pro-home': () => goProHome(ctx),
  });
  return off;
};

/** @type {import('../journey/navigator.js').Screen} */
export const proCasoScreen = {
  frame: 'desktop',
  url: () => `pro.mediquo.com.br/admin/absenteismo/${getFocusCase().id.toLowerCase()}`,
  render,
  bind,
};
