/**
 * @file MediQuo Pro · Consulta de absenteísmo e registro de desfecho.
 * A nota clínica fica no prontuário; ao RH vai apenas um texto administrativo padronizado.
 */

import { delegate, esc, icon } from '../core/dom.js';
import { createLogger } from '../core/logger.js';
import { addDays, fmtDate, fmtSlot, initials, plural } from '../core/format.js';
import {
  STATUS, TODAY, atualizarCaso, getColaborador, getFocusCase,
} from '../core/store.js';
import { lookupCid } from '../data/cid.js';
import { DESFECHOS } from '../data/rules.js';
import { abrirAtestado } from '../ui/pdf-viewer.js';
import { goProHome, proShell } from './pro-shell.js';

const log = createLogger('pro.consulta');

/** Estado local do formulário. */
const form = { tipo: 'acompanhamento', nota: '' };

const AGENDADOS = new Set(['agendado', 'em_consulta']);

/**
 * Painel da chamada (Meet externo ou vídeo do app).
 * @param {import('../core/store.js').Caso} caso
 * @param {'meet'|'app'} canal
 * @returns {string}
 */
const painelChamada = (caso, canal) => {
  const col = getColaborador(caso.colaboradorId);
  const quando = caso.agendamento?.slot ? fmtSlot(caso.agendamento.slot) : 'horário a definir';
  if (canal === 'meet') {
    return `
      <div class="pro-card">
        <div class="pro-card-head"><div><h3 class="pro-card-title">Consulta por Google Meet</h3><p class="pro-card-sub">${esc(quando)}</p></div><span class="badge info">${icon('link', 'ic-sm')} externo</span></div>
        <div class="pro-card-body pro-stack">
          <div class="pro-mini"><span>Link informado pelo RH</span><b style="word-break:break-all">${esc(caso.agendamento?.link ?? 'Aguardando o RH')}</b></div>
          <div class="pro-callout warn">${icon('alert')}<span>A chamada acontece fora da MediQuo. Registre o desfecho aqui ao final para manter o prontuário completo.</span></div>
          <button type="button" class="pro-btn outline" data-action="goto" data-step="chamada">${icon('video', 'ic-sm')} Ver a chamada</button>
        </div>
      </div>`;
  }
  return `
    <div class="pro-card">
      <div class="pro-card-head"><div><h3 class="pro-card-title">Videoconsulta MediQuo</h3><p class="pro-card-sub">${esc(quando)}</p></div><span class="badge ${caso.status === 'em_consulta' ? 'ok' : 'neutral'}">${caso.status === 'em_consulta' ? 'Paciente na sala' : 'Aguardando paciente'}</span></div>
      <div class="pro-card-body">
        <div class="pro-call">
          <span class="tag"><i></i>${caso.status === 'em_consulta' ? 'Em chamada · 04:12' : 'Sala aberta'}</span>
          <span class="big">${esc(initials(col?.nome))}</span>
          <span class="self">Você</span>
          <div class="bar"><span>${icon('mic')}</span><span>${icon('video')}</span><span class="end">${icon('phoneOff')}</span></div>
        </div>
      </div>
    </div>`;
};

/**
 * Formulário de desfecho.
 * @param {import('../core/store.js').Caso} caso
 * @param {boolean} ocupacional Destaca o encaminhamento à Medicina do Trabalho (Rota 3).
 * @returns {string}
 */
const painelDesfecho = (caso, ocupacional) => {
  if (caso.desfecho) {
    return `
      <div class="pro-card">
        <div class="pro-card-head"><div><h3 class="pro-card-title">Desfecho registrado</h3><p class="pro-card-sub">${esc(fmtDate(caso.desfecho.registradoEm))}</p></div><span class="badge ${STATUS[caso.status].tone}">${esc(STATUS[caso.status].label)}</span></div>
        <div class="pro-card-body pro-stack">
          <div class="pro-mini"><span>Enviado ao RH</span><b>${esc(DESFECHOS[caso.desfecho.tipo]?.label ?? '')}</b><span>${esc(caso.desfecho.recomendacaoRH)}</span></div>
          <button type="button" class="pro-btn" data-action="next">Ver devolutiva no ID ${icon('chevronRight', 'ic-sm')}</button>
        </div>
      </div>`;
  }
  const tipos = ocupacional ? ['encaminhar_mt', 'acompanhamento', 'manter'] : ['acompanhamento', 'manter', 'encaminhar_mt'];
  const desc = {
    manter: 'Condição clínica compatível com o período do atestado.',
    acompanhamento: 'Nova conversa ou especialidade antes de concluir.',
    encaminhar_mt: ocupacional ? 'Há possibilidade de retorno antes do prazo. A Medicina do Trabalho decide aptidão.' : 'Questão de aptidão, homologação ou retorno ocupacional.',
  };
  if (!tipos.includes(form.tipo)) [form.tipo] = tipos;
  return `
    <div class="pro-card">
      <div class="pro-card-head"><div><h3 class="pro-card-title">Desfecho da consulta</h3><p class="pro-card-sub">A nota clínica fica no prontuário</p></div></div>
      <form class="pro-card-body pro-stack" data-form="desfecho" novalidate>
        <div class="pro-radio">${tipos.map((t) => `<label><input type="radio" name="tipo" value="${t}" data-field="tipo" ${form.tipo === t ? 'checked' : ''}><span><b>${esc(DESFECHOS[t].label)}</b><small>${esc(desc[t])}</small></span></label>`).join('')}</div>
        <div><label class="pro-label" for="nota">Nota clínica (prontuário, não vai ao RH)</label><textarea id="nota" class="pro-textarea" data-field="nota" maxlength="2000" placeholder="Evolução, sintomas atuais, capacidade funcional, sinais de alerta, conduta…">${esc(form.nota)}</textarea></div>
        <div class="pro-mini"><span>Texto que o RH vai receber</span><b>${esc(DESFECHOS[form.tipo].label)}</b><span>${esc(DESFECHOS[form.tipo].rh)}</span></div>
        <button type="submit" class="pro-btn">${icon('check', 'ic-sm')} Registrar desfecho</button>
      </form>
    </div>`;
};

/**
 * Resumo do paciente.
 * @param {import('../core/store.js').Caso} caso
 * @returns {string}
 */
const painelPaciente = (caso) => {
  const col = getColaborador(caso.colaboradorId);
  const cid = caso.cid ? lookupCid(caso.cid) : null;
  return `
    <div class="pro-card">
      <div class="pro-card-head"><div><h3 class="pro-card-title">${esc(col?.nome ?? '')}</h3><p class="pro-card-sub">${esc(col?.cargo ?? '')} · ${esc(caso.id)}</p></div><button type="button" class="pro-btn outline sm" data-action="ver-pdf">${icon('fileText', 'ic-sm')} Atestado</button></div>
      <div class="pro-card-body"><dl class="pro-kv">
        <dt>CID-10</dt><dd>${esc(cid ? `${cid.code} · ${cid.desc}` : 'Não informado')}</dd>
        <dt>Afastamento</dt><dd>${esc(plural(caso.dias, 'dia', 'dias'))} · até ${esc(fmtDate(addDays(caso.dataInicio, caso.dias - 1)))}</dd>
        <dt>Reincidência</dt><dd>${esc(plural(caso.triagem.reincidencia, 'atestado', 'atestados'))} em 90 dias</dd>
        <dt>Triagem</dt><dd>${esc(caso.triagem.motivos.join(' · ') || 'Fora dos critérios automáticos')}</dd>
      </dl></div>
    </div>`;
};

/**
 * @param {import('../journey/navigator.js').ScreenCtx} ctx
 * @returns {string}
 */
const render = (ctx) => {
  const caso = getFocusCase();
  const canal = ctx.params.canal === 'meet' ? 'meet' : 'app';
  const ocupacional = ctx.params.ocupacional === '1';
  const pendente = !AGENDADOS.has(caso.status) && !caso.desfecho;
  const aviso = pendente ? `
    <div class="pro-callout warn">${icon('alert')}<span>Este caso ainda não tem consulta confirmada (${esc(STATUS[caso.status].label.toLowerCase())}). Volte às etapas anteriores da jornada ou atenda mesmo assim para seguir a simulação.</span>
      <button type="button" class="pro-btn outline sm" data-action="forcar" style="margin-left:auto">Atender mesmo assim</button></div>` : '';
  return proShell({
    title: 'Consulta de acompanhamento',
    subtitle: `Absenteísmo · ${canal === 'meet' ? 'Google Meet' : 'App MediQuo'}${ocupacional ? ' · com avaliação ocupacional' : ''}`,
    actions: `<button type="button" class="pro-btn outline" data-action="voltar">${icon('arrowLeft', 'ic-sm')} Painel</button>`,
    content: `${aviso}<div class="pro-case"><div class="pro-stack">${painelChamada(caso, canal)}${painelPaciente(caso)}</div><div class="pro-stack">${painelDesfecho(caso, ocupacional)}</div></div>`,
  });
};

/**
 * @param {HTMLElement} root
 * @param {import('../journey/navigator.js').ScreenCtx} ctx
 * @returns {function(): void}
 */
const bind = (root, ctx) => {
  const offClick = delegate(root, 'click', {
    'ver-pdf': () => abrirAtestado(getFocusCase()),
    voltar: () => goProHome(ctx),
    'pro-home': () => goProHome(ctx),
    next: () => ctx.next(),
    goto: (el) => ctx.goTo(el.dataset.step),
    forcar: () => {
      const caso = getFocusCase();
      const slot = caso.agendamento?.slot ?? `${TODAY}T15:30`;
      atualizarCaso(caso.id, {
        status: 'em_consulta',
        agendamento: { canal: ctx.params.canal === 'meet' ? 'meet' : 'app', slotsSugeridos: caso.agendamento?.slotsSugeridos ?? [slot], slot, link: caso.agendamento?.link ?? null },
      }, { actor: 'sistema', text: 'Consulta iniciada (simulação)' });
    },
  });
  const onChange = (event) => {
    const el = /** @type {HTMLInputElement} */ (event.target);
    if (el.dataset.field === 'tipo') {
      form.tipo = el.value;
      const caso = getFocusCase();
      atualizarCaso(caso.id, {});
    }
  };
  const onInput = (event) => {
    const el = /** @type {HTMLTextAreaElement} */ (event.target);
    if (el.dataset.field === 'nota') form.nota = el.value;
  };
  const onSubmit = (event) => {
    if (!/** @type {HTMLElement} */ (event.target).matches('[data-form="desfecho"]')) return;
    event.preventDefault();
    const caso = getFocusCase();
    const def = DESFECHOS[form.tipo];
    if (!def) return;
    atualizarCaso(caso.id, {
      status: /** @type {any} */ (def.status),
      desfecho: { tipo: /** @type {any} */ (form.tipo), recomendacaoRH: def.rh, registradoEm: TODAY },
    }, { actor: 'medico', text: `Consulta realizada. Devolutiva: ${def.label}` });
    log.info('Desfecho registrado', { tipo: form.tipo, notaChars: form.nota.length });
    ctx.toast('Desfecho registrado. O RH recebeu a devolutiva.', 'success');
    Object.assign(form, { tipo: 'acompanhamento', nota: '' });
  };
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  root.addEventListener('submit', onSubmit);
  return () => {
    offClick();
    root.removeEventListener('change', onChange);
    root.removeEventListener('input', onInput);
    root.removeEventListener('submit', onSubmit);
  };
};

/** @type {import('../journey/navigator.js').Screen} */
export const proConsultaScreen = {
  frame: 'desktop',
  url: () => `pro.mediquo.com.br/admin/absenteismo/${getFocusCase().id.toLowerCase()}/consulta`,
  render,
  bind,
};
