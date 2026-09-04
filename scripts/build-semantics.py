#!/usr/bin/env python3
"""
Собирает словарь смыслов — то, чем игра меряет «горячо/холодно».

Что это такое. Каждому слову сопоставлен вектор из 300 чисел, и слова,
близкие по смыслу, смотрят в одну сторону. Тогда «далеко» и «близко»
считаются арифметикой, а не списком заранее придуманных синонимов: игра
понимает любое слово, а не только те, что мы предусмотрели.

Откуда берутся числа. ConceptNet Numberbatch (лицензия CC BY-SA 4.0) —
векторы, построенные не только по совместной встречаемости в текстах, но и
по графу знаний ConceptNet. Для нашей задачи это важнее скорости: граф
знает, что Иерусалим — город, а овца — животное, и «Израиль» оказывается
рядом с «Иерусалимом» не потому, что слова часто стоят в одном абзаце.

Из чего состоит словарь:

  * **Леммы** — словарные формы, отсортированные по частоте. Ранг в этом
    списке и есть «расстояние», которое видит игрок.
  * **Формы** — всё, что человек может напечатать: «ковчега», «ковчегами».
    Каждая ведёт к своей лемме, поэтому падеж и число не мешают игре.
  * **Векторы** — по одному на лемму, в int8. Единичной длины, умноженные
    на 127: для сравнения направлений этой точности достаточно, а файл
    выходит вчетверо меньше, чем во float32.

Три источника слов, и каждый нужен:

  1. частотный список русского языка — чтобы игра понимала обычную речь;
  2. банк слов Alias — чтобы каждое загаданное слово точно было в словаре;
  3. текст Писания — чтобы библейская лексика не выпала как «редкая».

Запуск (нужен интернет и Python 3.11+):

    python3 scripts/build-semantics.py

Результат кладётся в apps/api/data/semantics-ru.bin и коммитится в
репозиторий: он маленький, а собирать его на каждой машине незачем.
"""
from __future__ import annotations

import gzip
import re
import struct
import sys
import unicodedata
from array import array
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_FILE = ROOT / 'apps/api/data/semantics-ru.bin'
CACHE_WORDS = ROOT / '.cache/numberbatch-ru.words'
CACHE_VECTORS = ROOT / '.cache/numberbatch-ru.f32'

SOURCE = (
    'https://conceptnet.s3.amazonaws.com/downloads/2019/numberbatch/'
    'numberbatch-19.08.txt.gz'
)

DIMENSIONS = 300

#: Сколько самых частых слов языка просмотреть. Дальше начинаются опечатки
#: и транслит, из которых словарь только шумит.
FREQUENCY_DEPTH = 200_000

#: Части речи, которые могут быть ответом в игре про слова. Предлоги,
#: союзы и частицы смысла не несут и в список «ближайших» попадать не
#: должны.
KEEP_POS = {'NOUN', 'ADJF', 'VERB', 'INFN', 'ADVB', 'PRTF'}

CYRILLIC = re.compile(r'^[а-яё]{2,24}$')

MAGIC = b'BSEM1'


def normalize(word: str) -> str:
    """Единый вид слова: нижний регистр и «е» вместо «ё».

    «Ё» в русском тексте живёт факультативно: одно и то же слово пишут и
    так и так, и различать их значило бы наказывать за типографику.
    """
    return unicodedata.normalize('NFC', word).lower().replace('ё', 'е')


def fetch_russian_vectors() -> dict[str, list[float]]:
    """Русский срез Numberbatch.

    Файл на три гигабайта отсортирован по идентификатору вида
    ``/c/<язык>/<слово>``, поэтому русский блок лежит подряд: как только он
    кончился, качать дальше незачем — и мы бросаем соединение.
    """
    if CACHE_WORDS.exists() and CACHE_VECTORS.exists():
        print(f'Беру русский срез из кэша: {CACHE_VECTORS}')
        words = CACHE_WORDS.read_text(encoding='utf-8').split('\n')
        blob = array('f')
        with CACHE_VECTORS.open('rb') as handle:
            blob.fromfile(handle, len(words) * DIMENSIONS)
        vectors = {
            word: blob[i * DIMENSIONS : (i + 1) * DIMENSIONS].tolist()
            for i, word in enumerate(words)
        }
        print(f'  слов: {len(vectors)}')
        return vectors

    import urllib.request

    print('Качаю ConceptNet Numberbatch и вынимаю русские слова.')
    print('Это несколько минут: русский блок лежит примерно на двух третях файла.')

    vectors: dict[str, list[float]] = {}
    seen_russian = False
    CACHE_WORDS.parent.mkdir(parents=True, exist_ok=True)

    with urllib.request.urlopen(SOURCE) as response:
        with gzip.GzipFile(fileobj=response) as stream:
            # Сравниваем байты, а не строки: до русского блока идут восемь
            # миллионов чужих строк, и декодировать каждую из них ради
            # проверки первых шести символов — это лишние минуты работы.
            for raw in stream:
                if not raw.startswith(b'/c/ru/'):
                    if seen_russian:
                        break
                    continue
                seen_russian = True
                term, _, rest = raw[6:].decode('utf-8', 'replace').partition(' ')
                if not CYRILLIC.match(term):
                    continue
                numbers = rest.split()
                if len(numbers) < DIMENSIONS:
                    continue
                vectors[normalize(term)] = [float(x) for x in numbers[:DIMENSIONS]]
                if len(vectors) % 50_000 == 0:
                    print(f'  русских слов: {len(vectors)}')

    print(f'  русских слов: {len(vectors)}')
    CACHE_WORDS.write_text('\n'.join(vectors), encoding='utf-8')
    with CACHE_VECTORS.open('wb') as handle:
        for vector in vectors.values():
            array('f', vector).tofile(handle)
    print(f'Срез сохранён в {CACHE_VECTORS} — повторная сборка пойдёт быстрее.')
    return vectors


def bank_words() -> set[str]:
    """Слова из банка Alias — те, что игра может загадать.

    Читаем прямо из сида: держать их вторым списком значит однажды забыть
    его обновить.
    """
    source = (ROOT / 'apps/api/prisma/seed-alias.ts').read_text(encoding='utf-8')
    words: set[str] = set()
    for match in re.finditer(r"word: '([^']+)'", source):
        for part in match.group(1).split():
            cleaned = normalize(part.strip('«»,.!?-'))
            if CYRILLIC.match(cleaned):
                words.add(cleaned)
    return words


def scripture_words() -> set[str]:
    """Слова Писания из локального текста, если он выгружен.

    Библейская лексика по общерусской частотности проходит плохо:
    «первосвященник» и «скиния» редки в газетах и часты у нас. Файла может
    не быть — тогда просто обходимся без этого источника.
    """
    path = ROOT / 'apps/api/prisma/rst.json'
    if not path.exists():
        return set()
    import json

    words: set[str] = set()
    data = json.loads(path.read_text(encoding='utf-8'))
    for book in data.get('Books', []):
        for chapter in book.get('Chapters', []):
            for verse in chapter.get('Verses', []):
                for raw in re.split(r'[^А-Яа-яЁё]+', verse.get('Text', '')):
                    cleaned = normalize(raw)
                    if CYRILLIC.match(cleaned):
                        words.add(cleaned)
    return words


def main() -> int:
    try:
        import pymorphy3
        from wordfreq import top_n_list, zipf_frequency
    except ImportError:
        print(
            'Нужны пакеты: pip install wordfreq pymorphy3 pymorphy3-dicts-ru',
            file=sys.stderr,
        )
        return 1

    vectors = fetch_russian_vectors()
    morph = pymorphy3.MorphAnalyzer()

    # Слово → его лемма. Заодно собираем сами леммы: ключ словаря игры.
    forms: dict[str, str] = {}
    lemmas: dict[str, float] = {}

    def add(surface: str, *, require_pos: bool) -> None:
        surface = normalize(surface)
        if not CYRILLIC.match(surface):
            return
        parsed = morph.parse(surface)[0]
        if require_pos and parsed.tag.POS not in KEEP_POS:
            return
        lemma = normalize(parsed.normal_form)
        if lemma not in vectors:
            return
        forms[surface] = lemma
        if lemma not in lemmas:
            # Частота леммы задаёт порядок словаря, а значит и то, какое
            # число игрок увидит. Редкое слово не должно оказаться на
            # десятом месте только потому, что оно похоже.
            lemmas[lemma] = zipf_frequency(lemma, 'ru')

    print('Разбираю частотный список языка…')
    for word in top_n_list('ru', FREQUENCY_DEPTH):
        add(word, require_pos=True)
    print(f'  лемм: {len(lemmas)}')

    # Слова игры и Писания добавляем без фильтра по части речи: имена
    # собственные pymorphy размечает как угодно, а выкинуть «Авраама» из
    # игры про Библию нельзя.
    print('Добавляю слова Alias и Писания…')
    for word in bank_words() | scripture_words():
        add(word, require_pos=False)
    print(f'  лемм: {len(lemmas)}, форм: {len(forms)}')

    # Порядок словаря — по убыванию частоты. Именно он превращается в
    # «расстояние», которое видит игрок.
    order = sorted(lemmas, key=lambda w: (-lemmas[w], w))
    position = {word: i for i, word in enumerate(order)}

    print(f'Записываю {OUT_FILE}…')
    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)

    extra_forms = [(f, l) for f, l in sorted(forms.items()) if f not in position]

    with OUT_FILE.open('wb') as out:
        out.write(MAGIC)
        out.write(struct.pack('<III', DIMENSIONS, len(order), len(extra_forms)))
        for word in order:
            encoded = word.encode('utf-8')
            out.write(bytes([len(encoded)]))
            out.write(encoded)
        for form, lemma in extra_forms:
            encoded = form.encode('utf-8')
            out.write(bytes([len(encoded)]))
            out.write(encoded)
            out.write(struct.pack('<I', position[lemma]))
        for word in order:
            vector = vectors[word]
            length = sum(x * x for x in vector) ** 0.5 or 1.0
            out.write(
                bytes(
                    (max(-127, min(127, round(x / length * 127))) & 0xFF)
                    for x in vector
                )
            )

    size = OUT_FILE.stat().st_size
    print(f'Готово: {size / 1e6:.1f} МБ, лемм {len(order)}, форм {len(extra_forms)}.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
