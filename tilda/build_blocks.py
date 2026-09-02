"""Режет статические страницы Fulfil.pro на отдельные Vibe-блоки Тильды.

На выходе:
  out/_head.html            — общий код для «Настройки сайта → Ещё → HTML-код для HEAD»
  out/<страница>/NN-slug.html — по одному файлу на блок, в порядке вставки
  out/<страница>/_preview.html — сборка блоков обратно в страницу для проверки
  out/_upload/              — картинки, которые нужно загрузить в Тильду
  out/MANIFEST.md           — что куда вставлять и что заменить

Запуск:  python tilda/build_blocks.py
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import sys
from html import unescape as html_unescape
import re
import shutil
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import quote

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
TILDA = ROOT / "tilda"
OUT = TILDA / "out"
ASSETS = ROOT / "assets"

WRAP = ".fx-block"

PAGES = {
    "index": "Главная",
    "wildberries": "Фулфилмент для Wildberries",
    "ozon": "Фулфилмент для Ozon",
    "fbs": "Фулфилмент по модели FBS",
}

# Адреса страниц в Тильде — подставляются вместо ссылок на .html файлы.
PAGE_URLS = {
    "index.html": "/",
    "wildberries.html": "/fulfilment-dlya-wildberries/",
    "ozon.html": "/fulfilment-dlya-ozon/",
    "fbs.html": "/fulfilment-po-modeli-fbs/",
}

# 3.4 — порог появления кнопки «Наверх», px. Уезжает в data-атрибут блока шапки.
BACK_TO_TOP = {
    "index": 600,
    "wildberries": 400,
    "ozon": 600,
    "fbs": 600,
}

# 3.3 — адрес прайса. Если очистить, в блоках останется метка [[PRICE_PDF]].
# Ссылка на Google Drive работает только при открытом доступе «всем, у кого есть
# ссылка»: иначе посетитель попадает на страницу входа Google вместо загрузки.
PRICE_URL = "https://drive.google.com/uc?export=download&id=1GDuUmNIk33Ach3LO2i7yZ1W-idAFZ0-s"
PRICE_FILE = "assets/docs/Fulfil_pro_Прайс_на_услуги_2026_финальный.pdf"

# Классы, которые навешивает JS, — при сопоставлении правил их игнорируем.
STATE_CLASSES = {
    "is-active", "is-open", "is-visible", "is-passed", "is-done",
    "is-hidden", "selected", "fx-block", "fx-toast", "fx-back-to-top",
}

# Эти элементы живут в <body>, а не внутри блока: рантайм создаёт их сам,
# поэтому их стили не скоупим.
UNSCOPED_PREFIXES = (".toast", ".back-to-top", ".fx-")

# Векторные логотипы встраиваем прямо в блок — они лёгкие и не требуют загрузки.
SVG_INLINE_LIMIT = 20_000
# Растр в блок не встраиваем: base64 раздувает код блока и мешает кешированию.
# Исключение — логотип в шапке, чтобы блок шапки был самодостаточным.
INLINE_RASTER = {"fulfil-logo.png"}

# Если картинки лежат на своём хостинге (Тильда, CDN, GitHub Pages), передайте
# базовый адрес: `python tilda/build_blocks.py --assets-base https://.../assets/`.
# Тогда вместо меток [[UPLOAD:…]] в блоки подставятся готовые ссылки.
ASSETS_BASE = ""

# Если Vibe-блок изолирован (например, рендерится в iframe), общий код из HEAD
# до него не долетает. Тогда собираем каждый блок со своей копией базы:
# `python tilda/build_blocks.py --standalone`.
STANDALONE = False

# Компромисс между двумя крайностями: стили лежат в блоке, поэтому редактор Тильды
# показывает его как надо, а рантайм и шрифты подключаются один раз из HEAD.
# Скрипт весит вдвое больше стилей и для вида в админке не нужен.
# `python tilda/build_blocks.py --styles-in-blocks`
STYLES_IN_BLOCKS = False


# ----------------------------------------------------------------- CSS parser

@dataclass
class Rule:
    index: int
    selectors: list[str]
    body: str
    media: str = ""

    def render(self, scoped: bool = True, wrap: str = WRAP) -> str:
        selector = ", ".join(scope_selector(s, wrap) if scoped else s for s in self.selectors)
        return f"{selector}{{{self.body}}}"


@dataclass
class Raw:
    index: int
    text: str
    media: str = ""


def strip_comments(text: str) -> str:
    return re.sub(r"/\*.*?\*/", "", text, flags=re.S)


def split_top_level(text: str, separator: str = ",") -> list[str]:
    parts, depth, current = [], 0, []
    for char in text:
        if char in "([":
            depth += 1
        elif char in ")]":
            depth -= 1
        if char == separator and depth == 0:
            parts.append("".join(current))
            current = []
        else:
            current.append(char)
    parts.append("".join(current))
    return [p.strip() for p in parts if p.strip()]


def read_block(text: str, start: int) -> tuple[str, int]:
    """Читает содержимое { … } начиная с позиции открывающей скобки."""
    depth, i = 0, start
    while i < len(text):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return text[start + 1:i], i + 1
        i += 1
    raise ValueError("Незакрытая фигурная скобка в CSS")


def parse_css(text: str, media: str = "", counter: list[int] | None = None) -> list:
    counter = counter if counter is not None else [0]
    nodes: list = []
    i = 0
    while i < len(text):
        if text[i].isspace():
            i += 1
            continue
        brace = text.find("{", i)
        semicolon = text.find(";", i)
        if brace == -1 and semicolon == -1:
            break
        if brace == -1 or (semicolon != -1 and semicolon < brace):
            statement = text[i:semicolon + 1].strip()
            if statement:
                counter[0] += 1
                nodes.append(Raw(counter[0], statement, media))
            i = semicolon + 1
            continue

        prelude = text[i:brace].strip()
        body, i = read_block(text, brace)

        if prelude.startswith("@media") or prelude.startswith("@supports"):
            nested = media + " and " + prelude if media else prelude
            nodes.extend(parse_css(body, nested, counter))
        elif prelude.startswith("@"):
            counter[0] += 1
            nodes.append(Raw(counter[0], f"{prelude}{{{body}}}", media))
        else:
            counter[0] += 1
            nodes.append(Rule(counter[0], split_top_level(prelude), body.strip(), media))
    return nodes


# ---------------------------------------------------------------- CSS scoping

def scope_selector(selector: str, wrap: str = WRAP) -> str:
    s = selector.strip()
    if not s:
        return s
    if s.startswith(UNSCOPED_PREFIXES):
        return s
    if s == "*":
        return f"{wrap}, {wrap} *"
    if s.startswith("*"):
        return f"{wrap} {s}"
    if s == ":root" or s == "html" or s == "body":
        return wrap
    for prefix in (":root", "html", "body"):
        if s.startswith(prefix + " "):
            return f"{wrap} {s[len(prefix) + 1:]}"
        if s.startswith(prefix + ":") or s.startswith(prefix + "."):
            return wrap + s[len(prefix):]
    return f"{wrap} {s}"


def selector_tokens(selector: str) -> tuple[set[str], set[str]]:
    classes = set(re.findall(r"\.([A-Za-z_][\w-]*)", selector)) - STATE_CLASSES
    ids = set(re.findall(r"#([A-Za-z_][\w-]*)", selector))
    return classes, ids


def render_nodes(nodes: list, scoped: bool = True, wrap: str = WRAP) -> str:
    """Собирает CSS обратно, группируя соседние правила по медиазапросу."""
    chunks: list[str] = []
    current_media = None
    buffer: list[str] = []

    def flush() -> None:
        if not buffer:
            return
        if current_media:
            chunks.append(f"{current_media}{{{''.join(buffer)}}}")
        else:
            chunks.append("".join(buffer))
        buffer.clear()

    for node in nodes:
        if node.media != current_media:
            flush()
            current_media = node.media
        buffer.append(node.render(scoped, wrap) if isinstance(node, Rule) else node.text)
    flush()
    return "".join(chunks)


def drop_subgrid(css: str) -> str:
    """Убирает зависимость карточек от строк родительской сетки.

    В вёрстке карточки объявлены как `grid-row: span N` + `grid-template-rows: subgrid`:
    так их внутренние части выравниваются между колонками. Но эта связь рвётся, если
    между сеткой и карточкой появляется лишний элемент, — а редактор Тильды оборачивает
    элементы, чтобы сделать их редактируемыми, и секции в админке схлопываются.

    Переводим карточки в обычные элементы сетки: колонки и рамки на месте, соседи по
    ряду по-прежнему тянутся до общей высоты. Ровно так эта же вёрстка уже работает
    на мобильных — там `subgrid` отключён в медиазапросах.
    """
    css = re.sub(r"grid-template-rows:\s*subgrid", "grid-template-rows: none", css)
    css = re.sub(r"grid-template-rows:\s*repeat\(\s*\d+\s*,\s*auto\s*\)", "grid-template-rows: none", css)
    css = re.sub(r"grid-row:\s*span\s+\d+", "grid-row: auto", css)
    return css


def minify_css(css: str) -> str:
    css = strip_comments(css)
    css = re.sub(r"\s+", " ", css)
    css = re.sub(r"\s*([{}:;,>])\s*", r"\1", css)
    css = re.sub(r";}", "}", css)
    return css.strip()


# ------------------------------------------------------------------- картинки


_inline_cache: dict[str, str | None] = {}
_uploads: dict[str, Path] = {}


def encode_webp(path: Path, max_width: int, quality: int) -> bytes:
    source = Image.open(path)
    has_alpha = "A" in source.getbands() or "transparency" in source.info
    image = source.convert("RGBA" if has_alpha else "RGB")
    if image.width > max_width:
        image = image.resize(
            (max_width, round(image.height * max_width / image.width)),
            Image.Resampling.LANCZOS,
        )
    buffer = io.BytesIO()
    image.save(buffer, format="WEBP", quality=quality, method=6)
    return buffer.getvalue()


def inline_asset(name: str) -> str | None:
    """Возвращает data-URI для лёгкой векторной графики, иначе None."""
    if name in _inline_cache:
        return _inline_cache[name]

    path = ASSETS / name
    result: str | None = None
    if path.exists():
        if path.suffix.lower() == ".svg":
            svg = re.sub(r"<\?xml.*?\?>", "", path.read_text(encoding="utf-8"), flags=re.S)
            svg = re.sub(r">\s+<", "><", svg).strip()
            # URL-кодирование вместо base64: та же картинка примерно на треть короче,
            # а код блока и так упирается в ограничения редактора Тильды.
            encoded = quote(svg, safe="/:=;,.-_() ")
            candidate = f"data:image/svg+xml,{encoded}"
            result = candidate if len(candidate) <= SVG_INLINE_LIMIT else None
        elif name in INLINE_RASTER:
            payload = encode_webp(path, 320, 80)
            result = "data:image/webp;base64," + base64.b64encode(payload).decode("ascii")

    _inline_cache[name] = result
    return result


def export_upload(name: str) -> str:
    """Готовит webp для загрузки в Тильду и возвращает имя файла."""
    path = ASSETS / name
    target_name = Path(name).stem + ".webp"
    if name not in _uploads:
        upload_dir = OUT / "_upload"
        upload_dir.mkdir(parents=True, exist_ok=True)
        target = upload_dir / target_name
        if path.exists():
            target.write_bytes(encode_webp(path, 1600, 78))
        _uploads[name] = target
    return target_name


# --------------------------------------------------------------- разбор HTML

@dataclass
class Block:
    slug: str
    title: str
    html: str
    classes: set[str] = field(default_factory=set)
    ids: set[str] = field(default_factory=set)
    css: list = field(default_factory=list)
    uploads: list[str] = field(default_factory=list)


SLUG_TITLES = {
    "header": "Шапка и меню",
    "footer": "Подвал",
    "hero": "Первый экран с формой",
    "page-hero": "Первый экран с формой",
    "fbs-strip": "Полоса FBS",
    "marketplaces": "Маркетплейсы",
    "tariffs": "Тарифы",
    "price": "Тарифы",
    "quiz": "Квиз-калькулятор",
    "steps": "Как мы работаем",
    "schemes": "Схемы работы",
    "lk": "Личный кабинет",
    "savings": "Экономия",
    "warehouse": "Склад",
    "guarantees": "Гарантии",
    "cases": "Кейсы",
    "reviews": "Отзывы",
    "team": "Команда",
    "faq": "Вопросы и ответы",
    "final-cta": "Финальная форма",
    "advantages": "Преимущества",
    "cycle": "Цикл работ",
    "start": "Как начать",
    "svc": "Дополнительные услуги",
    "trust": "Доверие и клиенты",
    "flow": "Процесс",
    "compare": "Сравнение FBS и FBO",
    "mp": "Маркетплейсы",
    "fc": "Фулфилмент-центр",
}


def collect_tokens(html: str) -> tuple[set[str], set[str]]:
    classes: set[str] = set()
    for match in re.findall(r'class="([^"]*)"', html):
        classes.update(match.split())
    ids = set(re.findall(r'id="([^"]*)"', html))
    return classes - STATE_CLASSES, ids


def section_slug(tag: str, taken: set[str]) -> str:
    ident = re.search(r'id="([^"]+)"', tag)
    classes = re.search(r'class="([^"]*)"', tag)
    candidates: list[str] = []
    if classes:
        names = [c for c in classes.group(1).split() if c not in {"section", "section--light", "section--navy"}]
        candidates.extend(names)
    if ident:
        candidates.insert(0 if not candidates else 1, ident.group(1))
    for candidate in candidates:
        slug = re.sub(r"[^a-z0-9-]", "-", candidate.lower()).strip("-")
        if slug and slug not in taken:
            return slug
    base = candidates[0] if candidates else "block"
    slug = re.sub(r"[^a-z0-9-]", "-", base.lower()).strip("-") or "block"
    counter = 2
    while f"{slug}-{counter}" in taken:
        counter += 1
    return f"{slug}-{counter}"


def js_array_to_json(source: str) -> list:
    """Превращает литерал массива из inline-скрипта в данные."""
    text = source.strip().rstrip(";")
    text = re.sub(r"(\{|,)\s*(\w+)\s*:", r'\1"\2":', text)
    text = re.sub(r"'([^']*)'", lambda m: json.dumps(m.group(1), ensure_ascii=False), text)
    text = re.sub(r",\s*([\]}])", r"\1", text)
    return json.loads(text)


def prepare_html(html: str, block: Block) -> str:
    # Ссылки на соседние страницы → адреса страниц Тильды.
    # Отдельно — ссылки с якорем вида index.html#tariffs: их даёт единое меню,
    # когда нужного раздела на текущей странице нет.
    for source, target in PAGE_URLS.items():
        html = html.replace(f'href="{source}#', f'href="{target}#')
        html = html.replace(f'href="{source}"', f'href="{target}"')

    # Прайс лежит в Тильде, а не рядом с блоком.
    html = html.replace(f'href="{PRICE_FILE}"', f'href="{PRICE_URL or "[[PRICE_PDF]]"}"')

    # В вёрстке есть правила вида `img[src*="megamarket"]`. После загрузки в Тильду
    # адрес картинки меняется, поэтому помечаем каждый <img> исходным именем файла,
    # а селекторы в CSS переводим на data-asset (см. main()).
    def tag_image(match: re.Match) -> str:
        tag = match.group(0)
        source = re.search(r'src="assets/([A-Za-z0-9._-]+)"', tag)
        if not source or "data-asset=" in tag:
            return tag
        return tag.replace("<img", f'<img data-asset="{source.group(1)}"', 1)

    html = re.sub(r"<img\b[^>]*>", tag_image, html)

    # Комментарии в вёрстке — это пометки для клиента, и в них тоже встречаются пути
    # к картинкам («было фото склада: assets/…»). Их подменять нельзя, иначе блок
    # начинает числиться как требующий картинку, которой в нём нет.
    comments: list[str] = []

    def stash_comment(match: re.Match) -> str:
        comments.append(match.group(0))
        return f"\x00COMMENT{len(comments) - 1}\x00"

    html = re.sub(r"<!--.*?-->", stash_comment, html, flags=re.S)

    def replace_asset(match: re.Match) -> str:
        name = match.group(1)
        if not (ASSETS / name).exists():
            return match.group(0)  # заглушки в комментариях вёрстки трогать нечего
        inline = inline_asset(name)
        if inline:
            return inline
        target = export_upload(name)
        if target not in block.uploads:
            block.uploads.append(target)
        return f"{ASSETS_BASE}{target}" if ASSETS_BASE else f"[[UPLOAD:{target}]]"

    html = re.sub(r"assets/([A-Za-z0-9._-]+)", replace_asset, html)
    html = re.sub(r"\x00COMMENT(\d+)\x00", lambda m: comments[int(m.group(1))], html)
    return html


def faq_schema(html: str) -> str | None:
    """FAQPage из микроразметки блока вопросов."""
    questions = re.findall(r'<span itemprop="name">(.*?)</span>', html, flags=re.S)
    answers = re.findall(r'<div itemprop="text">(.*?)</div></div>', html, flags=re.S)
    if not questions or len(questions) != len(answers):
        return None

    def plain(text: str) -> str:
        text = re.sub(r"</p>\s*<p>", " ", text)
        text = re.sub(r"<[^>]+>", "", text)
        return html_unescape(re.sub(r"\s+", " ", text)).strip()

    data = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {
                "@type": "Question",
                "name": plain(question),
                "acceptedAnswer": {"@type": "Answer", "text": plain(answer)},
            }
            for question, answer in zip(questions, answers)
        ],
    }
    payload = json.dumps(data, ensure_ascii=False, indent=2).replace("</", "<\\/")
    return f'<script type="application/ld+json">{payload}</script>'


def build_blocks(page: str) -> list[Block]:
    source = (ROOT / f"{page}.html").read_text(encoding="utf-8")
    blocks: list[Block] = []
    taken: set[str] = set()

    header = re.search(r'(<header class="site-header">.*?</header>)', source, flags=re.S)
    if header:
        blocks.append(Block("header", SLUG_TITLES["header"], header.group(1)))
        taken.add("header")

    body = re.search(r"<main[^>]*>(.*?)</main>", source, flags=re.S).group(1)
    for match in re.finditer(r"(<section\b[^>]*>.*?</section>)", body, flags=re.S):
        html = match.group(1)
        tag = html[:html.index(">") + 1]
        slug = section_slug(tag, taken)
        taken.add(slug)
        key = slug.split("-")[0] if slug not in SLUG_TITLES else slug
        title = SLUG_TITLES.get(slug) or SLUG_TITLES.get(key) or slug
        blocks.append(Block(slug, title, html))

    footer = re.search(r'(<footer class="footer">.*?</footer>)', source, flags=re.S)
    if footer:
        blocks.append(Block("footer", SLUG_TITLES["footer"], footer.group(1)))

    # Конфиг квиза из inline-скрипта уезжает внутрь блока с квизом.
    steps_match = re.search(r"window\.QUIZ_STEPS\s*=\s*(\[.*?\]);", source, flags=re.S)
    counts_contact = "window.QUIZ_COUNT_CONTACT = true" in source
    market_match = re.search(r"window\.QUIZ_MARKETPLACE\s*=\s*'([^']*)'", source)
    if steps_match:
        config = {
            "steps": js_array_to_json(steps_match.group(1)),
            "countContact": counts_contact,
            "marketplace": market_match.group(1) if market_match else "",
        }
        for block in blocks:
            if "quizContent" in block.html:
                payload = json.dumps(config, ensure_ascii=False).replace("</", "<\\/")
                block.html += (
                    f'\n<script type="application/json" class="fx-quiz-config">{payload}</script>'
                )
                break

    # Разметка FAQ уже размечена микроданными; JSON-LD добавляем тем же блоком,
    # чтобы Google получил оба формата и они не разъезжались между собой.
    for block in blocks:
        if 'itemtype="https://schema.org/FAQPage"' not in block.html:
            continue
        schema = faq_schema(block.html)
        if schema:
            block.html += "\n" + schema
            target = OUT / page
            target.mkdir(parents=True, exist_ok=True)
            (target / "_faq-jsonld.html").write_text(
                "<!-- Fulfil.pro · FAQPage для «Настройки страницы → Ещё → HTML-код внутрь HEAD».\n"
                "     Уже есть внутри блока FAQ — сюда вставлять только если требуется в HEAD. -->\n"
                + schema + "\n", encoding="utf-8")
        break

    for block in blocks:
        block.html = prepare_html(block.html, block)
        block.classes, block.ids = collect_tokens(block.html)

    return blocks


# ----------------------------------------------------------- раскладка стилей

def assign_rules(nodes: list, pages: dict[str, list[Block]]) -> tuple[list, dict[tuple[str, str], list]]:
    """Делит правила на общие (в HEAD) и блочные."""
    head: list = []
    per_block: dict[tuple[str, str], list] = {}
    owners: dict[int, tuple[str, str] | None] = {}

    for node in nodes:
        if isinstance(node, Raw):
            owners[node.index] = None
            continue

        matched: set[tuple[str, str]] = set()
        generic = False
        for selector in node.selectors:
            if selector.startswith(UNSCOPED_PREFIXES):
                generic = True
                break
            classes, ids = selector_tokens(selector)
            if not classes and not ids:
                generic = True
                break
            for page, blocks in pages.items():
                for block in blocks:
                    if classes <= block.classes and ids <= block.ids:
                        matched.add((page, block.slug))

        # Правило уезжает в блок, только если во всём проекте его использует
        # ровно один блок. Всё остальное (общее, ненайденное, глобальное) — в HEAD.
        owners[node.index] = next(iter(matched)) if not generic and len(matched) == 1 else None

    for node in nodes:
        owner = owners[node.index]
        if owner is None:
            head.append(node)
        else:
            per_block.setdefault(owner, []).append(node)

    return head, per_block


# ------------------------------------------------------------------- вывод

# Начертания, которые реально встречаются на сайте — проверено обходом всех
# четырёх страниц по вычисленным стилям (getComputedStyle), а не по CSS-правилам:
# Manrope 400/500/600/700 — текст, Onest 500/600/700 — заголовки и цифры.
# Один файл на насыщенность, с полным набором символов (не разбито на cyrillic/
# latin через unicode-range) — так совпадает со слотами загрузчика шрифтов
# Тильды: там ровно один файл на Light/Normal/Medium/Semibold/Bold, без подмножеств.
# Собраны инструментом варьируемых начертаний (varLib.instancer) из официальных
# исходников Google Fonts — тот же контур букв, что был бы через Google Fonts.
FONT_FACES = [
    ("Manrope", 400, "Manrope-400.woff"),
    ("Manrope", 500, "Manrope-500.woff"),
    ("Manrope", 600, "Manrope-600.woff"),
    ("Manrope", 700, "Manrope-700.woff"),
    ("Onest", 500, "Onest-500.woff"),
    ("Onest", 600, "Onest-600.woff"),
    ("Onest", 700, "Onest-700.woff"),
]

# Адреса, которые Тильда выдала после загрузки 7 файлов из assets/fonts/.
FONT_URLS: dict[str, str] = {
    "Manrope-400.woff": "https://static.tildacdn.com/tild3131-6564-4537-a466-393266356432/Manrope-400.woff",
    "Manrope-500.woff": "https://static.tildacdn.com/tild6633-3034-4562-a537-616136373635/Manrope-500.woff",
    "Manrope-600.woff": "https://static.tildacdn.com/tild3764-3634-4635-b633-363031643538/Manrope-600.woff",
    "Manrope-700.woff": "https://static.tildacdn.com/tild6563-3137-4035-b064-636633363262/Manrope-700.woff",
    "Onest-500.woff": "https://static.tildacdn.com/tild3431-6638-4737-b034-363438656334/Onest-500.woff",
    "Onest-600.woff": "https://static.tildacdn.com/tild6230-3830-4032-b665-396630333438/Onest-600.woff",
    "Onest-700.woff": "https://static.tildacdn.com/tild3133-6538-4565-a636-363834616431/Onest-700.woff",
}


def font_faces_css() -> str:
    parts = []
    for family, weight, file in FONT_FACES:
        url = FONT_URLS.get(file) or f"[[FONT:{file}]]"
        parts.append(
            f"@font-face{{font-family:'{family}';font-style:normal;font-weight:{weight};"
            f"font-display:swap;src:url({url}) format('woff');}}"
        )
    return "".join(parts)


def chrome_css(head_nodes: list) -> str:
    """Тост и кнопку «наверх» рантайм кладёт в <body>, вне блоков.

    Переменные и базовую типографику отдаём им отдельным правилом, чтобы не
    выносить :root на весь сайт Тильды.
    """
    variables = ""
    for node in head_nodes:
        if isinstance(node, Rule) and node.selectors == [":root"] and not node.media:
            variables = node.body.strip().rstrip(";")
            break
    declarations = "; ".join(filter(None, [
        variables,
        'font-family: "Manrope", sans-serif',
        "font-size: 16px",
        "line-height: 1.5",
        "box-sizing: border-box",
    ]))
    return f".fx-toast, .fx-back-to-top {{{declarations}}}"


def base_css(head_nodes: list) -> str:
    return minify_css(chrome_css(head_nodes) + render_nodes(head_nodes))


def matched_anywhere(nodes: list, pages: dict[str, list[Block]]) -> set[int]:
    """Индексы правил, которые находят свой элемент хоть в одном блоке."""
    found: set[int] = set()
    for node in nodes:
        if isinstance(node, Raw):
            continue
        for selector in node.selectors:
            classes, ids = selector_tokens(selector)
            if not classes and not ids:
                continue
            for blocks in pages.values():
                if any(classes <= block.classes and ids <= block.ids for block in blocks):
                    found.add(node.index)
                    break
            if node.index in found:
                break
    return found


def rules_for_block(nodes: list, block: Block, matched: set[int]) -> list:
    """Правила, нужные одному блоку: свои, общие и те, что вешает JavaScript.

    Автономному блоку незачем нести стили всех остальных секций — с полной базой
    он весит под 70–100 КБ, и разметка уезжает в самый хвост кода.
    """
    selected: list = []
    for node in nodes:
        if isinstance(node, Raw):
            selected.append(node)
            continue
        # Классы вроде quiz__option появляются только после работы скрипта,
        # в статической разметке их нет — такие правила нужны всем блокам.
        if node.index not in matched:
            selected.append(node)
            continue
        for selector in node.selectors:
            classes, ids = selector_tokens(selector)
            generic = selector.startswith(UNSCOPED_PREFIXES) or (not classes and not ids)
            if generic or (classes <= block.classes and ids <= block.ids):
                selected.append(node)
                break
    return selected


def runtime_js() -> str:
    """Сжатая версия рантайма — вставляется в HEAD.

    Источник (fx-runtime.js) остаётся читаемым с комментариями — правится он,
    а не результат. Сжатие вдвое снижает объём одного куска кода, который
    приходится копировать в поле настроек сайта целиком за один раз: чем он
    больше, тем выше шанс потерять хвост при вставке в текстовое поле Тильды.
    Если terser недоступен (нет npm/сети) — используем исходник как есть,
    сборка не должна падать из-за отсутствия инструмента.
    """
    source = TILDA / "fx-runtime.js"
    try:
        result = subprocess.run(
            ["npx", "--yes", "terser", str(source), "-c", "-m"],
            capture_output=True, text=True, timeout=60, shell=(sys.platform == "win32"),
            encoding="utf-8", errors="replace",
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout
    except (OSError, subprocess.SubprocessError):
        pass
    print("  [runtime_js] terser недоступен — используется несжатый fx-runtime.js")
    return source.read_text(encoding="utf-8")


def write_head(head_nodes: list) -> str:
    document = (
        "<!-- Fulfil.pro · общий код для всех страниц.\n"
        "     Вставить в «Настройки сайта → Ещё → HTML-код для вставки внутрь HEAD».\n"
        "     Обновляется только через tilda/build_blocks.py — руками не править. -->\n"
        f"<style>{font_faces_css()}</style>\n"
        # Когда стили лежат в блоках, база в HEAD несёт только шрифты и рантайм —
        # иначе каждое правило оказалось бы на странице дважды.
        + ("" if STYLES_IN_BLOCKS else f"<style>{base_css(head_nodes)}</style>\n")
        + f"<script>{runtime_js()}</script>\n"
    )
    (OUT / "_head.html").write_text(document, encoding="utf-8")
    return document


def write_external_base(head_nodes: list) -> None:
    """База двумя файлами плюс код для HEAD со ссылками на них.

    Код внутри HEAD грузится с каждой страницей заново. Отдельные файлы браузер
    берёт из кеша, поэтому вторая и следующие страницы открываются без них.
    """
    assets = OUT / "_assets"
    assets.mkdir(parents=True, exist_ok=True)
    # Шрифты лежат прямо в fulfil.css — файл сам по себе полный, ссылок
    # на Google Fonts в коде для HEAD после этого не остаётся.
    (assets / "fulfil.css").write_text(font_faces_css() + base_css(head_nodes), encoding="utf-8")
    (assets / "fulfil.js").write_text(runtime_js(), encoding="utf-8")

    document = (
        "<!-- Fulfil.pro · общий код для всех страниц, вариант с внешними файлами.\n"
        "\n"
        "     1. Загрузите в Тильду 7 файлов шрифтов из assets/fonts/*.woff,\n"
        "        затем out/_assets/fulfil.css и out/_assets/fulfil.js\n"
        "        (Настройки сайта → Ещё → Файлы, либо любой блок → «Загрузить файл»).\n"
        "     2. Пришлите адреса шрифтов — я подставлю их в fulfil.css и пересоберу.\n"
        "     3. Подставьте адреса fulfil.css и fulfil.js вместо меток ниже.\n"
        "     4. Вставьте всё в «Настройки сайта → Ещё → HTML-код внутрь HEAD».\n"
        "\n"
        "     Отличие от _head.html: там стили и скрипт лежат прямо в коде страницы\n"
        "     и качаются заново на каждой. Здесь браузер берёт их из кеша. -->\n"
        '<link rel="stylesheet" href="[[ASSET:fulfil.css]]">\n'
        '<script src="[[ASSET:fulfil.js]]" defer></script>\n'
    )
    (OUT / "_head-external.html").write_text(document, encoding="utf-8")


def write_base_block(page: str, head_nodes: list) -> str:
    """То же, что _head.html, но отдельным блоком — если в HEAD код не доходит."""
    document = (
        f"<!-- Fulfil.pro · {PAGES[page]} · блок 00 — база (стили и скрипты).\n"
        "     Вариант для случая, когда код из настроек сайта не применяется:\n"
        "     вставьте этот блок ПЕРВЫМ на странице, тогда HEAD трогать не нужно.\n"
        "     Если база уже стоит в HEAD — этот блок не нужен. -->\n"
        f"<style>{font_faces_css()}</style>\n"
        f"<style>{base_css(head_nodes)}</style>\n"
        f"<script>{runtime_js()}</script>\n"
    )
    target = OUT / page
    target.mkdir(parents=True, exist_ok=True)
    (target / "00-base.html").write_text(document, encoding="utf-8")
    return document


def write_block(page: str, order: int, block: Block, nodes: list, matched: set[int] | None = None) -> str:
    notes = ""
    if block.uploads:
        listing = "\n".join(f"       [[UPLOAD:{name}]] → загрузите out/_upload/{name}" for name in block.uploads)
        notes = (
            "\n     Перед вставкой замените метки на адреса файлов, загруженных в Тильду:\n"
            f"{listing}"
        )
    document = f"<!-- Fulfil.pro · {PAGES[page]} · блок {order:02d} — {block.title}{notes} -->\n"
    if STANDALONE:
        document += f"<style>{font_faces_css()}</style>\n"

    # Разметка идёт перед стилями: на отрисовку это не влияет, зато если редактор
    # обрежет длинный код, потеряется оформление, а не половина контента.
    # Стили уезжают в блок и в автономной сборке, и в компромиссном режиме,
    # а вот шрифты со скриптом — только в автономной.
    css_here = STANDALONE or STYLES_IN_BLOCKS

    extra = ""
    if block.slug == "header" and page in BACK_TO_TOP:
        extra = f' data-fx-back-to-top="{BACK_TO_TOP[page]}"'
    document += (
        f'<div class="fx-block fx-{block.slug}" data-fx="{block.slug}"{extra}>\n'
        f'{block.html.strip()}\n</div>\n'
    )

    # В автономной сборке стили привязываем к классу самого блока. Иначе правила
    # разных блоков перемешиваются в общем каскаде: `.section` из последнего блока
    # оказывается ниже `.section--light` из третьего и перекрашивает его фон.
    scope = f"{WRAP}.fx-{block.slug}" if css_here else WRAP
    css = (
        minify_css(
            chrome_css(nodes)
            + render_nodes(rules_for_block(nodes, block, matched or set()), wrap=scope)
        )
        if css_here
        else (minify_css(render_nodes(block.css)) if block.css else "")
    )
    if css:
        document += f"<style>{css}</style>\n"
    if STANDALONE:
        document += f"<script>{runtime_js()}</script>\n"

    target = OUT / page
    target.mkdir(parents=True, exist_ok=True)
    (target / f"{order:02d}-{block.slug}.html").write_text(document, encoding="utf-8")
    return document


def write_preview(page: str, head: str, documents: list[str]) -> None:
    body = "\n".join(documents)
    # В превью подменяем метки на локальные файлы, чтобы увидеть картинки.
    body = re.sub(r"\[\[UPLOAD:([^\]]+)\]\]", r"../_upload/\1", body)
    html = (
        "<!doctype html>\n<html lang=\"ru\">\n<head>\n<meta charset=\"UTF-8\">\n"
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        f"<title>Проверка блоков — {PAGES[page]}</title>\n{head}</head>\n"
        f"<body style=\"margin:0\">\n{body}\n</body>\n</html>\n"
    )
    (OUT / page / "_preview.html").write_text(html, encoding="utf-8")


def write_copy_page(pages: dict[str, list[Block]], documents: dict[str, list[tuple]]) -> None:
    """Страница-пульт: копирует код блока в буфер и подставляет адреса картинок."""
    payload = {
        "pages": {
            page: {
                "title": PAGES[page],
                "blocks": [
                    {"order": order, "slug": slug, "title": title, "uploads": uploads, "code": code}
                    for order, slug, title, code, uploads in documents[page]
                ],
            }
            for page in pages
        },
        "uploads": sorted({Path(target).name for target in _uploads.values()}),
    }
    template = (TILDA / "copy-template.html").read_text(encoding="utf-8")
    data = json.dumps(payload, ensure_ascii=False).replace("</", "<\\/")
    (OUT / "COPY.html").write_text(template.replace("__DATA__", data), encoding="utf-8")


def write_manifest(pages: dict[str, list[Block]]) -> None:
    lines = [
        "# Перенос Fulfil.pro в Tilda — карта блоков",
        "",
        "Собрано автоматически: `python tilda/build_blocks.py`. Правки вносите в исходники",
        "(`index.html`, `styles.css`, `tilda/fx-runtime.js`) и пересобирайте.",
        "",
        "## Порядок действий",
        "",
        "0. Удобнее всего переносить через пульт: откройте `out/COPY.html` — он копирует код блоков",
        "   по кнопке, помнит уже перенесённые и подставляет адреса картинок.",
    ]
    if STANDALONE:
        lines.append("1. Блоки самодостаточны, отдельной базы нет — переходите сразу к шагу 2.")
    else:
        lines += [
            "1. Один раз на весь сайт: загрузите 7 файлов шрифтов из `assets/fonts/*.woff`,",
            "   `out/_assets/fulfil.css` и `out/_assets/fulfil.js` в Тильду, затем вставьте",
            "   `out/_head-external.html` (с адресами вместо меток) в «Настройки сайта → Ещё →",
            "   HTML-код внутрь HEAD». Блок `00-base.html` — запасной вариант на случай, если этот",
            "   код почему-то не применяется: тогда вставьте его первым блоком страницы вместо HEAD.",
        ]
    lines += [
        "2. Загрузите картинки из `out/_upload/` в Тильду (любой блок с картинкой → «Загрузить» → скопировать адрес).",
        "3. На каждой странице добавляйте Vibe-блоки в порядке таблицы и вставляйте содержимое файла.",
        "4. Замените метки `[[UPLOAD:имя.webp]]` на адреса загруженных файлов.",
        "5. Добавьте на страницу стандартную форму Тильды с приёмником данных — см. `tilda/README.md`.",
        "",
    ]
    for page, blocks in pages.items():
        lines.append(f"## {PAGES[page]} — `/{'' if page == 'index' else page}`")
        lines.append("")
        lines.append("| № | Блок | Файл | Картинки |")
        lines.append("|---|------|------|----------|")
        if not STANDALONE:
            lines.append(f"| 00 | База (запасной вариант, см. шаг 1) | `out/{page}/00-base.html` | — |")
        for order, block in enumerate(blocks, start=1):
            uploads = ", ".join(block.uploads) if block.uploads else "—"
            lines.append(
                f"| {order:02d} | {block.title} | `out/{page}/{order:02d}-{block.slug}.html` | {uploads} |"
            )
        lines.append("")
    (OUT / "MANIFEST.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    # Консоль Windows по умолчанию не в UTF-8, и сборка падала на последней строке.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    global ASSETS_BASE, STANDALONE, STYLES_IN_BLOCKS
    parser = argparse.ArgumentParser(description="Сборка Vibe-блоков Тильды из статических страниц")
    parser.add_argument(
        "--assets-base",
        default="",
        help="Базовый URL картинок; без него в блоки попадают метки [[UPLOAD:…]]",
    )
    parser.add_argument(
        "--styles-in-blocks",
        action="store_true",
        help="стили в каждом блоке, рантайм и шрифты — из HEAD",
    )
    parser.add_argument(
        "--standalone",
        action="store_true",
        help="Вложить базовые стили и рантайм в каждый блок — если общий код до блоков не доходит",
    )
    arguments = parser.parse_args()
    ASSETS_BASE = arguments.assets_base
    if ASSETS_BASE and not ASSETS_BASE.endswith("/"):
        ASSETS_BASE += "/"
    STANDALONE = arguments.standalone
    STYLES_IN_BLOCKS = arguments.styles_in_blocks

    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    pages = {page: build_blocks(page) for page in PAGES}

    stylesheet = strip_comments((ROOT / "styles.css").read_text(encoding="utf-8"))
    stylesheet = stylesheet.replace("[src*=", "[data-asset*=")
    stylesheet = drop_subgrid(stylesheet)
    nodes = parse_css(stylesheet)
    # По умолчанию все стили едут в HEAD одним файлом — так браузер качает их
    # один раз и берёт из кеша на всех четырёх страницах. Раскладка по блокам
    # остаётся включаемой опцией: --standalone или --styles-in-blocks. Пустой
    # `pages` в assign_rules — не оптимизация, а гарантия: без него правила,
    # у которых в проекте ровно один хозяин, уезжают в per_block и там же
    # остаются молча отброшенными, если per_block никто не читает.
    head_nodes, per_block = assign_rules(nodes, pages if (STANDALONE or STYLES_IN_BLOCKS) else {})
    if STANDALONE or STYLES_IN_BLOCKS:
        for (page, slug), rules in per_block.items():
            for block in pages[page]:
                if block.slug == slug:
                    block.css = rules

    head = write_head(head_nodes)
    write_external_base(head_nodes)
    matched = matched_anywhere(nodes, pages) if (STANDALONE or STYLES_IN_BLOCKS) else set()
    catalogue: dict[str, list[tuple]] = {}
    for page, blocks in pages.items():
        entries: list[tuple] = []
        # В режиме со стилями в блоках база всё ещё нужна — ради рантайма.
        if not STANDALONE:
            entries.append(("00", "base", "База: стили и скрипты", write_base_block(page, head_nodes), []))
        for order, block in enumerate(blocks, start=1):
            document = write_block(
                page, order, block,
                nodes if (STANDALONE or STYLES_IN_BLOCKS) else head_nodes, matched)
            entries.append((f"{order:02d}", block.slug, block.title, document, block.uploads))
        catalogue[page] = entries
        # В автономном режиме база уже лежит внутри каждого блока, иначе отдаём её
        # в <head> превью — блок 00 в тело страницы тогда не дублируем.
        body = [entry[3] for entry in entries if STANDALONE or entry[0] != "00"]
        write_preview(page, "" if STANDALONE else head, body)

    write_copy_page(pages, catalogue)
    write_manifest(pages)

    total_blocks = sum(len(blocks) for blocks in pages.values())
    head_size = len(head)
    print(f"Блоков: {total_blocks}, страниц: {len(pages)}")
    print(f"_head.html: {head_size:,} символов")
    for page, blocks in pages.items():
        sizes = [
            (OUT / page / f"{order:02d}-{block.slug}.html").stat().st_size
            for order, block in enumerate(blocks, start=1)
        ]
        print(f"  {page}: {len(blocks)} блоков, максимальный {max(sizes):,} байт")
    if _uploads:
        print(f"Картинок на загрузку: {len(_uploads)} → out/_upload/")


if __name__ == "__main__":
    main()
