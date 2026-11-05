# IRON DISTRICT
## Abandoned Steelworks & Freight Yard · Chimp Hawk Underground / 04

Ambiente 3D original, predominantemente aberto, com fonte Blender editável, visual glTF e colisão separados. Nenhuma engine, física ou lógica de gameplay foi modificada ou incluída.

### Abrir e importar

1. Abra `IronDistrict_Source.blend` no Blender 4.4 ou posterior. As imagens estão empacotadas no arquivo; as cópias externas ficam em `Textures/`.
2. Importe `IronDistrict_Visual.glb` com escala **1**. O arquivo incorpora as texturas. Os pequenos elementos arquitetônicos foram agrupados por setor/material somente para a exportação; o `.blend` mantém as peças editáveis.
3. Importe `IronDistrict_Collision.glb` como uma malha triangular estática. Não use um único convex hull: isso fecharia os bowls e removeria as concavidades.
4. Leia `IronDistrict_Metadata.json` para associar superfícies, proxies, spawns, caminhos de grind e rotas. Os nomes não pressupõem reconhecimento automático pela engine.
5. Configure luz direcional, iluminação ambiente e sombras na engine. Os renders usam iluminação de fim de tarde e AgX no Blender; o GLB contém os materiais PBR, mas não transporta o world shader, o gerenciamento de cor ou a iluminação de apresentação.

O plano `PRESENTATION_ExteriorGround`, na coleção LIGHTS, serve apenas de fundo para os renders e foi excluído do GLB visual, mantendo o enquadramento automático do asset próximo do distrito.

### Escala e coordenadas

- Unidades: metros; `scale_length = 1`.
- Piso conectado: **200 × 150 m**, X = −100…+100 e Z = −75…+75 no GLB; praça em Y = 0.
- Blender: Z vertical. Conversão para glTF: `(X, Y, Z)Blender → (X, Z, −Y)glTF`.
- Cenografia externa, chaminés e edifícios de fundo não entram na medida da área jogável.
- Os envelopes A–E e S mantêm os limites da planta fornecida. A planta entregue distingue os envelopes dos obstáculos construídos.

### Organização editável

| Coleção/prefixo | Conteúdo |
|---|---|
| RIDE | Piso, bowls, banks, decks, escadas e transições |
| GRIND | Corrimãos e bordas de grind, com caminhos em metros no JSON |
| COPING | Bordas funcionais separadas |
| VIS | Estruturas visuais principais |
| DECO | Tubulações, vigas, grafites, sinalização e detalhes |
| COL | Proxies físicos; ocultos no viewport e nos renders do arquivo-fonte |
| SPAWN | Marcadores de posição e orientação sugeridas |
| LIGHTS / CAMERAS | Iluminação e câmeras de apresentação |

O piso foi recortado para receber a malha dos bowls: não existe um plano atravessando o volume interior. A borda externa da malha dos bowls coincide com o piso. Superfícies elevadas possuem geometria de suporte; o piso permanece abaixo delas para permitir rotas de retorno e recepção dos gaps opcionais.

Rails e copings **não** estão na colisão genérica: são geometrias e caminhos próprios, para que o integrador defina contato e grind. Peças decorativas suspensas não têm colisão física. Bases estruturais, obstáculos street e muros têm proxies visíveis correspondentes. A colisão é uma sugestão geométrica para integração posterior, não uma configuração de física validada no jogo.

### Linhas construídas

- **A / Blast Furnace Plaza:** spawn central limpo, três manual pads, dois banks, seis degraus, bancos, corrimãos e alto-forno monumental.
- **B / Steel Flow Yard:** bowl principal de 30 × 22 m e 3,1 m de profundidade; secundário de 18 × 18 m e 2,6 m; sela de conexão; halfpipe de 16 m de largura; spine e quarter.
- **C / Freight Terminal:** dois rails de 17 m, oito degraus com corrimãos, ledges, banks e gaps sobre piso contínuo; guindaste, containers e trilhos periféricos.
- **D / Pipework Transfers:** três linhas opcionais de transfer, decks de 1,8 / 2,6 / 3,4 m, recepções próprias e desvio plano ao sul; tubulações altas.
- **E / The Iron Megaramp:** faixa de 12 m no eixo X; 25 m de aproximação, 22 m de subida/deck/recepção, 17 m de saída; crista a 6 m e acesso lateral. A geometria contínua permite atravessar sem salto obrigatório.
- **S / South Connector:** retorno de alta velocidade entre os lados B e C.

Os spawns secundários foram reposicionados onde necessário para evitar transições e garantir piso plano. A posição de cada marcador inclui 0,15 m de folga sobre o piso; ajuste a altura à origem do personagem/controlador. Heading em graus: 0 aponta para +Z e 90 para +X.

### Materiais e licenças

Materiais glTF metallic/roughness com imagens de albedo, normal tangente e ORM. ORM: R = oclusão neutra, G = roughness, B = metalness. O AO local da arquitetura provém da iluminação, não de um bake de lightmap. A ferrugem usa metalness zero; as regiões de metal exposto mantêm comportamento metálico. Os murais são imagens opacas autorais. Texturas repetíveis de 1024² e murais de 2048 × 768; os detalhes não dependem de nós procedurais exclusivos do Blender.

Consulte `LICENSES.md`. Nenhum asset 3D ou textura de terceiros foi baixado para compor o cenário. As referências do usuário foram usadas para escala, linguagem e requisitos; os modelos existentes não foram incorporados.

### Exportar novamente

- Visual: selecione RIDE, GRIND, COPING, VIS, DECO e SPAWN; exporte glTF 2.0, formato GLB, Selected Objects, +Y Up, Apply Modifiers, Normals, Tangents e Custom Properties. Câmeras/luzes são opcionais para apresentação, não necessárias à integração.
- Colisão: revele COL e exporte apenas essa coleção, sem materiais, texturas, câmeras ou luzes. Depois oculte novamente.
- Atualize o JSON e a planta se mover obstáculos, rails ou spawns. Os envelopes de planejamento não substituem a geometria física.

### Verificação e limites

Exportação visual final: 125.886 triângulos, 113 meshes e 18 materiais; aproximadamente 114 primitivas de desenho antes de sombras e passes adicionais. Colisão: 57.364 triângulos em 83 meshes. Os GLBs passaram no validador Khronos sem erros ou avisos; o relatório preserva também as mensagens informativas. Há tangentes explícitas no visual. Valide novamente depois de editar UVs ou reexportar.

Consulte `IronDistrict_Validation.json` para medidas dos arquivos realmente exportados, estatísticas, teste geométrico das rotas e spawns. A continuidade geométrica não comprova comportamento de um controlador específico. Não houve integração ao jogo, teste de física, teste com câmera em movimento ou medição de FPS em WebGL. O orçamento de draw calls, sombras e carregamento deve ser aferido no dispositivo-alvo.

Os seis renders são imagens da cena 3D entregue, incluindo uma câmera baixa na praça para avaliar a leitura na altura do jogador. `Render_TOP_VIEW.png` é a planta técnica em X/Z; o JSON contém as coordenadas exatas.
