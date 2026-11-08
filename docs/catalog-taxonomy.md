# 3DiViDruk — ієрархія каталогу (08.11.2026)

## Джерело правди

- Визначення назв категорій і підкатегорій: `data/taxonomy.json`.
- Прив'язка кожного товару: поля `category`, `subcategory`, `categoryLabel`, `subcategoryLabel` у `data/catalog.json`.
- `tools/build.py` відновлює прив'язки після повторного імпорту з Prom.ua; незнайомі товари освітлення або декору не розподіляються навмання, а вимагають перегляду.
- Фронтенд споживає `taxonomy` разом із каталогом (GitHub Pages) або через `GET /api/v1/catalog` (окремий backend).
- Сумки MaGelle на паузі згідно з `config/storefront-visibility.json`; дані всіх 5 товарів залишаються в каталозі та адмінці.

## Ієрархія (початковий розподіл)

| Група | Код | Товарів |
|---|---|---:|
| Освітлення / Настільні лампи | `lighting / table-lamps` | 33 |
| Освітлення / Підвісні світильники | `lighting / pendant-lamps` | 30 |
| Вази | `vases` | 16 |
| Кашпо | `planters` | 69 |
| Декор / Декоративні чаші та органайзери | `decor / bowls-organizers` | 15 |
| Декор / Статуетки та фігурки | `decor / figurines` | 6 |
| Декор / Підставки для пахощів | `decor / incense-holders` | 5 |
| Декор / Настінний декор | `decor / wall-art` | 4 |
| Сумки MaGelle — пауза | `bags` | 5 (приховано) |

**Усього:** 178 видимих товарів та 5 прихованих, 183 записи. Числа — знімок на момент класифікації, не ліміти для наступних імпортів.

## Приклади прямих посилань

- [Настільні лампи](https://ladima75-source.github.io/3dividruk/catalog.html?category=lighting&subcategory=table-lamps)
- [Підвісні світильники](https://ladima75-source.github.io/3dividruk/catalog.html?category=lighting&subcategory=pendant-lamps)
- [Декоративні чаші та органайзери](https://ladima75-source.github.io/3dividruk/catalog.html?category=decor&subcategory=bowls-organizers)
- [Статуетки та фігурки](https://ladima75-source.github.io/3dividruk/catalog.html?category=decor&subcategory=figurines)
- [Підставки для пахощів](https://ladima75-source.github.io/3dividruk/catalog.html?category=decor&subcategory=incense-holders)
- [Настінний декор](https://ladima75-source.github.io/3dividruk/catalog.html?category=decor&subcategory=wall-art)

## Відмінність виробів

- Чаші, декоративні тарілки та органайзери — функціональний декор, проте не слід автоматично заявляти, що вони придатні для харчових продуктів.
- Фігурки Voronoi — скульптурні об'єкти й статуетки, не тримачі.
- Підставки для пахощів — окреме функціональне призначення; не об'єднувати з органайзерами.
- Настінні фігури — окремий формат декору, не настільні статуетки.
- Тип світильника визначається настільним або підвісним монтажем, а не схожістю назв моделей.

## Захист при майбутньому оновленні

Після `python tools/import_prom.py` запускати `python tools/build.py` та `python tools/validate.py`. Нові типи виробів спочатку перевіряти на потребу розширення `taxonomy.json` і функції `subcategory()` у builder. Ніколи не змінювати стабільний `commerceSku` чи ID товару лише через переїзд до підкатегорії. Комерційні інтеграції та DNS до запуску не чіпати.
