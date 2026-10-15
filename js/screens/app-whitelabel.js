/**
 * @file App de telessaúde white label (colaborador, Rota 1).
 * Sem push e sem botão "Iniciar consulta": no horário combinado pelo WhatsApp, o médico liga pelo
 * MediQuo Pro (Espanha) e a videochamada chega no chat do app, como nos atendimentos de hoje.
 */

import { delegate, esc, icon } from '../core/dom.js';
import { fmtSlot } from '../core/format.js';
import { atualizarCaso, getColaborador, getFocusCase } from '../core/store.js';
import { MEDICA_PROGRAMA } from '../data/seed.js';
import { phone, telaChamada } from './app-cliente.js';

/**
 * Chat do colaborador com a chamada chegando.
 * @param {import('../core/store.js').Caso} caso
 * @returns {string}
 */
const telaChat = (caso) => {
  const nome = (getColaborador(caso.colaboradorId)?.nome ?? '').split(' ')[0];
  let corpo = '';
  if (caso.desfecho) {
    corpo = `<div class="app-note">${icon('check', 'ic-sm')}<span>Consulta realizada. Obrigado por conversar com a equipe médica.</span></div>`;
  } else if (caso.status === 'agendado' && caso.agendamento?.slot) {
    corpo = `
      <div class="wl-chat">
        <span class="wl-sys">Consulta de acompanhamento · ${esc(fmtSlot(caso.agendamento.slot))}</span>
        <div class="wl-msg"><small>${esc(MEDICA_PROGRAMA.nome)}</small>Olá, ${esc(nome)}! Aqui é a ${esc(MEDICA_PROGRAMA.nome)}, da equipe de Telessaúde. Vou te ligar por vídeo agora.</div>
        <div class="wl-call">
          <span class="ring">${icon('video')}</span>
          <b>${esc(MEDICA_PROGRAMA.nome)}</b>
          <span>Videochamada recebida</span>
          <div class="wl-call-btns">
            <button type="button" class="no" data-action="recusar" aria-label="Recusar">${icon('phoneOff')}</button>
            <button type="button" class="yes" data-action="atender" aria-label="Atender">${icon('video')}</button>
          </div>
        </div>
      </div>`;
  } else {
    corpo = '<div class="app-empty"><p>Nenhuma consulta agendada. O horário é combinado pelo WhatsApp Telessaúde.</p><button type="button" class="app-btn" data-action="voltar-whatsapp">Ir para o WhatsApp</button></div>';
  }
  return phone(`
    <div class="app wl">
      <div class="app-head">${icon('arrowLeft')}<h1>Chat da consulta</h1></div>
      ${corpo}
    </div>`);
};

/** @type {import('../journey/navigator.js').Screen} */
export const appWhiteLabelScreen = {
  frame: 'phone',
  render: () => {
    const caso = getFocusCase();
    return caso.status === 'em_consulta' ? telaChamada() : telaChat(caso);
  },
  side: () => `
    <h3>App de telessaúde white label</h3>
    <ul>
      <li>Pode ser o app de outra marca, então não há push dedicado nem botão "Iniciar consulta".</li>
      <li>O horário foi combinado pelo WhatsApp Telessaúde.</li>
      <li>No horário, o médico abre o chat do paciente no MediQuo Pro (Espanha) e inicia a videochamada. O colaborador só atende.</li>
      <li>Nunca há atendimento por Google Meet.</li>
    </ul>`,
  bind: (root, ctx) => delegate(root, 'click', {
    atender: () => {
      const caso = getFocusCase();
      atualizarCaso(caso.id, { status: 'em_consulta' }, { actor: 'colaborador', text: 'Colaborador atendeu a videochamada no app de telessaúde (white label)' });
    },
    recusar: () => ctx.toast('Simulação: a equipe Telessaúde remarca pelo WhatsApp.'),
    encerrar: () => ctx.next(),
    'voltar-whatsapp': () => {
      const step = ctx.rota.etapas.find((e) => e.screen === 'whatsapp');
      if (step) ctx.goTo(step.id);
    },
  }),
};
