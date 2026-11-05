# Integração de comportamentos do THUG — 8 de outubro de 2026

Estudo do código fornecido de Tony Hawk's Underground e aplicação em JavaScript no StreetSkate. Base da integração: main 73abc9e. O parque expandido, as colisões existentes e o rig TheanchoURi são preservados.

## Câmera

C ou clique do analógico direito alterna Fixed/Classic; também há um botão C na barra lateral. A preferência fica salva. Fixed continua como padrão inicial, conforme a orientação anterior do jogador. Classic acompanha o deslocamento, mantém o lado da rampa durante o vert, usa enquadramento próprio para ar/grind e permite olhar com mouse/analógico direito. O acompanhamento horizontal e vertical tem suavização separada. As regras e funções estudadas estão em [thug-camera-notes.md](thug-camera-notes.md).

## Velocidade e controle

Agachar passa a usar impulso e resistência próprios. Down com direção permite curva mais fechada; Down sozinho freia e Shift é sempre o freio explícito. A velocidade acima do limite suave perde energia progressivamente. Q/E e LB/RB têm prioridade no giro aéreo; toques direcionais curtos não giram imediatamente o corpo ao selecionar um trick. Números, exceções e referência em [thug-motion-notes.md](thug-motion-notes.md).

## Manobras e animação

A integração separa seleção de trick, execução, pontuação e apresentação. Consulte [thug-tricks-notes.md](thug-tricks-notes.md) e [thug-animation-notes.md](thug-animation-notes.md) para as regras finais implementadas e os pontos de contato com o rig.

## Escopo real

O repositório de referência contém código incompleto e parâmetros dependentes de scripts/conteúdo do jogo. Os ajustes usam as unidades e estruturas do StreetSkate, sem transplantar a engine C++ nem incluir arquivos da referência na build. As animações continuam procedurais: não há clips originais utilizáveis do THUG nesta integração. Isso aplica princípios identificados no código; não comprova comportamento idêntico ao jogo comercial.

Verificação autorizada: leitura de código/diff e compilação de produção. Não foram executados testes automatizados, gameplay ou benchmarks. A publicação é confirmada pelo marcador release.json; sensação de controle, clipping e resultado visual continuam sujeitos à avaliação jogando.
