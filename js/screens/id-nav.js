/**
 * @file Navegação pelos submenus do ID dentro da jornada.
 */

/**
 * Leva ao passo da rota que corresponde ao submenu clicado.
 * @param {string} sub 'enviar' | 'casos' | 'painel'
 * @param {import('../journey/navigator.js').ScreenCtx} ctx
 */
export const handleIdSub = (sub, ctx) => {
  const { etapas } = ctx.rota;
  let target = -1;
  if (sub === 'enviar') target = etapas.findIndex((e) => e.screen === 'id-upload');
  if (sub === 'casos') target = etapas.findIndex((e) => e.screen === 'id-casos');
  if (sub === 'painel') target = etapas.findIndex((e) => e.screen === 'id-painel');
  if (target < 0) {
    ctx.toast('Nesta rota, essa área do ID não faz parte da jornada.');
    return;
  }
  ctx.goTo(etapas[target].id);
};
