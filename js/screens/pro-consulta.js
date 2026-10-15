/**
 * @file MediQuo Pro · Consulta de absenteísmo e registro de desfecho.
 * Rota 1: chamada no Google Meet. Rota 2: lista de agendamentos e atendimento pelo
 * MediQuo Pro (Espanha), o PEP onde a videochamada acontece hoje.
 * A nota clínica fica no prontuário; ao RH vai apenas um texto administrativo padronizado.
 */

import { delegate, esc, icon } from '../core/dom.js';
import { createLogger } from '../core/logger.js';
import { addDays, fmtDate, fmtSlot, plural } from '../core/format.js';
import {
  STATUS, TODAY, atualizarCaso, getColaborador, getFlag, getFocusCase, listarCasos, setFlag,
} from '../core/store.js';
import { lookupCid } from '../data/cid.js';
import { DESFECHOS } from '../data/rules.js';
import { abrirAtestado } from '../ui/pdf-viewer.js';
import { goProHome, proShell } from './pro-shell.js';

const log = createLogger('pro.consulta');

/** Estado local do formulário. */
const form = { tipo: 'acompanhamento', nota: '' };

const AGENDADOS = new Set(['agendado', 'em_consulta']);

/** Endereço do MediQuo Pro (Espanha), o PEP onde a videochamada acontece. */
const PEP_HOST = 'web.mediquo.com/chat';

/** Horários de exibição para agendamentos da semente, que não têm horário salvo. */
const HORAS_SEMENTE = Object.freeze(['09:00', '10:30', '16:30']);

/**
 * @typedef {Object} ItemAgenda
 * @property {import('../core/store.js').Caso} caso
 * @property {string} slot 'AAAA-MM-DDTHH:mm'.
 */

/**
 * Chave da flag de sessão que marca o atendimento aberto no PEP.
 * @param {string} casoId
 * @returns {string}
 */
const flagPep = (casoId) => `pep:${casoId}`;

/**
 * Agendamentos de absenteísmo do médico, em ordem de horário.
 * O caso em foco sempre entra quando tem horário confirmado.
 * @param {import('../core/store.js').Caso} foco
 * @returns {ItemAgenda[]}
 */
const montarAgenda = (foco) => {
  let semHorario = 0;
  return listarCasos()
    .filter((c) => (c.id === foco.id && Boolean(c.agendamento?.slot)) || AGENDADOS.has(c.status))
    .map((c) => {
      if (c.agendamento?.slot) return { caso: c, slot: c.agendamento.slot };
      const hora = HORAS_SEMENTE[semHorario % HORAS_SEMENTE.length];
      semHorario += 1;
      return { caso: c, slot: `${TODAY}T${hora}` };
    })
    .sort((a, b) => a.slot.localeCompare(b.slot));
};

/**
 * Lista de agendamentos no MediQuo Pro (Rota 2).
 * @param {import('../core/store.js').Caso} foco
 * @returns {string}
 */
const painelAgenda = (foco) => {
  const itens = montarAgenda(foco);
  const linhas = itens.map(({ caso, slot }) => {
    const col = getColaborador(caso.colaboradorId);
    const [data, hora] = slot.split('T');
    const [, mes, dia] = data.split('-');
    return `
      <li class="${caso.id === foco.id ? 'cur' : ''}">
        <span class="d"><b>${esc(hora)}</b><br>${esc(`${dia}/${mes}`)}</span>
        <span>${esc(col?.nome ?? '')}<br><small class="pro-label">Avaliação de afastamento · <span style="white-space:nowrap">${esc(caso.id)}</span></small></span>
        <span class="badge ${STATUS[caso.status].tone}">${esc(STATUS[caso.status].label)}</span>
      </li>`;
  }).join('');
  return `
    <div class="pro-card">
      <div class="pro-card-head"><div><h3 class="pro-card-title">Agendamentos</h3><p class="pro-card-sub">Consultas de absenteísmo marcadas pelo app</p></div><span class="badge neutral">${icon('calendar', 'ic-sm')} ${itens.length}</span></div>
      <div class="pro-card-body">${linhas ? `<ul class="pro-history">${linhas}</ul>` : '<p class="pro-empty">Nenhuma consulta agendada.</p>'}</div>
    </div>`;
};

/**
 * Pedido para atender pelo MediQuo Pro (Espanha) (Rota 2). A videochamada não acontece neste painel.
 * @param {import('../core/store.js').Caso} caso
 * @returns {string}
 */
const painelAtendimentoPep = (caso) => {
  const col = getColaborador(caso.colaboradorId);
  const quando = caso.agendamento?.slot ? fmtSlot(caso.agendamento.slot) : 'horário a definir';
  const aberto = getFlag(flagPep(caso.id));
  let badge = `<span class="badge ${STATUS[caso.status].tone}">${esc(STATUS[caso.status].label)}</span>`;
  if (aberto) badge = '<span class="badge ok">Atendimento aberto</span>';
  else if (caso.status === 'em_consulta') badge = '<span class="badge primary">Paciente aguardando</span>';
  const acao = aberto
    ? `<div class="pro-mini"><span>Atendimento aberto no MediQuo Pro (Espanha)</span><b>Ao terminar a videochamada, registre o desfecho ao lado.</b></div>
       <button type="button" class="pro-btn outline" data-action="atender-pep">${icon('video', 'ic-sm')} Abrir o MediQuo Pro (Espanha) de novo</button>`
    : `<button type="button" class="pro-btn" data-action="atender-pep">${icon('video', 'ic-sm')} Atender pelo MediQuo Pro (Espanha)</button>`;
  return `
    <div class="pro-card">
      <div class="pro-card-head"><div><h3 class="pro-card-title">Atender pelo MediQuo Pro (Espanha)</h3><p class="pro-card-sub">${esc(quando)}</p></div>${badge}</div>
      <div class="pro-card-body pro-stack">
        <div class="pro-callout">${icon('messageCircle')}<span>A videochamada acontece no MediQuo Pro (Espanha), no chat de <b>${esc(col?.nome ?? 'paciente')}</b>, como nos atendimentos de hoje. Este painel não abre vídeo.</span></div>
        <div class="pro-mini"><span>Onde atender</span><b>${esc(PEP_HOST)}</b><span>Abra o chat do paciente e inicie a videochamada no horário marcado.</span></div>
        ${acao}
      </div>
    </div>`;
};

/**
 * Painel da chamada: Meet externo (Rota 1) ou agendamentos + atendimento no PEP (Rota 2).
 * @param {import('../core/store.js').Caso} caso
 * @param {'meet'|'app'} canal
 * @returns {string}
 */
const painelChamada = (caso, canal) => {
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
  return `${painelAgenda(caso)}${painelAtendimentoPep(caso)}`;
};

/**
 * Formulário de desfecho.
 * @param {import('../core/store.js').Caso} caso
 * @returns {string}
 */
const painelDesfecho = (caso) => {
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
  const tipos = ['acompanhamento', 'manter', 'encaminhar_mt'];
  const desc = {
    manter: 'Condição clínica compatível com o período do atestado.',
    acompanhamento: 'Nova conversa ou especialidade antes de concluir.',
    encaminhar_mt: 'Questão de aptidão, homologação ou retorno ocupacional.',
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
  const pendente = !AGENDADOS.has(caso.status) && !caso.desfecho;
  const aviso = pendente ? `
    <div class="pro-callout warn">${icon('alert')}<span>Este caso ainda não tem consulta confirmada (${esc(STATUS[caso.status].label.toLowerCase())}). Volte às etapas anteriores da jornada ou atenda mesmo assim para seguir a simulação.</span>
      <button type="button" class="pro-btn outline sm" data-action="forcar" style="margin-left:auto">Atender mesmo assim</button></div>` : '';
  return proShell({
    title: 'Consulta de acompanhamento',
    subtitle: `Absenteísmo · ${canal === 'meet' ? 'Google Meet' : 'atendimento pelo MediQuo Pro (Espanha)'}`,
    actions: `<button type="button" class="pro-btn outline" data-action="voltar">${icon('arrowLeft', 'ic-sm')} Painel</button>`,
    content: `${aviso}<div class="pro-case"><div class="pro-stack">${painelChamada(caso, canal)}${painelPaciente(caso)}</div><div class="pro-stack">${painelDesfecho(caso)}</div></div>`,
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
    'atender-pep': () => {
      const caso = getFocusCase();
      const key = flagPep(caso.id);
      if (!getFlag(key)) {
        // Atualiza o caso antes da flag: os dois disparam re-render e a flag fecha o fluxo.
        atualizarCaso(caso.id, caso.status === 'agendado' ? { status: 'em_consulta' } : {}, { actor: 'medico', text: 'Atendimento aberto no MediQuo Pro (Espanha)' });
        setFlag(key, true);
        log.info('Atendimento aberto no PEP', { caso: caso.id });
      }
      ctx.toast(`Simulação: no produto real, abre o chat do paciente em ${PEP_HOST}.`);
    },
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
