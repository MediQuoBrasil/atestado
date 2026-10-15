/**
 * @file Canal externo simulado: videochamada no Google Meet (Rota 1).
 * São representações genéricas para o protótipo, sem logotipos de terceiros.
 */

import { delegate, esc, icon } from '../core/dom.js';
import { fmtSlot, initials } from '../core/format.js';
import { atualizarCaso, getColaborador, getFocusCase } from '../core/store.js';

/* ─── Videochamada (Meet) ───────────────────────────────── */

/**
 * Tela da videochamada externa.
 * @returns {string}
 */
const renderMeet = () => {
  const caso = getFocusCase();
  const col = getColaborador(caso.colaboradorId);
  const link = caso.agendamento?.canal === 'meet' ? caso.agendamento.link : null;
  if (!link) {
    return `<div class="meet"><div class="meet-empty"><p>O RH ainda não informou o link do Meet para este caso.</p><button type="button" data-action="goto" data-step="agenda-rh">Ir para a agenda do RH</button></div></div>`;
  }
  return `
    <div class="meet">
      <div class="meet-stage">
        <div class="meet-tiles">
          <div class="meet-tile speaking"><span class="face" style="background:#7b5cd6">BS</span><span class="name">Dra. Beatriz Sampaio</span></div>
          <div class="meet-tile"><span class="face" style="background:#c2410c">${esc(initials(col?.nome))}</span><span class="name">${esc(col?.nome ?? '')}</span></div>
        </div>
        <div class="meet-bar">
          <span class="code">16:12 · ${esc(link.replace('https://meet.google.com/', ''))}</span>
          <div class="meet-ctrls"><span>${icon('mic')}</span><span>${icon('video')}</span><button type="button" class="end" data-action="encerrar">${icon('phoneOff')} Encerrar e registrar desfecho</button></div>
          <span class="code">Videochamada externa (simulada)</span>
        </div>
      </div>
      <aside class="meet-side">
        <h3>Detalhes da reunião</h3>
        <div class="link">${esc(link)}</div>
        <p>${esc(fmtSlot(caso.agendamento?.slot ?? ''))}</p>
        <p>Convidados: Dra. Beatriz Sampaio, ${esc(col?.nome ?? '')}</p>
        <div class="tip">Nesta rota a chamada não fica registrada na MediQuo. O desfecho é preenchido manualmente no Pro.</div>
      </aside>
    </div>`;
};

/** @type {import('../journey/navigator.js').Screen} */
export const meetScreen = {
  frame: 'desktop',
  url: () => {
    const link = getFocusCase().agendamento?.link;
    return link ? link.replace('https://', '') : 'meet.google.com';
  },
  render: renderMeet,
  bind: (root, ctx) => delegate(root, 'click', {
    encerrar: () => {
      const caso = getFocusCase();
      if (caso.status === 'agendado') atualizarCaso(caso.id, { status: 'em_consulta' }, { actor: 'sistema', text: 'Consulta realizada por Google Meet' });
      ctx.next();
    },
    goto: (el) => ctx.goTo(el.dataset.step),
  }),
};
