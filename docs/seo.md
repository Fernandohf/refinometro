# Ser encontrado

A calculadora só serve a quem chega até ela, e quem chega digita alguma variação de
**"calculadora de refino ragnarok latam"** ou **"simulador de refino ragnarok"** num buscador.
Ninguém procura por "Refinômetro": esse nome é a coisa que se aprende *depois*.

Este documento é sobre o que a página faz para aparecer nessa busca, e sobre as duas coisas
que ela não pode fazer sozinha.

## O problema de uma página que se monta no cliente

O site é um SPA: o HTML servido é uma `<div id="root">` e um `<script>`. O rastreador do Google
renderiza o JavaScript antes de indexar, então ele vê a calculadora inteira — mas ele é o único
que faz isso de forma confiável. O rastreador do Bing, o cartão de link do Discord, o do
WhatsApp e quem chega com o script bloqueado leem o HTML cru e mais nada.

Por isso o `#root` **não** é servido vazio. Dentro dele há o mesmo `<h1>` que o React desenha em
seguida, um parágrafo dizendo o que a página calcula e um `<noscript>`. `createRoot` limpa os
filhos do container no primeiro render, então esse bloco some sozinho; e como o cabeçalho
estático é igual ao renderizado, o que o olho vê não é uma troca de tela — é o resto da página
aparecendo em volta de um título que não se moveu.

Um teste amarra os dois textos ([`tests/seo.test.ts`](../tests/seo.test.ts)). Se eles
divergirem, o buscador passa a indexar um título que o visitante nunca vê.

## Uma fonte, três protocolos

Título e descrição aparecem em três lugares na mesma página — `<title>`, `og:title`,
`twitter:title` — e três cópias de uma frase divergem na primeira vez que alguém melhora só uma.

Então elas moram em [`src/data/seo.ts`](../src/data/seo.ts), e o `index.html` guarda só um
marcador `<!-- seo -->`. Quem o preenche é o plugin `seo()` do
[`vite.config.ts`](../vite.config.ts), em dev e no build; se o marcador sumir, o build **para**,
porque um site sem `<title>` não é um bug que alguém note olhando para a tela.

O mesmo arquivo guarda as perguntas frequentes, e isso não é conveniência: elas são declaradas
ao Google como dados estruturados de FAQ **e** exibidas na tela por
[`components/Sobre.tsx`](../src/components/Sobre.tsx). Prometer uma resposta ao buscador e
mostrar outra na página é o que o próprio Google chama de conteúdo enganoso — e a punição não
vem com aviso. Com um arquivo só, não há como divergirem.

## O que está no `<head>`, e por quê

| O quê | Para quê |
| --- | --- |
| `<title>` e `description` | A única coisa que o buscador lê antes de decidir renderizar a página. Carregam os termos da busca real: calculadora, simulador, refino, Ragnarok Latam. |
| `canonical` | O mesmo conteúdo responde em `/refinometro` e em `/refinometro/`. Sem esta linha, os dois endereços competem entre si e dividem a autoridade da página. |
| `robots` com `max-snippet:-1` | Libera o trecho longo e a miniatura grande. O padrão do Google é conservador, e na Europa é um resumo curto e imagem nenhuma. |
| Open Graph e `twitter:` | O cartão que o Discord e o WhatsApp desenham. Sem eles, um link colado no chat da guilda é uma linha de texto cinza. |
| `application/ld+json` | Diz, sem depender de o rastreador acertar a leitura do HTML, que isto é um aplicativo web gratuito, em português, sobre Ragnarok Online, e que responde estas perguntas. |

## O cartão de link

`public/og.png`, 1200×630, versionado. Ele é desenhado por
[`scripts/og.py`](../scripts/og.py) — Python porque rasterizar texto exige um renderizador de
fontes, e a alternativa em Node seria uma dependência nativa instalada por todo mundo que clona
o projeto para gerar um arquivo que muda uma vez por ano. O script não roda no build; ele existe
para que o PNG seja reproduzível.

## O sitemap, e o robots.txt que não existe

O `sitemap.xml` é emitido pelo mesmo plugin, com `lastmod` na data do build — que é a verdade,
já que o site é republicado inteiro a cada push na `main`. Para uma página só ele não serve para
descoberta; serve para ter um endereço a entregar ao Search Console.

Não há `robots.txt`, e não é esquecimento. O arquivo só é lido na **raiz do domínio** —
`fernandohf.github.io/robots.txt` —, e essa raiz é servida por outro repositório
(`Fernandohf/Fernandohf.github.io`). Um `robots.txt` publicado em `/refinometro/robots.txt` não
é lido por rastreador nenhum. Sem arquivo na raiz, o padrão é liberar tudo, que é exatamente o
que se quer aqui.

## As duas coisas que o repositório não faz sozinho

Tudo acima é a página se apresentando bem. Aparecer na busca depende de mais duas coisas, e
nenhuma delas mora no código:

1. **Enviar o sitemap ao [Google Search Console](https://search.google.com/search-console)** —
   a propriedade é `https://fernandohf.github.io/refinometro/`, e a prova de posse dela já está
   no repositório (ver abaixo); o que falta é registrar
   `https://fernandohf.github.io/refinometro/sitemap.xml` na aba **Sitemaps**. É também o único
   lugar onde dá para ver por quais termos a página já está aparecendo, e em que posição. O
   [Bing Webmaster Tools](https://www.bing.com/webmasters) importa a propriedade do Google em um
   clique.

2. **Links de fora.** É o que mais pesa e o que menos se controla: uma página nova sem nenhum
   link apontando para ela demora meses para sair da segunda página, por melhor que esteja o
   `<head>`. Os lugares onde isso é bem-vindo em vez de spam são os de sempre — o Discord e o
   fórum do servidor, o subreddit de Ragnarok, um comentário respondendo à pergunta de alguém
   com o número que a calculadora deu. O campo **Website** e os **topics** na página do
   repositório no GitHub também contam, e são de graça.

## A prova de posse, e por que ela é um arquivo

`public/googlef53c345c4523b92b.html` é o arquivo de verificação do Search Console. Ele diz o
próprio nome e nada mais; o que o prova não é o conteúdo, é o fato de ele responder na raiz da
propriedade — e `public/` é copiado verbatim, então ele sai em
`/refinometro/googlef53c345c4523b92b.html`, que é exatamente a propriedade registrada.

**Não apague nem renomeie.** O Google reconfere a posse de tempos em tempos, não só no dia do
cadastro, e a falha é das silenciosas: a página continua no ar, o build continua verde, e o que
some é o relatório. Um teste guarda o arquivo e a linha de dentro
([`tests/seo.test.ts`](../tests/seo.test.ts)).

---

Ver também: [Publicação](publicacao.md) · [Como a interface se organiza](interface.md)
