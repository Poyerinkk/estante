# Notas da Estante

Decisões, limites encontrados e como rodar. Atualizado a cada fase.

## Estado atual

As 9 fases estão prontas. O relatório da revisão final (fase 9) está no fim deste arquivo.

**Publicado em https://poyerinkk.github.io/estante/** (repositório público `github.com/Poyerinkk/estante`, GitHub Pages a partir de `master`, pasta raiz). Os commits usam o e-mail privado do GitHub (`…@users.noreply.github.com`). Para publicar uma mudança: troque `VERSION` em `sw.js` se algum arquivo do app mudou, faça o commit e rode `git push`.

## Publicar (GitHub Pages)

O service worker e a instalação na tela inicial exigem HTTPS. No Wi-Fi, `http://IP-do-PC:5173` mostra o app no celular, mas não instala nem funciona offline. Todos os caminhos são relativos, então o app funciona numa subpasta, como `usuario.github.io/estante/`.

1. Crie um repositório no GitHub (por exemplo, `estante`). Pode ser privado se a conta permitir Pages em repositório privado; senão, público. O código não tem dados pessoais: os livros ficam só no aparelho.
2. Na pasta `D:\Claude\estante`:
   ```
   git remote add origin https://github.com/<usuario>/estante.git
   git push -u origin master
   ```
3. No GitHub: **Settings › Pages › Build and deployment › Source: Deploy from a branch**, branch `master`, pasta `/ (root)`. Salve.
4. Depois de um ou dois minutos, o endereço aparece no topo da mesma página: `https://<usuario>.github.io/estante/`.
5. **Toda vez que mudar um arquivo do app:** troque `VERSION` em `sw.js` (`estante-v2`, `estante-v3`…), faça o commit e o push. O celular baixa a versão nova em segundo plano e passa a usá-la na abertura seguinte. A tela atual nunca é recarregada, nem no meio de uma leitura cronometrada.

Alternativa sem conta no GitHub: **Cloudflare Pages**, arrastando a pasta em *Upload assets*. Nesse caso, não envie as pastas `.git`, `.claude` e `capturas`, nem o `dev-seed.js`.

### Instalar no iPhone
1. Abra o endereço no **Safari** (outros navegadores do iPhone não instalam PWA).
2. Toque em **Compartilhar** (o quadrado com a seta) › **Adicionar à Tela de Início** › **Adicionar**.
3. Abra pelo ícone. Use uma vez com internet, para o app ficar guardado. Depois disso, funciona em modo avião, exceto a busca.

### Instalar no Android
1. Abra o endereço no **Chrome**.
2. Menu **⋮** › **Instalar app** (ou **Adicionar à tela inicial**).
3. Abra pelo ícone uma vez com internet.

### Cuidados com os dados
- Os dados ficam no navegador do aparelho. No iPhone, o PWA instalado tem armazenamento próprio, separado do Safari. Se o app for apagado da tela inicial, os dados vão junto. O app pede armazenamento persistente (`navigator.storage.persist()`), mas o backup é a garantia.
- Em Ajustes › Dados, **Exportar backup** abre o compartilhamento do sistema (Salvar em Arquivos, iCloud, Drive). Um aviso discreto aparece quando o último backup tem mais de 30 dias.

## Fase 7: dados e ajustes

- **Gráficos:** SVG escrito à mão, numa cor só (o grafite do tema, em opacidades), sem biblioteca e sem animação.
- **Calendário:** as 4 intensidades seguem os quartis dos próprios dias com leitura (páginas). Assim, o calendário se ajusta ao ritmo de quem lê, sem metas fixas.
- **Semanas** começam na segunda-feira. Todas as datas são locais (`YYYY-MM-DD` nunca passa por `new Date(string)`).
- **Ritmo** (páginas por hora) aparece só na seção Ritmo e só com a opção ligada. Conta apenas sessões de mais de 5 minutos. A seção **Dificuldade** compara dificuldade e ritmo, então também some com a opção desligada, e exige pelo menos 3 livros com dificuldade declarada e ritmo medido.
- **Quando você lê** usa só leituras cronometradas. Os lançamentos manuais não têm horário de verdade (ficam ao meio-dia).
- **Editoras prioritárias:** subir, descer, remover, adicionar e "Voltar à lista padrão". A ordem da lista é a ordem do topo da busca.
- **Apagar tudo** pede duas confirmações seguidas.

## Fase 8: backup e PWA

- **Backup:** `estante-backup-AAAA-MM-DD.json`, com livros, prateleiras, sessões e ajustes. As capas vão como data URL. Teste de ida e volta: 30 livros, 150 sessões e 4 prateleiras voltaram iguais, e a capa voltou com os mesmos 34.471 bytes. Mesclar o mesmo arquivo duas vezes não duplica nada. Um arquivo que não é backup é recusado com mensagem.
- **Mesclar:** junta por `id`. Quando o livro existe dos dois lados, fica o de `updatedAt` mais recente. Prateleiras novas entram depois das atuais. Na abertura seguinte, livros sem prateleira válida vão para a última, e `rebalance()` ajusta tudo.
- **Service worker:** cache primeiro para os 34 arquivos do app, rede primeiro para Google Books e Open Library (guarda as 80 respostas mais recentes, para repetir uma busca offline). **Em localhost**, os arquivos do app também vão pela rede primeiro, para quem edita à mão ver a mudança ao recarregar.
- **Teste offline:** com o service worker ativo, desliguei o servidor e recarreguei. A estante, as fontes, a capa salva e os dados abriram do cache.
- **Ícones:** três lombadas em grafite sobre creme, apoiadas numa tábua, em 192, 512, 512 maskable (com margem de segurança), 180 para o iPhone e 32 para a aba.
- **Respostas opacas** (imagens de outro site sem CORS) não vão para o cache: no Chrome, cada uma ocupa megabytes da cota.

## Fase 4: cronômetro

- O tempo vem sempre de `Date.now() - startedAtMs - pausedTotalMs`. O `setInterval` de 250 ms só redesenha o relógio. Ao voltar para o app (`visibilitychange`), a tela é redesenhada com o tempo certo.
- `activeSession` é gravada no IndexedDB ao iniciar, pausar e retomar. Teste: recarregar a página no meio da leitura mantém o relógio (0:23:05 → 0:23:07).
- **Encerrar pausa o relógio no toque.** A duração registrada é a do momento do toque, não a de quando a página final é digitada. "Voltar à leitura" retoma. Também há "Descartar esta leitura", com confirmação.
- **Sessão de mais de 6 horas:** na abertura do app, ele vai direto para a aba Ler e mostra "Esta leitura ficou aberta por X horas. Ajustar o tempo?", com campo em minutos. Ajustar deixa a sessão pausada com a duração informada.
- **Página corrigida à mão × sessões.** Guardo `currentPageAt` (quando o usuário digitou a página) ao lado de `currentPage`. Ao recalcular depois de editar ou apagar uma sessão, vence o que mudou por último: o `endedAt` da sessão mais recente ou o `currentPageAt`. É um campo a mais no livro, fora do modelo da seção 3.
- **Lançamento manual:** sem horário, a sessão de hoje termina "agora" e a de outro dia termina ao meio-dia daquele dia, para ordenar pelo `endedAt`.
- **Tela acesa:** com a opção ligada (a chave chega em Ajustes na fase 7) e com `navigator.wakeLock` disponível, a tela fica acesa só enquanto o relógio corre. Sem suporte, a opção é ignorada sem erro.
- Um ponto discreto na aba **Ler** indica leitura em andamento.

## Fases 5 e 6: abrir o livro e modo de edição

- **Prisma 3D.** O clone tem duas faces: a lombada de frente e a capa na face lateral direita, a 90°. A profundidade do prisma é a largura da capa, porque é ela que fica de frente no fim. A animação usa `perspective · translate · scale3d · translateZ · rotateY`, com o `translateZ` calculado para a face visível começar e terminar exatamente no plano da tela. Assim a capa pousa no pixel da capa da página, sem salto na troca. São 420 ms com `cubic-bezier(.2,.7,.2,1)`. Depois, os blocos entram com fade e 8 px de deslocamento, 40 ms entre eles.
- **Fechar** faz o caminho inverso até a posição atual da lombada. Se o livro tiver saído da tela (mudou de página, foi removido), fecha com fade.
- **Safari do iPhone: não testado** (não há iPhone neste ambiente). Se houver problema com `preserve-3d` ou `backface-visibility`, basta trocar `USE_3D = false` no topo de `js/ui/bookOpen.js`. A alternativa da seção 6.5, item 7, já está implementada: a lombada cresce até o retângulo da capa enquanto a capa aparece por cima.
- Durante o voo, o Chrome desenha a capa com a resolução do começo da animação, então ela fica um pouco borrada a meio caminho. No fim, a imagem real assume nítida.
- **Capa gerada** (livro sem foto): fundo `spineColor`, título e autor em serifa. Usa unidades `cqw`, então é idêntica na página e na face do prisma.
- **Modo de edição:** o tremor usa a propriedade `rotate` e o FLIP usa `translate`. São propriedades individuais, então as duas animações rodam juntas sem uma apagar a outra. O livro arrastado é um clone fixo com escala 1,06 e sombra leve. O original vira o espaço reservado na fileira.
- **Pressão longa e arrasto sem soltar:** depois dos 450 ms, o mesmo dedo já arrasta. Um `touchmove` não passivo impede a rolagem enquanto o livro está preso ao dedo.
- **Apagar prateleira:** os livros vão para o fim da anterior (ou da seguinte, se for a primeira), e `rebalance()` cuida do excesso. Por isso, apagar uma prateleira cheia pode criar outra automática logo depois.
- **Testes** feitos com eventos de ponteiro simulados no Chrome, em 390 × 844. Passaram: entrar por pressão longa (450 ms) e pelo botão; arrastar dentro da prateleira e entre prateleiras; soltar numa prateleira cheia empurra em cascata; trocar de página arrastando (dedo parado na borda por 600 ms); remover pelo "×", com a mensagem do briefing; renomear (a prateleira deixa de ser automática); apagar prateleira; sair tocando numa área vazia.
- **Não testado com o dedo de verdade.** O ambiente de teste não desenha quadros entre as capturas, então a rolagem suave da troca de página só pôde ser conferida forçando rolagem instantânea. Vale testar no celular depois da publicação (fase 8).

## Como rodar

```
cd D:\Claude\estante
python -m http.server 5173
```

Abra `http://localhost:5173`. Não há etapa de build: os arquivos são editados à mão.

## Decisões

- **Contraste do `--text-3`.** Os valores do briefing (`#9A9186` no claro, `#7C746A` no escuro) davam 2,7:1 e 3,8:1 sobre o fundo, abaixo dos 4,5:1 pedidos. Ajustei para `#756C62` (claro, 4,5:1 sobre `--bg`) e `#958C80` (escuro, 5,2:1). Os outros tokens passam como estavam. Medidas sobre `--bg` / `--surface` / `--surface-2`:
  - claro: `--text` 13,1 / 14,2 / 11,8 · `--text-2` 5,2 / 5,6 / 4,6 · `--danger` 6,0 / 6,5 / 5,4
  - escuro: `--text` 14,0 / 12,8 / 11,3 · `--text-2` 6,7 / 6,1 / 5,4 · `--danger` 4,7 / 4,3 / 3,8. O `--danger` escuro fica abaixo de 4,5 sobre `--surface`, então só deve aparecer sobre o fundo.
- **Altura da lombada.** O briefing pede 72% da altura da prateleira. Com uma prateleira sozinha na página, isso dá lombadas de ~510 px por 16 a 44 px de largura, parecendo postes. Mantive os 72% com um teto de 248 px (`min(72cqh, 248px)`). Com 3 ou 4 prateleiras por página, o teto não entra em jogo.
- **Variação de altura.** Cada livro tem entre 90% e 100% dessa altura, numa fração fixa tirada do `id`. Os livros não ficam todos idênticos, e a estante fica mais parecida com uma estante de verdade. Se não agradar, basta trocar `--h` por 1 em `css/shelf.css`.
- **Nome da prateleira.** Fica à esquerda, logo acima da fileira de livros, e não no topo da área da prateleira. Assim o nome continua junto dos livros quando há muito espaço vazio.
- **Fita do "lendo".** Usa a cor do texto do tema (grafite no claro, creme no escuro), sem cor extra.
- **Tema antes da pintura.** `index.html` lê o tema de `localStorage` (uma cópia do que está no IndexedDB) para não piscar ao abrir. A fonte de verdade é `settings.theme` no IndexedDB.
- **Busca com vírgula.** O campo é um só. Se tiver vírgula ("Anna Karenina, Tolstói"), a primeira parte vai como `intitle:` e a segunda como `inauthor:` no Google Books. Sem vírgula, os termos vão livres.
- **Fontes.** Newsreader (serifa, variável 200–800, com itálico) e Inter (variável). Tiradas de `@fontsource-variable/newsreader` e `@fontsource-variable/inter` 5.3.0, só o subconjunto latino (cobre o português). Ficam em `fonts/`.
- **Leitor de código de barras.** `@zxing/browser` 0.1.5 (MIT), em `js/vendor/zxing-browser.min.js` (395 KB, já inclui `@zxing/library`). Só carrega quando o navegador não tem `BarcodeDetector`.

## Limites encontrados

### Google Books sem chave: erro 429
Nos testes, a API anônima do Google Books respondeu **429 (cota esgotada)** na maior parte das consultas. A cota sem chave é compartilhada e acaba rápido. O app segue só com a Open Library e mostra "Algumas fontes não responderam."
**Recomendação:** criar uma chave gratuita no Google Cloud (API "Books") e colar em Ajustes › Avançado (fase 7). O código já envia `key=` quando ela existe.

### Capas do Google Books não podem ser salvas
- A listagem devolve só `thumbnail` (`zoom=1`, 128 × 198 px). Testei os parâmetros no mesmo endereço:
  - `zoom=0` devolve 800 × 1237 px;
  - `zoom=3` devolve 575 × 889 px;
  - **`fife=w800` devolve 800 × 1238 px**, e é o que o app usa.
- O servidor `books.google.com/books/content` **não envia cabeçalho CORS**. `fetch` falha, e `<img crossOrigin>` com canvas também. A imagem aparece na tela, mas não dá para guardá-la como Blob.
- Por isso o app tenta primeiro as capas da **Open Library**, que enviam CORS (por id ou por ISBN, com `default=false`). Só se nenhuma servir, guarda a URL do Google em `coverRemoteUrl` e avisa "Capa não salva offline. Dá para trocar por uma foto."
- Sem Blob não há cor dominante, e a lombada fica com a cor neutra do tema.

### Open Library: uma edição por obra
`search.json` devolve uma edição por obra, a que melhor casa com a consulta. A solução foi acrescentar `publisher:"<editora>"` à consulta, uma vez por editora prioritária e em paralelo. Assim a edição devolvida passa a ser a daquela editora. É o equivalente do `inpublisher:` do Google e foi o que fez a Editora 34 e a Vozes aparecerem.
O subcampo de edições **não traz o número de páginas**. A tela de revisão completa as páginas (e o ano, se faltar) consultando o ISBN em `openlibrary.org/api/books`. Quando nenhuma fonte tem o dado, o campo fica vazio para preencher à mão.

### Amazon
O app nunca acessa a Amazon. Do link, ele só lê o código `/dp/XXXXXXXXXX` ou `/gp/product/XXXXXXXXXX`. Se o código for um ISBN-10 válido, vira ISBN-13 e a busca é feita por ISBN. Teste: `amazon.com.br/.../dp/8573262087` encontrou *Crime e Castigo*, Editora 34 (2009), marcada como prioritária. Códigos `B0…` mostram o aviso de que o link não traz o ISBN.

### Ainda não testado
- Leitura de código de barras no iPhone (Safari, que usa o zxing). Precisa de HTTPS ou localhost no aparelho, então fica para quando o app estiver publicado (fase 8).
- Foto da capa pela câmera do celular (`capture="environment"`). No desktop, o botão abre o seletor de arquivos.

## Testes da busca (seção 12)

Feitos em 11/11/2026 com a lista padrão de editoras. O Google estava com 429 em quase todas as consultas, então os resultados vêm quase só da Open Library.

| Busca | Prioritária apareceu? | Primeiro resultado | Faltou |
|---|---|---|---|
| Anna Karenina | Sim: Companhia das Letras 2017 | Companhia das Letras | Editora 34 (não está na Open Library); páginas |
| Ana Karenina | Sim: Companhia das Letras 2017 | Companhia das Letras | Editora 34; páginas |
| Crime e Castigo | Sim: Editora 34 (2016, 2009), Martin Claret (2019, 2016), Vozes | Editora 34 | páginas |
| Memórias do Subsolo | Sim: Editora 34 2009 | Editora 34 | páginas |
| A Morte de Ivan Ilitch | Sim: Editora 34 2009, Martin Claret | Editora 34 | páginas |
| Sociedade do Cansaço | Sim: Vozes 2015 | Vozes | páginas |
| O Banquete (Platão) | Não | Independently Published | nenhuma prioritária nas fontes; usar ISBN ou cadastro manual |
| Meditações (Marco Aurélio) | Não | Citadel | idem |
| Pais e Filhos (Turguêniev) | Não | Cosac Naify | a edição da Editora 34 não está na Open Library |
| O Conde de Monte Cristo | Sim: Martin Claret 2017 | Martin Claret | páginas |
| Ensaio sobre a Cegueira | Sim: Companhia das Letras 2013 | Companhia das Letras | páginas |

Conforme o briefing: quando a edição prioritária não existe em nenhuma fonte, o caminho é a busca por ISBN ou o cadastro manual. Com uma chave do Google Books, a cobertura deve melhorar, porque o Google tem mais edições brasileiras.

## Verificações rápidas no console

```js
(await import("./js/lib/isbn.js")).selfCheck()    // "ok"
(await import("./js/lib/search.js")).selfCheck()  // "ok": casamento de editoras por nome inteiro
```

## Fase 9: revisão final

Testado no Chrome do Windows em 390 × 844, temas claro e escuro, em 11/11/2026. Não houve teste em iPhone nem em Android de verdade.

| Item do checklist | Resultado |
|---|---|
| Abre em 390 × 844 sem rolagem horizontal e sem cortes | **Passou** nas 4 abas e na página do livro (largura da página = 390). As margens de `safe-area` estão no CSS, mas não foram vistas num aparelho com notch. |
| Nenhum efeito proibido (seção 0.3) | **Passou.** Sem WebGL, sem gradientes, sem sons, sem efeitos de mouse. O canvas só processa capas fora da tela. O único `.play()` é o vídeo da câmera do leitor de código de barras. |
| Temas claro, escuro e automático; contraste | **Passou.** `--text-3` foi ajustado para 4,5:1 (ver Decisões). Limite: o `--danger` escuro dá 4,3:1 sobre `--surface`, então só é usado sobre o fundo. |
| "Anna Karenina" com prioritárias primeiro | **Passou com limite.** A Companhia das Letras vem no topo com capa, editora e ano. As páginas chegam na tela de revisão, pelo ISBN. A Editora 34 não aparece: não está na Open Library, e o Google respondeu 429 sem chave. |
| Link `amazon.com.br/dp/<ISBN-10>` encontra por ISBN | **Passou.** `.../dp/8573262087` encontrou *Crime e Castigo*, Editora 34. |
| Cadastro manual com foto da capa | **Passou** com imagem simulada (1200 × 1800, salva em 600 × 900 JPEG, cor da lombada extraída). O teste achou e corrigiu um defeito: tocar em "Adicionar" com a foto ainda em preparo salvava o livro sem capa. O botão da câmera (`capture`) não foi testado num celular. |
| Capa salva continua aparecendo em modo avião | **Passou.** Com o servidor desligado, a capa veio do IndexedDB como Blob. Capas que só existem no Google ficam com o aviso "Capa não salva offline". |
| Iniciar leitura pede a página inicial já preenchida | **Passou.** |
| Encerrar pede a página final e mostra o resumo sem ritmo | **Passou:** "Você leu 18 páginas em 23 minutos." |
| Tempo certo depois de apagar a tela e de reabrir | **Reabrir: passou** (recarregar manteve o relógio). **Tela apagada: não testado num aparelho**, mas o tempo vem do relógio, nunca de contagem, e a tela é redesenhada ao voltar. |
| Pressão longa, arrastar com animação, cascata na prateleira cheia | **Passou com eventos simulados.** Falta testar com o dedo num celular. |
| Mais de 4 prateleiras criam outra página | **Passou** (80 livros: 9 prateleiras, 3 páginas). |
| Tocar abre com a animação; fechar devolve à posição | **Passou** no Chrome. No Safari do iPhone, **não testado**; a alternativa sem 3D está pronta (`USE_3D = false`). |
| `prefers-reduced-motion` desliga tremor e 3D | **Implementado, não emulado.** O CSS zera o tremor, e o JS troca o voo 3D por um fade de 100 ms. Este navegador de teste não simula a preferência. |
| Exportar e importar restauram tudo, inclusive capas | **Passou** (30 livros, 150 sessões, 4 prateleiras; a capa voltou com o mesmo tamanho em bytes). |
| Offline depois da primeira carga, exceto a busca | **Passou** com o servidor desligado. |
| `NOTAS.md` documenta decisões, limites e instalação | **Passou** (este arquivo). |

### O que vale testar no celular, depois de publicar
1. A animação de abrir no Safari do iPhone. Se ficar estranha, troque `USE_3D` para `false` em `js/ui/bookOpen.js`.
2. A pressão longa e o arrasto com o dedo, incluindo a troca de página na borda.
3. O leitor de código de barras (no iPhone, usa o zxing local).
4. Uma leitura cronometrada com a tela apagada por alguns minutos.
5. Criar uma chave do Google Books e colar em Ajustes › Avançado; refazer a busca de "Anna Karenina".

### Arquivo de desenvolvimento
`dev-seed.js` (fora do git) cria livros e sessões de teste. Use só em `127.0.0.1:5173`: ele apaga os dados da origem onde roda.
