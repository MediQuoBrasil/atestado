/**
 * @file App de telessaúde white label (colaborador, Rota 1).
 * Sem push e sem botão "Iniciar consulta": no dia e horário combinados com o secretário pelo WhatsApp,
 * o colaborador procura o médico nas conversas do app e inicia a videochamada pelo chat.
 * O médico atende pelo MediQuo Pro (Espanha), como nos atendimentos de hoje.
 */

import { delegate, esc, icon } from '../core/dom.js';
import { createLogger } from '../core/logger.js';
import { fmtSlot, initials } from '../core/format.js';
import { atualizarCaso, getFocusCase } from '../core/store.js';
import { MEDICA_PROGRAMA } from '../data/seed.js';
import { phone, telaChamada } from './app-cliente.js';

const log = createLogger('app.whitelabel');

const MEDICA = MEDICA_PROGRAMA.nome;

/** Conversa aberta no app (por caso). Estado só de navegação, sem efeito no caso. */
const nav = { casoId: '', chatAberto: false };

/**
 * Avatar com iniciais.
 * @param {string} nome
 * @returns {string}
 */
const avatar = (nome) => `<span class="wl-av" aria-hidden="true">${esc(initials(nome.replace(/^Dra?\. /, '')))}</span>`;

/**
 * Lista de conversas: o colaborador procura o médico.
 * @param {import('../core/store.js').Caso} caso
 * @returns {string}
 */
const telaConversas = (caso) => `
  <div class="app wl">
    <div class="app-head">${icon('arrowLeft')}<h1>Conversas</h1></div>
    <div class="wl-search">${icon('search', 'ic-sm')}<span>Procurar profissional</span></div>
    <div class="wl-list">
      <button type="button" class="wl-item hl" data-action="abrir-chat">
        ${avatar(MEDICA)}
        <span class="wl-item-txt"><b>${esc(MEDICA)}</b><small>Clínica geral · consulta ${esc(fmtSlot(caso.agendamento?.slot ?? ''))}</small></span>
        <span class="app-pill green">Agendada</span>
      </button>
      <div class="wl-item muted">
        ${avatar('Paula Nogueira')}
        <span class="wl-item-txt"><b>Paula Nogueira</b><small>Nutrição · 24 de agosto</small></span>
      </div>
    </div>
    <div class="app-note">${icon('messageCircle', 'ic-sm')}<span>No horário combinado pelo WhatsApp, abra a conversa com a ${esc(MEDICA)} e toque na câmera.</span></div>
  </div>`;

/**
 * Conversa com o médico, com a videochamada no topo como em qualquer chat do app.
 * @param {import('../core/store.js').Caso} caso
 * @returns {string}
 */
const telaChatMedico = (caso) => `
  <div class="app wl">
    <div class="wl-chathead">
      <button type="button" class="wl-icon" data-action="voltar-lista" aria-label="Voltar às conversas">${icon('arrowLeft')}</button>
      ${avatar(MEDICA)}
      <span class="wl-item-txt"><b>${esc(MEDICA)}</b><small>Clínica geral</small></span>
      <button type="button" class="wl-icon wl-video" data-action="videochamada" aria-label="Iniciar videochamada">${icon('video')}</button>
    </div>
    <div class="wl-chat">
      <span class="wl-sys">Consulta de acompanhamento · ${esc(fmtSlot(caso.agendamento?.slot ?? ''))}</span>
      <div class="wl-msg"><small>${esc(MEDICA)}</small>Olá! Estou disponível no horário combinado. Quando quiser, é só me chamar por vídeo aqui no chat.</div>
    </div>
  </div>`;

/**
 * Tela do app conforme o estado do caso.
 * @param {import('../core/store.js').Caso} caso
 * @returns {string}
 */
const telaApp = (caso) => {
  if (caso.desfecho) {
    return phone(`<div class="app wl"><div class="app-head">${icon('arrowLeft')}<h1>Conversas</h1></div><div class="app-note">${icon('check', 'ic-sm')}<span>Consulta realizada. Obrigado por conversar com a equipe médica.</span></div></div>`);
  }
  if (caso.status !== 'agendado' || !caso.agendamento?.slot) {
    return phone(`<div class="app wl"><div class="app-head">${icon('arrowLeft')}<h1>Conversas</h1></div><div class="app-empty"><p>Nenhuma consulta marcada. O secretário Telessaúde combina o horário com você pelo WhatsApp.</p><button type="button" class="app-btn" data-action="voltar-whatsapp">Ir para o WhatsApp</button></div></div>`);
  }
  return phone(nav.chatAberto ? telaChatMedico(caso) : telaConversas(caso));
};

/** @type {import('../journey/navigator.js').Screen} */
export const appWhiteLabelScreen = {
  frame: 'phone',
  render: () => {
    const caso = getFocusCase();
    if (nav.casoId !== caso.id) Object.assign(nav, { casoId: caso.id, chatAberto: false });
    return caso.status === 'em_consulta' ? telaChamada() : telaApp(caso);
  },
  side: () => `
    <h3>App de telessaúde white label</h3>
    <ul>
      <li>Pode ser o app de outra marca, então não há push dedicado nem botão "Iniciar consulta".</li>
      <li>O dia e o horário foram combinados com o secretário pelo WhatsApp.</li>
      <li>No horário, o colaborador procura a ${esc(MEDICA)} nas conversas, abre o chat e toca na câmera.</li>
      <li>O médico atende a chamada pelo MediQuo Pro (Espanha). Nunca há atendimento por Google Meet.</li>
    </ul>`,
  bind: (root, ctx) => delegate(root, 'click', {
    'abrir-chat': () => {
      nav.chatAberto = true;
      atualizarCaso(getFocusCase().id, {});
    },
    'voltar-lista': () => {
      nav.chatAberto = false;
      atualizarCaso(getFocusCase().id, {});
    },
    videochamada: () => {
      const caso = getFocusCase();
      // Validação equivalente à do servidor: só há chamada para consulta agendada.
      if (caso.status !== 'agendado') {
        ctx.toast('Não há consulta agendada para agora.', 'error');
        return;
      }
      atualizarCaso(caso.id, { status: 'em_consulta' }, { actor: 'colaborador', text: `Colaborador procurou a ${MEDICA} no chat do app e iniciou a videochamada` });
      log.info('Videochamada iniciada pelo colaborador', { caso: caso.id });
    },
    encerrar: () => ctx.next(),
    'voltar-whatsapp': () => {
      const step = ctx.rota.etapas.find((e) => e.screen === 'whatsapp');
      if (step) ctx.goTo(step.id);
    },
  }),
};
