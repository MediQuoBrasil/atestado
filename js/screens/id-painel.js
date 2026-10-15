/**
 * @file ID · Absenteísmo › Painel e pareceres (Rotas 1 e 2).
 * O RH vê dias de atestado e custo estimado num período, e baixa o parecer anexado pelo médico.
 * Nada de CID, nota clínica ou conversa da consulta.
 */

import {
  delegate, esc, icon, qs,
} from '../core/dom.js';
import { createLogger } from '../core/logger.js';
import {
  addDays, fmtBRL, fmtCnpj, fmtDate, fmtSlot, parseIsoDate, plural,
} from '../core/format.js';
import {
  TODAY, empresaDoCaso, getCaso, getColaborador, getFocusCase, listarCasos,
} from '../core/store.js';
import {
  APPS_CONSULTA, DESFECHOS, DIAS_CUSTO_MES, custoAfastamento, diasNoPeriodo,
} from '../data/rules.js';
import { baixarParecer } from '../ui/parecer.js';
import { pill, timeline } from './id-casos.js';
import { idHeader, idShell } from './id-shell.js';
import { handleIdSub } from './id-nav.js';

const log = createLogger('id.painel');

/** @typedef {'30'|'90'|'180'|'ano'|'custom'} Preset */

/** @type {ReadonlyArray<[Preset, string]>} */
const PRESETS = Object.freeze([['30', 'Últimos 30 dias'], ['90', 'Últimos 90 dias'], ['180', 'Últimos 6 meses'], ['ano', 'Este ano']]);

/**
 * Período a partir de um atalho.
 * @param {Exclude<Preset, 'custom'>} preset
 * @returns {{de: string, ate: string}}
 */
const periodoDoPreset = (preset) => {
  if (preset === 'ano') return { de: `${TODAY.slice(0, 4)}-01-01`, ate: TODAY };
  return { de: addDays(TODAY, -(Number(preset) - 1)), ate: TODAY };
};

/** Filtro de tempo (estado local da tela). */
const filtro = { preset: /** @type {Preset} */ ('90'), ...periodoDoPreset('90'), erro: '' };

/**
 * @typedef {Object} LinhaColaborador
 * @property {import('../data/seed.js').Colaborador} colab
 * @property {import('../data/seed.js').Empresa|undefined} emp
 * @property {number} atestados Atestados com dias no período.
 * @property {number} dias      Dias de atestado dentro do período.
 * @property {number} custo     R$ estimado no período.
 */

/**
 * Agrega dias e custo por colaborador em uma passada pelos casos.
 * @param {string} de
 * @param {string} ate
 * @returns {LinhaColaborador[]} Ordenado por custo, maior primeiro.
 */
const agregar = (de, ate) => {
  /** @type {Map<string, LinhaColaborador>} */
  const porColab = new Map();
  listarCasos().forEach((c) => {
    const dias = diasNoPeriodo(c.dataInicio, c.dias, de, ate);
    if (dias === 0) return;
    const colab = getColaborador(c.colaboradorId);
    if (!colab) return;
    const acc = porColab.get(colab.id) ?? {
      colab, emp: empresaDoCaso(c), atestados: 0, dias: 0, custo: 0,
    };
    acc.atestados += 1;
    acc.dias += dias;
    acc.custo += custoAfastamento(colab.custoMensal, dias);
    porColab.set(colab.id, acc);
  });
  return [...porColab.values()].sort((a, b) => b.custo - a.custo || b.dias - a.dias);
};

/**
 * Card do parecer do caso acompanhado pela jornada.
 * @param {import('../core/store.js').Caso} caso
 * @param {import('../journey/navigator.js').ScreenCtx} ctx
 * @returns {string}
 */
const cardParecer = (caso, ctx) => {
  const col = getColaborador(caso.colaboradorId);
  const d = caso.desfecho;
  const stepConsulta = ctx.rota.etapas.find((e) => e.screen === 'pro-consulta')?.id ?? '';
  const app = caso.agendamento ? APPS_CONSULTA[caso.agendamento.app] : '';
  const body = caso.parecer && d ? `
    <div class="id-success">
      <h3>${icon('shield', 'ic-sm')} ${esc(DESFECHOS[d.tipo]?.label ?? 'Parecer disponível')}</h3>
      <p>${esc(d.recomendacaoRH)}</p>
      <dl class="id-kv">
        <dt>Consulta</dt><dd>${esc(caso.agendamento?.slot ? fmtSlot(caso.agendamento.slot) : '—')}${app ? ` · ${esc(app)}` : ''}</dd>
        <dt>Parecer anexado</dt><dd>${esc(fmtDate(caso.parecer.anexadoEm))}</dd>
        <dt>Retorno previsto</dt><dd>${esc(fmtDate(addDays(caso.dataInicio, caso.dias)))}</dd>
      </dl>
      <div class="id-actions"><button type="button" class="id-btn" data-action="baixar" data-id="${esc(caso.id)}">${icon('download', 'ic-sm')} Baixar parecer (PDF)</button></div>
    </div>
    <div class="id-note">${icon('lock', 'ic-sm')}<span>O parecer traz só a recomendação administrativa. Diagnóstico e conversa clínica ficam no prontuário da MediQuo (LGPD, dado de saúde é sensível).</span></div>`
    : `<div class="id-empty">${icon('clipboard', 'ic-big')}<p>O médico ainda não anexou o parecer deste caso.</p>${stepConsulta ? `<button type="button" class="id-btn outline" data-action="goto" data-step="${esc(stepConsulta)}">Ir para a consulta</button>` : ''}</div>`;
  return `
    <div class="id-grid-2">
      <div class="id-card"><div class="id-card-head"><div><h2 class="id-card-title">Parecer do caso</h2><p class="id-card-desc">${esc(col?.nome ?? '')} · ${esc(caso.id)}</p></div>${pill(caso.status)}</div><div class="id-card-body" style="display:grid;gap:1rem">${body}</div></div>
      <div class="id-card"><div class="id-card-head"><h2 class="id-card-title">Histórico</h2></div><div class="id-card-body">${timeline(caso)}</div></div>
    </div>`;
};

/** @returns {string} */
const barraFiltro = () => `
  <div class="id-filterbar">
    <div class="id-chips">${PRESETS.map(([v, l]) => `<button type="button" class="id-chip ${filtro.preset === v ? 'on' : ''}" data-action="preset" data-v="${v}" aria-pressed="${filtro.preset === v}">${esc(l)}</button>`).join('')}</div>
    <div class="id-range">
      <label class="id-label" for="pDe">De</label><input id="pDe" type="date" class="id-input" data-f="de" value="${esc(filtro.de)}" max="${esc(TODAY)}">
      <label class="id-label" for="pAte">Até</label><input id="pAte" type="date" class="id-input" data-f="ate" value="${esc(filtro.ate)}" max="${esc(TODAY)}">
    </div>
    ${filtro.erro ? `<p class="id-err" role="alert">${esc(filtro.erro)}</p>` : ''}
  </div>`;

/**
 * Indicadores, custo por colaborador e lista de pareceres no período.
 * @returns {string}
 */
const dashboard = () => {
  const { de, ate } = filtro;
  const linhas = agregar(de, ate);
  const totalDias = linhas.reduce((a, l) => a + l.dias, 0);
  const totalCusto = linhas.reduce((a, l) => a + l.custo, 0);
  const totalAtestados = linhas.reduce((a, l) => a + l.atestados, 0);
  const pareceres = listarCasos()
    .filter((c) => c.parecer && c.parecer.anexadoEm >= de && c.parecer.anexadoEm <= ate)
    .sort((a, b) => b.parecer.anexadoEm.localeCompare(a.parecer.anexadoEm) || b.id.localeCompare(a.id));
  const focusId = getFocusCase().id;

  const kpis = `
    <div class="id-kpis">
      <div class="id-kpi"><p class="l">${icon('calendarDays', 'ic-sm')} Dias de atestado</p><p class="v">${totalDias}</p><p class="s">${esc(plural(totalAtestados, 'atestado', 'atestados'))} no período</p></div>
      <div class="id-kpi"><p class="l">${icon('briefcase', 'ic-sm')} Custo estimado</p><p class="v">${esc(fmtBRL(totalCusto))}</p><p class="s">média de ${esc(fmtBRL(totalDias ? totalCusto / totalDias : 0))} por dia</p></div>
      <div class="id-kpi"><p class="l">${icon('users', 'ic-sm')} Colaboradores com atestado</p><p class="v">${linhas.length}</p><p class="s">${linhas.length ? `maior custo: ${esc(linhas[0].colab.nome.split(' ')[0])}` : 'nenhum no período'}</p></div>
      <div class="id-kpi"><p class="l">${icon('fileText', 'ic-sm')} Pareceres</p><p class="v">${pareceres.length}</p><p class="s">anexados pela equipe médica</p></div>
    </div>`;

  const tabelaCusto = `
    <div class="id-card">
      <div class="id-card-head"><div><h2 class="id-card-title">Custo e dias por colaborador</h2><p class="id-card-desc">${esc(fmtDate(de))} a ${esc(fmtDate(ate))}. Conta só os dias de atestado dentro do período.</p></div></div>
      <div class="id-card-body id-table-wrap">
        <table class="id-table">
          <thead><tr><th>Colaborador</th><th>CNPJ</th><th class="r">Atestados</th><th class="r">Dias no período</th><th class="r">Custo mensal</th><th class="r">Custo no período</th></tr></thead>
          <tbody>${linhas.map((l) => `<tr><td>${esc(l.colab.nome)}<span class="sub">${esc(l.colab.cargo)}</span></td><td class="num">${esc(fmtCnpj(l.emp?.cnpj ?? ''))}<span class="sub">${esc(l.emp?.razao ?? '')}</span></td><td class="num r">${l.atestados}</td><td class="num r">${l.dias}</td><td class="num r">${esc(fmtBRL(l.colab.custoMensal))}</td><td class="num r"><b>${esc(fmtBRL(l.custo))}</b></td></tr>`).join('') || '<tr><td colspan="6" class="id-empty">Nenhum atestado no período.</td></tr>'}</tbody>
          ${linhas.length ? `<tfoot><tr><td colspan="3">Total</td><td class="num r">${totalDias}</td><td></td><td class="num r"><b>${esc(fmtBRL(totalCusto))}</b></td></tr></tfoot>` : ''}
        </table>
        <p class="id-hint" style="margin-top:.75rem">Custo estimado = custo mensal do colaborador ÷ ${DIAS_CUSTO_MES} × dias de atestado no período. O custo mensal vem do cadastro do colaborador no ID.</p>
      </div>
    </div>`;

  const tabelaPareceres = `
    <div class="id-card">
      <div class="id-card-head"><div><h2 class="id-card-title">Pareceres</h2><p class="id-card-desc">Anexados no período pela equipe médica, prontos para download.</p></div></div>
      <div class="id-card-body id-table-wrap">
        <table class="id-table">
          <thead><tr><th>Caso</th><th>Colaborador</th><th>Afastamento</th><th>Recomendação</th><th>Anexado em</th><th></th></tr></thead>
          <tbody>${pareceres.map((c) => `<tr class="${c.id === focusId ? 'focus' : ''}"><td class="num">${esc(c.id)}</td><td>${esc(getColaborador(c.colaboradorId)?.nome ?? '')}</td><td class="num">${esc(fmtDate(c.dataInicio))} → ${esc(fmtDate(addDays(c.dataInicio, c.dias - 1)))}<span class="sub">${esc(plural(c.dias, 'dia', 'dias'))}</span></td><td>${esc(DESFECHOS[c.desfecho?.tipo ?? '']?.label ?? '—')}</td><td class="num">${esc(fmtDate(c.parecer.anexadoEm))}</td><td><button type="button" class="id-btn outline sm" data-action="baixar" data-id="${esc(c.id)}">${icon('download', 'ic-sm')} PDF</button></td></tr>`).join('') || '<tr><td colspan="6" class="id-empty">Nenhum parecer anexado no período.</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;

  return `
    <div class="id-card">
      <div class="id-card-head"><div><h2 class="id-card-title">Absenteísmo no período</h2><p class="id-card-desc">Escolha um atalho ou defina as datas.</p></div></div>
      <div class="id-card-body" style="display:grid;gap:1rem">${barraFiltro()}${kpis}</div>
    </div>
    ${tabelaCusto}
    ${tabelaPareceres}`;
};

/**
 * @param {import('../journey/navigator.js').ScreenCtx} ctx
 * @returns {string}
 */
const render = (ctx) => idShell('painel', `
  ${idHeader('Painel e pareceres', 'Dias de atestado, custo estimado e pareceres da equipe médica.')}
  ${cardParecer(getFocusCase(), ctx)}
  ${dashboard()}`);

/**
 * @param {HTMLElement} root
 * @param {import('../journey/navigator.js').ScreenCtx} ctx
 * @returns {function(): void}
 */
const bind = (root, ctx) => {
  const rerender = () => {
    const top = root.querySelector('.id-main')?.scrollTop ?? 0;
    const host = qs('.device-viewport', root);
    host.innerHTML = render(ctx);
    const main = host.querySelector('.id-main');
    if (main) main.scrollTop = top;
  };
  const offClick = delegate(root, 'click', {
    preset: (el) => {
      const { v } = /** @type {{v: Preset}} */ (el.dataset);
      if (!PRESETS.some(([p]) => p === v) || v === 'custom') return;
      Object.assign(filtro, { preset: v, ...periodoDoPreset(/** @type {Exclude<Preset, 'custom'>} */ (v)), erro: '' });
      rerender();
    },
    baixar: (el) => {
      const caso = getCaso(el.dataset.id ?? '');
      if (!caso || !baixarParecer(caso)) {
        ctx.toast('Não foi possível baixar o parecer. Tente de novo.', 'error');
        return;
      }
      ctx.toast('Download do parecer iniciado.', 'success');
    },
    goto: (el) => ctx.goTo(el.dataset.step),
    'id-sub': (el) => handleIdSub(el.dataset.sub, ctx),
  });
  const onChange = (event) => {
    const el = /** @type {HTMLInputElement} */ (event.target);
    const key = el.dataset.f;
    if (key !== 'de' && key !== 'ate') return;
    const next = { de: filtro.de, ate: filtro.ate, [key]: el.value };
    if (!parseIsoDate(next.de) || !parseIsoDate(next.ate)) {
      filtro.erro = 'Informe as duas datas do período.';
    } else if (next.de > next.ate) {
      filtro.erro = 'A data inicial precisa ser anterior à final.';
    } else {
      Object.assign(filtro, next, { preset: 'custom', erro: '' });
      log.info('Período alterado', { de: filtro.de, ate: filtro.ate });
    }
    rerender();
  };
  root.addEventListener('change', onChange);
  return () => {
    offClick();
    root.removeEventListener('change', onChange);
  };
};

/** @type {import('../journey/navigator.js').Screen} */
export const idPainelScreen = {
  frame: 'desktop',
  url: () => 'id.mediquo.com.br/absenteismo/painel',
  render,
  bind,
};
