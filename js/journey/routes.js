/**
 * @file Definição das rotas (versões) da jornada e suas etapas.
 * Cada etapa aponta para uma tela e parâmetros; a navegação é livre entre etapas.
 */

/** @typedef {'rh'|'medico'|'colaborador'|'externo'|'sistema'} Ator */

/**
 * @typedef {Object} Etapa
 * @property {string} id       Identificador único dentro da rota.
 * @property {string} screen   Chave da tela registrada no navegador.
 * @property {Object<string, string>} [params]
 * @property {Ator} actor
 * @property {string} produto  Produto/canal exibido na trilha.
 * @property {string} label    Rótulo curto da etapa.
 * @property {string} titulo   Título da nota da etapa.
 * @property {string} nota     O que acontece e o que testar.
 */

/**
 * @typedef {Object} Rota
 * @property {string} id
 * @property {string} chave    Rótulo curto ("Rota 1").
 * @property {string} nome
 * @property {1|2|3|4|5} esforco Escala de esforço de desenvolvimento.
 * @property {string} prazo    Estimativa grosseira.
 * @property {string} resumo
 * @property {string[]} construir   O que precisa ser desenvolvido.
 * @property {string[]} reaproveita O que já existe.
 * @property {string[]} riscos
 * @property {Etapa[]} etapas
 */

/** Etapa de envio, comum a todas as rotas. */
const ENVIO = Object.freeze({
  id: 'envio',
  screen: 'id-upload',
  actor: 'rh',
  produto: 'ID',
  label: 'RH envia o atestado',
  titulo: 'RH anexa o atestado no ID',
  nota: 'Arraste um PDF ou gere um atestado de exemplo. O PDF.js lê o texto do arquivo e o parser preenche colaborador, CID, dias e datas. O CID fica oculto para o RH.',
});

/**
 * @param {Partial<Etapa> & {id: string}} over
 * @returns {Etapa}
 */
const painelPro = (over) => ({
  screen: 'pro-dashboard',
  actor: 'medico',
  produto: 'MediQuo Pro',
  label: 'Médico vê o painel',
  titulo: 'Painel de absenteísmo no MediQuo Pro',
  nota: 'O caso enviado aparece no topo da lista. Teste os filtros por paciente, CNPJ, CID, quantidade de atestados e reincidência. Clique no PDF para abrir o atestado original.',
  ...over,
});

/** @type {ReadonlyArray<Rota>} */
export const ROTAS = Object.freeze([
  {
    id: 'registro',
    chave: 'Rota 0',
    nome: 'Registro e triagem',
    esforco: 1,
    prazo: '2–3 semanas',
    resumo: 'Centraliza atestados e dá ao médico visão de recorrência. Sem consulta: o médico valida o documento e sinaliza casos para atenção.',
    construir: ['Menu Absenteísmo no ID com upload', 'Extração de campos do PDF', 'Menu Absenteísmo no Pro (lista e filtros)', 'Validação documental e status para o RH'],
    reaproveita: ['Login e permissões do ID e do Pro', 'Componentes de upload do ID (Materiais Radar+)'],
    riscos: ['Não reduz afastamentos por si só', 'Valor percebido pelo RH limitado à organização'],
    etapas: [
      ENVIO,
      painelPro({ id: 'painel' }),
      {
        id: 'revisao', screen: 'pro-caso', params: { modo: 'registro' }, actor: 'medico', produto: 'MediQuo Pro',
        label: 'Médico valida o documento', titulo: 'Revisão documental do atestado',
        nota: 'O médico confere CRM, datas e coerência do período, e marca o documento como validado ou pede reenvio.',
      },
      {
        id: 'status', screen: 'id-casos', params: { modo: 'status' }, actor: 'rh', produto: 'ID',
        label: 'RH acompanha o status', titulo: 'Status do caso no ID',
        nota: 'O RH vê apenas status e datas. Diagnóstico e detalhes clínicos não aparecem.',
      },
    ],
  },
  {
    id: 'meet',
    chave: 'Rota 1',
    nome: 'Meet via RH',
    esforco: 2,
    prazo: '3–5 semanas',
    resumo: 'Menor desenvolvimento com consulta: o médico propõe horários, o RH marca com o colaborador e cola o link do Google Meet no ID.',
    construir: ['Tudo da Rota 0', 'Pedido de agenda do Pro para o ID', 'Campo de link Meet e confirmação no ID', 'Registro de desfecho no Pro'],
    reaproveita: ['Google Meet (sem integração de vídeo própria)', 'Canais do RH com o colaborador (e-mail, WhatsApp interno)'],
    riscos: ['RH vira gargalo do agendamento', 'Link externo fora do prontuário', 'Taxa de não comparecimento sem lembrete automático'],
    etapas: [
      ENVIO,
      painelPro({ id: 'painel' }),
      {
        id: 'pedido', screen: 'pro-caso', params: { modo: 'meet' }, actor: 'medico', produto: 'MediQuo Pro',
        label: 'Médico pede horário ao RH', titulo: 'Médico propõe horários de consulta',
        nota: 'Selecione os horários livres da agenda e envie o pedido. O caso passa para "Aguardando agenda do RH".',
      },
      {
        id: 'agenda-rh', screen: 'id-casos', params: { modo: 'agendar' }, actor: 'rh', produto: 'ID',
        label: 'RH marca e cola o Meet', titulo: 'RH confirma o horário e informa o link do Meet',
        nota: 'O RH combina com o colaborador, escolhe um dos horários e cola o link do Google Meet. O link é validado antes de salvar.',
      },
      {
        id: 'chamada', screen: 'meet', actor: 'externo', produto: 'Google Meet',
        label: 'Consulta no Meet', titulo: 'Consulta por videochamada externa',
        nota: 'Simulação da chamada no Meet. O médico registra o desfecho no Pro em paralelo.',
      },
      {
        id: 'desfecho', screen: 'pro-consulta', params: { canal: 'meet' }, actor: 'medico', produto: 'MediQuo Pro',
        label: 'Médico registra desfecho', titulo: 'Desfecho clínico e recomendação ao RH',
        nota: 'A nota clínica fica no prontuário. Para o RH vai somente a recomendação administrativa.',
      },
      {
        id: 'devolutiva', screen: 'id-casos', params: { modo: 'devolutiva' }, actor: 'rh', produto: 'ID',
        label: 'RH recebe devolutiva', titulo: 'Devolutiva estruturada no ID',
        nota: 'Status ocupacional e datas, sem dados clínicos.',
      },
    ],
  },
  {
    id: 'app',
    chave: 'Rota 2',
    nome: 'App + push',
    esforco: 3,
    prazo: '6–9 semanas',
    resumo: 'O colaborador recebe push, agenda pelo app e inicia a consulta no próprio app. Jornada mais fluida, sem o RH no meio.',
    construir: ['Tudo da Rota 0', 'Convite e agenda dedicada no app (tipo de consulta "Avaliação de afastamento")', 'Push notification e lembretes', 'Botão "Iniciar consulta" e sala de vídeo', 'Desfecho no Pro e devolutiva no ID'],
    reaproveita: ['Tela Agendamento do app', 'Agenda de profissionais do Pro', 'Videoconsulta existente do app'],
    riscos: ['Colaborador sem app instalado (fallback por SMS/WhatsApp)', 'Permissão de push negada', 'Fila de agenda em picos de atestados'],
    etapas: [
      ENVIO,
      painelPro({ id: 'painel' }),
      {
        id: 'convite', screen: 'pro-caso', params: { modo: 'app' }, actor: 'medico', produto: 'MediQuo Pro',
        label: 'Médico libera agenda no app', titulo: 'Médico libera horários no app do colaborador',
        nota: 'Escolha os horários que o colaborador poderá ver e envie o convite. O app dispara a notificação push.',
      },
      {
        id: 'push', screen: 'app-push', actor: 'colaborador', produto: 'App MediQuo',
        label: 'Colaborador recebe push', titulo: 'Notificação push na tela bloqueada',
        nota: 'Toque na notificação para abrir o app direto na tela de agendamento.',
      },
      {
        id: 'agendar', screen: 'app-agenda', actor: 'colaborador', produto: 'App MediQuo',
        label: 'Colaborador agenda', titulo: 'Agendamento no app',
        nota: 'A tela segue o padrão atual de Agendamento do app. O convite aparece no topo e o colaborador escolhe o horário.',
      },
      {
        id: 'iniciar', screen: 'app-consulta', actor: 'colaborador', produto: 'App MediQuo',
        label: 'Colaborador inicia consulta', titulo: 'Botão "Iniciar consulta" no horário marcado',
        nota: 'No horário, o card ganha o botão de entrar na sala. Toque para iniciar a videoconsulta.',
      },
      {
        id: 'consulta', screen: 'pro-consulta', params: { canal: 'app' }, actor: 'medico', produto: 'MediQuo Pro',
        label: 'Atende pelo Pro (Espanha)', titulo: 'Agendamentos no Pro e atendimento pelo MediQuo Pro (Espanha)',
        nota: 'A consulta marcada aparece na lista de agendamentos do MediQuo Pro. A videochamada acontece no MediQuo Pro (Espanha), no chat do paciente, como já é feito hoje. Depois do atendimento, o médico registra o desfecho aqui e o ID é atualizado.',
      },
      {
        id: 'devolutiva', screen: 'id-casos', params: { modo: 'devolutiva' }, actor: 'rh', produto: 'ID',
        label: 'RH recebe devolutiva', titulo: 'Devolutiva estruturada no ID',
        nota: 'Status ocupacional e datas, sem dados clínicos.',
      },
    ],
  },
]);

/**
 * @param {string} id
 * @returns {Rota}
 */
export const getRota = (id) => ROTAS.find((r) => r.id === id) ?? ROTAS[1];
