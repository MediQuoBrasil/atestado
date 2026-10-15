# Gestão de Absenteísmo · Protótipo de jornada

Protótipo navegável (somente front-end, sem backend) da jornada de acompanhamento de atestados:
o RH envia o atestado e o celular do colaborador no **ID**, o médico e a gestão acompanham no **MediQuo Pro**,
a equipe marca a consulta pelo **WhatsApp Telessaúde** e o colaborador é atendido pelo app de telessaúde.

O atendimento nunca acontece por Google Meet: o médico atende sempre pelo **MediQuo Pro (Espanha)** (PEP, `web.mediquo.com/chat`), como nos atendimentos de hoje.
Depois da consulta, o médico anexa o **parecer** em PDF no MediQuo Pro e o RH baixa no ID, onde também vê o painel de custo e dias de atestado por período.

Todos os dados são fictícios. Nenhum nome, CPF ou CNPJ corresponde a pessoa ou empresa real.

## Como rodar

Os scripts são módulos ES, então a página precisa ser servida por HTTP (abrir o `index.html` direto do disco não funciona).

```bash
python3 -m http.server 8080
# depois abra http://localhost:8080
```

Também funciona em qualquer hospedagem estática (GitHub Pages, Vercel, Netlify).

É possível abrir direto numa etapa pelo hash da URL, no formato `#<rota>-<etapa>`, por exemplo `#app-4` (Rota 2, etapa 4) ou `#whatsapp-7` (Rota 1, etapa 7).

## Rotas da jornada

| Rota | Nome | Resumo | Esforço |
|---|---|---|---|
| 0 | Registro e triagem | RH envia, médico valida o documento. Sem consulta. | Baixo · 2–3 semanas |
| 1 | WhatsApp + app white label | Convite e horário pelo WhatsApp Telessaúde; o colaborador atende a videochamada no chat do app de telessaúde da empresa (sem push e sem botão); o médico atende pelo MediQuo Pro (Espanha) e anexa o parecer; o RH vê o painel e baixa o parecer no ID. | Baixo · 4–6 semanas |
| 2 | WhatsApp + MediQuo Saúde | Mesmo agendamento pelo WhatsApp; no app MediQuo Saúde a consulta aparece na agenda, um push complementar lembra no horário e o botão "Iniciar consulta" leva à videochamada. | Médio · 6–9 semanas |

Etapas das Rotas 1 e 2:

1. RH envia o atestado e o celular com WhatsApp do colaborador no ID.
2. Atestado e contato chegam no MediQuo Pro para o médico e para a gestão, com o painel de indicadores.
3. A equipe escolhe horários da agenda e envia o convite pelo WhatsApp Telessaúde.
4. O colaborador escolhe o horário no WhatsApp; a confirmação entra na agenda do Pro.
5. Rota 1: o colaborador atende a chamada no app white label. Rota 2: push de lembrete e botão "Iniciar consulta" no app MediQuo Saúde.
6. O médico atende pelo MediQuo Pro (Espanha) e anexa o parecer (PDF próprio ou parecer padrão gerado).
7. O RH vê no ID dias de atestado e custo estimado por colaborador no período escolhido e baixa o parecer.

O custo estimado é o custo mensal do colaborador ÷ 30 × dias de atestado dentro do período.

As rotas e a trilha de etapas (só números) ficam na barra lateral esquerda; os números são clicáveis, e as setas do teclado também navegam. O estado é compartilhado entre as telas: o que o RH envia aparece no Pro, e o que o colaborador agenda aparece no ID.

## Leitura do atestado em PDF

- **PDF.js 3.11.174** extrai o texto do arquivo no navegador. O worker fica em `vendor/pdf.worker.min.js`, servido junto com a página.
- `js/pdf/parse.js` identifica colaborador (por CPF ou nome), dias de afastamento, datas, médico emissor, CRM e CID, com confiança por campo.
- **jsPDF 2.5.1** gera atestados fictícios em três layouts (texto corrido, formulário de UPA e receituário) que passam pelo mesmo caminho de leitura do upload.
- PDFs sem texto selecionável (foto ou digitalização) pedem preenchimento manual. OCR fica para uma próxima versão.

## Privacidade (LGPD)

- O CID fica oculto para o RH no ID, inclusive no texto lido do PDF.
- O RH recebe apenas status, datas, o parecer e uma recomendação administrativa padronizada. O parecer padrão não traz CID nem dado clínico, e o formulário lembra o médico disso ao anexar um PDF próprio.
- A nota clínica fica no prontuário e nunca vai para o ID.
- O logger (`js/core/logger.js`) mascara nome, CPF, CID, telefone e texto do atestado.

As regras de validação e triagem rodam no navegador apenas para simular o produto. Em produção, elas precisam viver no servidor.

## Estrutura

```
index.html            Shell do protótipo (lateral com rotas e etapas, palco)
css/
  shell.css           Moldura do protótipo (tema escuro)
  frames.css          Frames de navegador e celular
  id.css              Visual do ID
  pro.css             Visual do MediQuo Pro
  app.css             App MediQuo Saúde, tela bloqueada e videochamada simulados
  whatsapp.css        WhatsApp Telessaúde e app white label (genéricos, sem logotipos)
js/
  main.js             Registro das telas e inicialização
  core/               DOM e escape, formatação, logger, estado em memória
  data/               Dados fictícios, dicionário de CID e regras de triagem
  pdf/                Extração (PDF.js), parser, gerador de atestados e de pareceres (jsPDF)
  journey/            Definição das rotas, navegação e comparativo
  screens/            Telas do ID (envio, casos, painel), Pro, WhatsApp e apps
  ui/                 Toast, overlays, visualizador de PDF e download do parecer
vendor/
  pdf.worker.min.js   Worker do PDF.js 3.11.174
```

Código em JavaScript moderno seguindo o Airbnb JavaScript Style Guide, com JSDoc em todas as funções.
