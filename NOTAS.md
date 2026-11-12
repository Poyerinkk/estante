# Notas da Estante

Decisões, limites encontrados e como rodar. Atualizado a cada fase.

## Estado atual

Fases 1, 2 e 3 prontas (fundação, adicionar livro, estante estática). Parado no ponto de revisão da fase 3, com capturas em `capturas/`.

As abas **Ler** e **Dados** ainda mostram um texto de espera. **Ajustes** tem só a aparência. O botão **Editar** avisa que o modo de edição vem depois. Tocar numa lombada ainda não faz nada: a página do livro é da fase 5.

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
