# Gestão de Absenteísmo · Protótipo de jornada

Protótipo navegável (somente front-end, sem backend) da jornada de acompanhamento de atestados:
o RH envia o atestado no **ID**, a equipe médica acompanha no **MediQuo Pro** e o colaborador é atendido pelo **App MediQuo**.

Todos os dados são fictícios. Nenhum nome, CPF ou CNPJ corresponde a pessoa ou empresa real.

## Como rodar

Os scripts são módulos ES, então a página precisa ser servida por HTTP (abrir o `index.html` direto do disco não funciona).

```bash
python3 -m http.server 8080
# depois abra http://localhost:8080
```

Também funciona em qualquer hospedagem estática (GitHub Pages, Vercel, Netlify).

É possível abrir direto numa etapa pelo hash da URL, no formato `#<rota>-<etapa>`, por exemplo `#app-4` (Rota 2, etapa 4).

## Rotas da jornada

| Rota | Nome | Resumo | Esforço |
|---|---|---|---|
| 0 | Registro e triagem | RH envia, médico valida o documento. Sem consulta. | Baixo · 2–3 semanas |
| 1 | Meet via RH | Médico propõe horários, RH marca e cola o link do Google Meet. | Baixo · 3–5 semanas |
| 2 | App + push | Push no celular, agendamento no app e botão "Iniciar consulta". | Médio · 6–9 semanas |
| 3 | Esteira automatizada | Triagem por regra, convite por WhatsApp com prazo, Medicina do Trabalho e indicadores agregados para o RH. | Alto · 3–4 meses (futuro) |

As rotas e a trilha de etapas (só números) ficam na barra lateral esquerda; os números são clicáveis, e as setas do teclado também navegam. O estado é compartilhado entre as telas: o que o RH envia aparece no Pro, e o que o colaborador agenda aparece no ID.

## Leitura do atestado em PDF

- **PDF.js 3.11.174** extrai o texto do arquivo no navegador. O worker fica em `vendor/pdf.worker.min.js`, servido junto com a página.
- `js/pdf/parse.js` identifica colaborador (por CPF ou nome), dias de afastamento, datas, médico emissor, CRM e CID, com confiança por campo.
- **jsPDF 2.5.1** gera atestados fictícios em três layouts (texto corrido, formulário de UPA e receituário) que passam pelo mesmo caminho de leitura do upload.
- PDFs sem texto selecionável (foto ou digitalização) pedem preenchimento manual. OCR fica para uma próxima versão.

## Privacidade (LGPD)

- O CID fica oculto para o RH no ID, inclusive no texto lido do PDF.
- O RH recebe apenas status, datas e uma recomendação administrativa padronizada.
- A nota clínica fica no prontuário e nunca vai para o ID.
- O logger (`js/core/logger.js`) mascara nome, CPF, CID e texto do atestado.

As regras de validação e triagem rodam no navegador apenas para simular o produto. Em produção, elas precisam viver no servidor.

## Estrutura

```
index.html            Shell do protótipo (lateral com rotas e etapas, palco)
css/
  shell.css           Moldura do protótipo (tema escuro)
  frames.css          Frames de navegador e celular
  id.css              Visual do ID
  pro.css             Visual do MediQuo Pro
  app.css             App, tela bloqueada, chat e videochamada simulados
js/
  main.js             Registro das telas e inicialização
  core/               DOM e escape, formatação, logger, estado em memória
  data/               Dados fictícios, dicionário de CID e regras de triagem
  pdf/                Extração (PDF.js), parser e gerador de atestados (jsPDF)
  journey/            Definição das rotas, navegação e comparativo
  screens/            Telas do ID, Pro, App, Meet e WhatsApp
  ui/                 Toast, overlays e visualizador de PDF
vendor/
  pdf.worker.min.js   Worker do PDF.js 3.11.174
```

Código em JavaScript moderno seguindo o Airbnb JavaScript Style Guide, com JSDoc em todas as funções.
