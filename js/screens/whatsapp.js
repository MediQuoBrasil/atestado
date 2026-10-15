/**
 * @file WhatsApp do número Telessaúde (Rotas 1 e 2): convite e escolha do horário da consulta.
 * Representação genérica para o protótipo, sem logotipos de terceiros.
 */

import { delegate, esc, icon } from '../core/dom.js';
import { createLogger } from '../core/logger.js';
import { fmtSlot, fmtTelefone } from '../core/format.js';
import { atualizarCaso, getColaborador, getFocusCase } from '../core/store.js';
import { APPS_CONSULTA_FRASE } from '../data/rules.js';
import { MEDICA_PROGRAMA } from '../data/seed.js';

const log = createLogger('whatsapp');

/** Nome da conta comercial que fala com o colaborador. */
const CONTA = 'Telessaúde';

/** Status em que a conversa já começou. */
const COM_CONVERSA = new Set(['convite_enviado', 'agendado', 'em_consulta', 'em_acompanhamento', 'concluido', 'encaminhado']);

/**
 * Balão de mensagem.
 * @param {'in'|'out'} lado in = Telessaúde, out = colaborador.
 * @param {string} html  Conteúdo já escapado.
 * @param {string} hora
 * @returns {string}
 */
const msg = (lado, html, hora) => `<div class="wa-msg ${lado}"><div class="wa-txt">${html}</div><span class="wa-time">${esc(hora)}${lado === 'out' ? ' ✓✓' : ''}</span></div>`;

/**
 * Mensagem de confirmação conforme o app da consulta.
 * @param {import('../core/store.js').Caso} caso
 * @returns {string} HTML escapado.
 */
const confirmacao = (caso) => {
  const ag = /** @type {import('../core/store.js').Agendamento} */ (caso.agendamento);
  const quando = `<b>${esc(fmtSlot(ag.slot ?? ''))}</b>`;
  const comoEntrar = ag.app === 'mediquo_saude'
    ? `Na hora, você recebe um lembrete do ${esc(APPS_CONSULTA_FRASE.mediquo_saude)} e entra pelo botão <b>Iniciar consulta</b>.`
    : `No horário, a ${esc(MEDICA_PROGRAMA.nome)} vai te ligar por vídeo no chat do ${esc(APPS_CONSULTA_FRASE.white_label)}. Deixe o app aberto e a internet ligada.`;
  return `Consulta confirmada para ${quando}. ${comoEntrar}<br><br>É sigiloso: sua empresa não vê o conteúdo da consulta.`;
};

/**
 * Conversa com o colaborador.
 * @param {import('../core/store.js').Caso} caso
 * @returns {string}
 */
const conversa = (caso) => {
  const ag = caso.agendamento;
  if (!ag || ag.canal !== 'whatsapp' || !COM_CONVERSA.has(caso.status)) {
    return `<div class="wa-empty"><p>Nenhuma mensagem da ${esc(CONTA)} ainda. O convite sai do MediQuo Pro.</p><button type="button" class="wa-btn" data-action="voltar-convite">Ir para o convite</button></div>`;
  }
  const nome = (getColaborador(caso.colaboradorId)?.nome ?? '').split(' ')[0];
  const abertura = msg('in', `Olá, ${esc(nome)}! Aqui é a equipe de ${esc(CONTA)} da MediQuo. Recebemos seu atestado pela sua empresa e queremos acompanhar sua recuperação numa consulta rápida por vídeo, pelo ${esc(APPS_CONSULTA_FRASE[ag.app])}.`, '16:05');
  const opcoes = `
    <div class="wa-msg in">
      <div class="wa-txt">Qual horário fica melhor para você?</div>
      <span class="wa-time">16:05</span>
      <div class="wa-replies">${ag.slotsSugeridos.map((s) => `<button type="button" class="wa-reply ${s === ag.slot ? 'on' : ''}" data-action="wa-slot" data-slot="${esc(s)}" ${ag.slot ? 'disabled' : ''}>${esc(fmtSlot(s))}</button>`).join('')}</div>
    </div>`;
  const resposta = ag.slot ? `${msg('out', esc(fmtSlot(ag.slot)), '16:07')}${msg('in', confirmacao(caso), '16:07')}` : '';
  return `<div class="wa-day">Hoje</div>${abertura}${opcoes}${resposta}`;
};

/**
 * @returns {string}
 */
const render = () => {
  const caso = getFocusCase();
  return `
    <div class="phone-status wa-bar"><span>16:07</span><span class="ps-icons">5G <i></i> 51%</span></div>
    <div class="wa">
      <div class="wa-head">${icon('arrowLeft')}<span class="wa-avatar" aria-hidden="true">${icon('stethoscope', 'ic-sm')}</span><div><b>${esc(CONTA)}</b><small>Conta comercial · MediQuo</small></div></div>
      <div class="wa-chat" data-scroll-key="wa">${conversa(caso)}</div>
      <div class="wa-input"><span>Mensagem</span><span class="wa-mic">${icon('mic', 'ic-sm')}</span></div>
    </div>
    <div class="phone-nav" aria-hidden="true"><span></span><span></span><span></span></div>`;
};

/**
 * @param {HTMLElement} root
 * @param {import('../journey/navigator.js').ScreenCtx} ctx
 * @returns {function(): void}
 */
const bind = (root, ctx) => {
  const chat = root.querySelector('.wa-chat');
  if (chat) chat.scrollTop = chat.scrollHeight;
  return delegate(root, 'click', {
    'wa-slot': (el) => {
      const caso = getFocusCase();
      const slot = el.dataset.slot ?? '';
      // Validação equivalente à do servidor: só aceita horário oferecido e ainda não confirmado.
      if (caso.status !== 'convite_enviado' || !caso.agendamento?.slotsSugeridos.includes(slot)) {
        ctx.toast('Este horário não está mais disponível.', 'error');
        return;
      }
      atualizarCaso(caso.id, { status: 'agendado', agendamento: { ...caso.agendamento, slot } }, { actor: 'colaborador', text: `Colaborador confirmou pelo WhatsApp: ${fmtSlot(slot)}` });
      log.info('Horário confirmado pelo WhatsApp', { caso: caso.id, app: caso.agendamento.app });
      ctx.toast('Consulta agendada. Já aparece no MediQuo Pro e no ID.', 'success');
    },
    'voltar-convite': () => {
      const step = ctx.rota.etapas.find((e) => e.screen === 'pro-caso');
      if (step) ctx.goTo(step.id);
    },
  });
};

/** @type {import('../journey/navigator.js').Screen} */
export const whatsappScreen = {
  frame: 'phone',
  render,
  side: () => {
    const caso = getFocusCase();
    return `
      <h3>WhatsApp ${esc(CONTA)}</h3>
      <ul>
        <li>O contato sai do número ${esc(CONTA)} da MediQuo para o celular informado pelo RH: <b>${esc(fmtTelefone(caso.telefone))}</b>.</li>
        <li>A mensagem não cita diagnóstico. O colaborador escolhe o horário pelos botões de resposta.</li>
        <li>A confirmação entra na agenda do médico no MediQuo Pro e muda o status no ID.</li>
        <li>A consulta nunca acontece no WhatsApp nem no Meet: é sempre pelo app de telessaúde, com o médico no MediQuo Pro (Espanha).</li>
      </ul>`;
  },
  bind,
};
