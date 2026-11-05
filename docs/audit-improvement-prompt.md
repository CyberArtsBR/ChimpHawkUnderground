# Prompt de melhoria executado — StreetSkate

Audite estaticamente a versão atual do StreetSkate e corrija defeitos concretos no caminho de execução ativo. Preserve as três áreas do mapa, os materiais pretos, o personagem TheanchoURi, o retorno vertical à mesma transição e a orientação controlada pelo jogador. A câmera deve manter seu ângulo no mundo e acompanhar somente a posição.

Execute autonomamente estas melhorias:

1. Preserve a câmera fixa após reset e troca de modo. Restaure a visibilidade do personagem ao entrar em Explore.
2. Corrija as bordas dos botões do controle para que Start segurado não alterne a pausa repetidamente. Combine teclado e controle sem soltar o ollie enquanto outro dispositivo ainda o segura. Proteja os atalhos do navegador que conflitam com Ctrl e os comandos do jogo.
3. Pause ao perder foco, ocultar a aba ou desconectar o controle. Limpe comandos pendentes de salto, pumping e tricks sem apagar a pontuação consolidada. Suspenda a renderização da aba oculta.
4. Preserve comandos instantâneos até o próximo passo fixo de física; consuma cada direção somente uma vez.
5. Separe o equilíbrio de manual do freio. Evite que uma soltura de ollie durante um voo existente deixe um novo salto pendente, preservando a pequena tolerância de coyote time.
6. Bloqueie tricks durante bail e limpe completamente o combo perdido e suas filas. Trocar stance sozinho não deve conceder pontos ou multiplicadores.
7. Recupere posição, velocidade ou heading inválidos antes de consultas de colisão e preserve os pontos já conquistados ao recuperar uma queda fora do mapa.
8. Corrija a inclinação longitudinal do corpo e a orientação dos pés em relação ao skate nos manuals e grinds. Mantenha livres os pés de grabs e poses flatland.
9. Corrija a ajuda de controles e o download do mapa para a versão expandida. Ofereça recarregamento quando assets ou o contexto gráfico falharem.

Revise o diff e compile com npm run build. Não rode testes de gameplay, testes automatizados, benchmarks nem crie branches. Faça commit diretamente na main, envie ao GitHub e confirme a publicação pelo marcador de versão do Render. Registre os achados e as limitações: a leitura estática e a compilação não comprovam FPS, sensação de movimento, ausência de clipping ou qualidade visual das animações. Não prometa animações idênticas às de Tony Hawk sem clips correspondentes.
