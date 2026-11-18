# APC Virtual para Resolume

Extensão Manifest V3 para Chrome e Edge, inspirada no layout do Akai APC Mini MK2: 48 pads em seis linhas de oito, oito botões de faixa e nove faders. Não precisa de instalação via npm, hardware, driver ou porta MIDI virtual.

## Instalação

1. No Resolume Arena/Avenue, abra **Preferences → Webserver** e habilite o servidor. A extensão usa `http://localhost:8088` por padrão.
2. No Chrome, abra `chrome://extensions` (no Edge, `edge://extensions`). Habilite **Modo do desenvolvedor**, clique em **Carregar sem compactação** e selecione a pasta que contém o [manifest.json](./manifest.json).
3. Use o ícone da extensão para abrir a controladora em uma nova aba. Se o servidor usar outra porta, altere a URL e clique em **Conectar**. Apenas `localhost` e `127.0.0.1` são aceitos.

## Uso

- **Layout responsivo:** a controladora usa a altura disponível sem estender a página. Em janelas largas e baixas, os faders ficam ao lado da grade. Se os controles não couberem, role dentro do painel. A modal de pareamento também acompanha o tamanho da janela.
- **Um pad, vários alvos:** clique com o botão direito (ou `Shift+F10` com foco no controle) e selecione clipes, colunas ou outros botões na própria página web **Resolume - Example**. Os controles reconhecidos aparecem contornados. Os botões de fechar e salvar ficam no topo, mesmo durante a rolagem da modal. Depois de salvar, clique normalmente no pad para disparar os alvos. Os comandos são enviados em paralelo, não como transação. As regras do Resolume continuam valendo: por exemplo, dois clipes da mesma camada não necessariamente ficam ativos juntos.
- **Propriedades de cada camada:** clique no nome da camada (por exemplo, **Layer 2**) para trocar a seleção no Resolume e abrir as propriedades correspondentes. Você pode parear controles de várias camadas sem fechar a modal; trocar de camada mantém os alvos já escolhidos. Para parear a própria ação de selecionar a camada a um pad, use `Shift` + clique no nome.
- **Nome e temporizador da cena:** no menu do pad, informe **Nome da cena**. O nome aparece encurtado acima do número quando não couber, e o nome completo aparece ao passar o mouse. Selecione **Contagem regressiva** para iniciar o atraso ao clicar no pad ou **Data e hora marcadas** e use **Salvar e agendar** para programar um disparo único no horário local. Para cancelar, clique no pad agendado outra vez ou use **Cancelar agendamentos**. Os nomes e as configurações ficam salvos, mas os agendamentos ativos precisam da aba aberta e são cancelados se ela for fechada ou recarregada. Se o mapa estiver aberto quando chegar a hora, o disparo é cancelado para não executar enquanto você estiver editando.
  O canto superior esquerdo do pad indica o modo configurado: relógio para contagem regressiva, calendário para data e hora, e nenhum ícone para disparo imediato.
- **Transição de áudio:** clique com o botão direito em um fader e escolha dois controles **Volume** de camadas diferentes. Marque **Invertido** no volume que deve cair, salve e mova o fader. A 25% do curso, o alvo normal recebe 25% do ganho máximo e o invertido recebe 75%; no meio, ambos recebem 50%. A extensão converte esses ganhos para decibéis, então a posição visual dos controles no Resolume pode não coincidir com esses percentuais. Outros knobs e faders continuam usando interpolação linear no intervalo de cada parâmetro.
- **Conferir mapeamentos:** abra **Ver atalhos**. A página oficial mantém os painéis originais e pode ser rolada na horizontal em janelas estreitas. O decalque acompanha o componente: nas colunas, fica sobre o **▶**; nos clipes, sobre a miniatura; nos faders, na área do próprio slider ou knob. Os faders virtuais também podem mapear controles contínuos de transição, transporte, grupos e efeitos expostos pela API. Para um controle que a página não mostra no momento, use **Parâmetros fora da tela atual do Resolume**, abaixo da página.
- **Limpar pareamentos:** clique em **Limpar todos os pareamentos**, ao lado de **Ver atalhos**, e confirme. Isso apaga os pareamentos, nomes personalizados e configurações de disparo dos pads de todos os endereços salvos. Os agendamentos ativos são cancelados e os pads voltam ao disparo imediato. O endereço configurado é mantido, e a composição no Resolume não é alterada.

A modal incorpora a página oficial do Webserver (`/api/docs/example/`), não a janela nativa. Selecionar uma camada muda apenas a seleção no Resolume; os demais cliques de operação continuam bloqueados dentro da modal. A extensão identifica os controles pelo ID da composição, e a página aberta em uma aba normal continua operável. O reconhecimento depende da estrutura dessa página e pode precisar de adaptação após atualizações do Resolume. Se trocar de deck ou composição, use **Atualizar composição** para consultar os alvos atuais. Os pareamentos existentes são mantidos por endereço e alvos removidos ou fora do deck atual não são disparados. A extensão não lê, importa ou altera presets de atalhos MIDI/teclado do aplicativo e não emite MIDI.

## Referências e testes

- [Atalhos MIDI do Resolume](https://resolume.com/support/en/midi-shortcuts) — referência para o modo de seleção e o realce visual. O pareamento implementado é para o alvo específico, não por posição nem por seleção atual.
- [Webserver e REST API do Resolume](https://resolume.com/support/en/restapi) · [referência de endpoints](https://resolume.com/docs/restapi/swagger.yaml).
- [APC Mini MK2 — Akai Professional](https://www.akaipro.com/apc-mini-mk2/).

Execute `node --test` para testar a tradução de comandos e a curva dos faders sem alterar uma composição real.
