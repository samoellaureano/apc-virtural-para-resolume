# Chrome Web Store — APC Virtual para Resolume

## Nome

APC Virtual para Resolume

## Descrição curta

Controle o Resolume com 48 pads e 9 faders. Mapeie controles, crie cenas e agende disparos no Webserver local.

## Descrição completa

Controladora virtual para acionar e mapear controles do Resolume Arena/Avenue pelo navegador.

- 48 pads, 8 botões de faixa e 9 faders virtuais.
- Associe um pad a clipes, colunas e controles reconhecidos na interface do Webserver.
- Crie nomes de cena, contagens regressivas e disparos em data e hora marcadas.
- Use faders para controlar parâmetros contínuos e fazer transições de volume.
- Os pareamentos ficam salvos localmente no navegador.

É necessário habilitar o Webserver do Resolume. A extensão se conecta somente a `localhost` ou `127.0.0.1`; não envia dados a serviços externos. Esta é uma extensão independente, sem afiliação ou endosso da Resolume ou da Akai Professional.

## Justificativa de permissões

O acesso a `localhost` e `127.0.0.1` é usado exclusivamente para consultar o Webserver local do Resolume e enviar os comandos que o usuário mapeou. O script de seleção é restrito à página local `/api/docs/example/`.

## Privacidade

- Dados coletados ou enviados pelo desenvolvedor: nenhum.
- Preferências e pareamentos: armazenados localmente no navegador.
- Compartilhamento com terceiros: nenhum.
- Política para publicar: `privacy-policy.html` (hospedar em uma URL pública e informar essa URL no painel).

## Materiais

- Ícone da loja: `../icons/icon128.png` (128 × 128).
- Captura de tela: `screenshot-1.png` (1600 × 1000, proporção 16:10).

Antes de enviar, confirme no painel da loja a declaração de privacidade, a categoria e a versão atualmente publicada. Se já houver uma versão publicada, aumente `version` no `manifest.json`.
