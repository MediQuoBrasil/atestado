/**
 * @file Ponto de entrada: registra as telas e inicia a jornada.
 */

import { qs } from './core/dom.js';
import { createLogger } from './core/logger.js';
import { resetStore } from './core/store.js';
import { initNavigator, registerScreen } from './journey/navigator.js';
import { renderCompare } from './journey/compare.js';
import { initOverlays, openOverlay, toast } from './ui/feedback.js';
import { idUploadScreen, resetIdUpload } from './screens/id-upload.js';
import { idCasosScreen } from './screens/id-casos.js';
import { proDashboardScreen } from './screens/pro-dashboard.js';
import { proCasoScreen } from './screens/pro-caso.js';
import { proConsultaScreen } from './screens/pro-consulta.js';
import { idPainelScreen } from './screens/id-painel.js';
import { appConsultaScreen, appPushScreen } from './screens/app-cliente.js';
import { whatsappScreen } from './screens/whatsapp.js';

const log = createLogger('main');

/**
 * Inicializa o protótipo.
 * @returns {void}
 */
const boot = () => {
  log.info('Protótipo iniciado');
  if (!window.pdfjsLib || !window.jspdf) {
    log.warn('Bibliotecas de PDF não carregaram', { pdfjs: Boolean(window.pdfjsLib), jspdf: Boolean(window.jspdf) });
  }

  registerScreen('id-upload', idUploadScreen);
  registerScreen('id-casos', idCasosScreen);
  registerScreen('pro-dashboard', proDashboardScreen);
  registerScreen('pro-caso', proCasoScreen);
  registerScreen('pro-consulta', proConsultaScreen);
  registerScreen('app-push', appPushScreen);
  registerScreen('id-painel', idPainelScreen);
  registerScreen('whatsapp', whatsappScreen);
  registerScreen('app-consulta', appConsultaScreen);

  initOverlays();
  initNavigator({
    onCompare: (rotaId) => {
      qs('#compareBody').innerHTML = renderCompare(rotaId);
      openOverlay('compareOverlay');
    },
    onReset: () => {
      resetIdUpload();
      resetStore();
      toast('Dados de exemplo restaurados.');
    },
  });
};

try {
  boot();
} catch (err) {
  log.error('Falha ao iniciar', { message: err.message });
  const stage = document.getElementById('stageInner');
  if (stage) stage.textContent = 'Não foi possível iniciar o protótipo. Recarregue a página.';
}
