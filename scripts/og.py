"""Desenha o cartão de link do site — `public/og.png`, 1200x630.

É a imagem que o Discord, o WhatsApp, o X e o painel do Google mostram quando
alguém cola o endereço da calculadora. O texto dela é a única parte do site que
não pode ser lida por Ctrl+F, então ele repete o essencial: o nome, o que a
página faz e para qual servidor.

Por que Python num repositório de TypeScript: rasterizar texto exige um
renderizador de fontes, e a alternativa em Node seria uma dependência nativa
(`sharp`, `resvg`) instalada por todo mundo que clona o projeto para gerar um
arquivo que muda uma vez por ano. O PNG fica versionado; este script existe para
que ele seja *reproduzível*, não para rodar no build.

    py -m pip install pillow
    py scripts/og.py

As cores são os tokens de `src/index.css` convertidos de oklch para sRGB. Se
o tema mudar, elas mudam aqui também — e a conversão está no fim do arquivo.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / "public" / "og.png"

L, A = 1200, 630

FUNDO = (9, 13, 21)  # --color-fundo
PAINEL = (23, 28, 38)  # --color-painel
TEXTO = (228, 232, 239)  # --color-texto
SUAVE = (169, 176, 189)  # --color-suave
REALCE = (234, 181, 50)  # --color-realce
BORDA = (50, 56, 69)  # --color-borda

FONTES = Path("C:/Windows/Fonts")


def fonte(arquivo: str, tamanho: int) -> ImageFont.FreeTypeFont:
    """Segoe UI, que é a primeira da pilha do site no Windows."""
    return ImageFont.truetype(str(FONTES / arquivo), tamanho)


def main() -> None:
    img = Image.new("RGB", (L, A), FUNDO)
    d = ImageDraw.Draw(img)

    # Faixa dourada na borda esquerda: o mesmo realce do refino, e o que faz o
    # cartão ser reconhecido de relance numa lista de links do Discord.
    d.rectangle([0, 0, 14, A], fill=REALCE)

    negrito = fonte("segoeuib.ttf", 96)
    media = fonte("segoeui.ttf", 40)
    pequena = fonte("segoeui.ttf", 30)
    rotulo = fonte("segoeuib.ttf", 26)

    x = 96
    y = 116

    # "Refinômetro", com "metro" no dourado — como no cabeçalho da página.
    d.text((x, y), "Refinô", font=negrito, fill=TEXTO)
    largura = d.textlength("Refinô", font=negrito)
    d.text((x + largura, y), "metro", font=negrito, fill=REALCE)

    y += 138
    d.text((x, y), "Calculadora e simulador de refino", font=media, fill=TEXTO)
    y += 56
    d.text((x, y), "do Ragnarok Latam", font=media, fill=REALCE)

    y += 86
    d.line([x, y, L - 96, y], fill=BORDA, width=2)

    # As três coisas que a página faz, em pastilhas — o que separa esta
    # calculadora de uma tabela de chances copiada de um wiki.
    y += 40
    px = x
    for texto in ("custo esperado exato", "melhor minério por nível", "percentis, não só a média"):
        w = d.textlength(texto, font=rotulo)
        d.rounded_rectangle([px, y, px + w + 40, y + 54], radius=27, fill=PAINEL)
        d.text((px + 20, y + 12), texto, font=rotulo, fill=SUAVE)
        px += w + 56

    d.text((x, A - 92), "fernandohf.github.io/refinometro", font=pequena, fill=REALCE)

    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    img.save(SAIDA, optimize=True)
    print(f"{SAIDA.relative_to(RAIZ)} — {SAIDA.stat().st_size / 1024:.0f} kB")


if __name__ == "__main__":
    main()
