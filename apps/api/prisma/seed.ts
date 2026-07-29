import { PrismaClient } from '@prisma/client';
import type { Difficulty, Testament } from '@prisma/client';

const prisma = new PrismaClient();

interface SeedQuestion {
  text: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation: string;
  testament: Testament;
  book: string;
  chapter?: number;
  verses?: string;
  topic: string;
  difficulty: Difficulty;
}

const questions: SeedQuestion[] = [
  // --- Ветхий Завет ---
  {
    text: 'Сколько дней Бог творил мир, прежде чем почить в седьмой день?',
    options: ['3', '6', '7', '40'],
    correctIndex: 1,
    explanation:
      'Бог творил мир шесть дней, а в седьмой день почил от всех дел Своих (Быт. 2:2).',
    testament: 'OLD',
    book: 'Бытие',
    chapter: 1,
    verses: '1:1–2:2',
    topic: 'Сотворение мира',
    difficulty: 'EASY',
  },
  {
    text: 'Как звали первого человека, сотворённого Богом?',
    options: ['Ной', 'Адам', 'Авраам', 'Каин'],
    correctIndex: 1,
    explanation:
      'Бог сотворил из праха земного человека по имени Адам (Быт. 2:7).',
    testament: 'OLD',
    book: 'Бытие',
    chapter: 2,
    verses: '2:7',
    topic: 'Сотворение мира',
    difficulty: 'EASY',
  },
  {
    text: 'Как звали жену Адама?',
    options: ['Сарра', 'Рахиль', 'Ева', 'Ревекка'],
    correctIndex: 2,
    explanation:
      'Бог сотворил Еву из ребра Адама, и она стала матерью всех живущих (Быт. 3:20).',
    testament: 'OLD',
    book: 'Бытие',
    chapter: 3,
    verses: '3:20',
    topic: 'Сотворение мира',
    difficulty: 'EASY',
  },
  {
    text: 'Сколько дней и ночей длился дождь во время всемирного потопа?',
    options: ['7', '40', '100', '150'],
    correctIndex: 1,
    explanation: 'Дождь лился на землю сорок дней и сорок ночей (Быт. 7:12).',
    testament: 'OLD',
    book: 'Бытие',
    chapter: 7,
    verses: '7:12',
    topic: 'Потоп',
    difficulty: 'EASY',
  },
  {
    text: 'На какой горе остановился ковчег Ноя после потопа?',
    options: ['Синай', 'Арарат', 'Кармил', 'Сион'],
    correctIndex: 1,
    explanation: 'Ковчег остановился на горах Араратских (Быт. 8:4).',
    testament: 'OLD',
    book: 'Бытие',
    chapter: 8,
    verses: '8:4',
    topic: 'Потоп',
    difficulty: 'MEDIUM',
  },
  {
    text: 'Какое имя дал Бог Авраму в знак завета, сделав его отцом множества народов?',
    options: ['Израиль', 'Авраам', 'Исаак', 'Иаков'],
    correctIndex: 1,
    explanation:
      'Бог сказал: «и не будешь ты больше называться Аврамом, но будет тебе имя: Авраам, ибо Я сделаю тебя отцом множества народов» (Быт. 17:5).',
    testament: 'OLD',
    book: 'Бытие',
    chapter: 17,
    verses: '17:5',
    topic: 'Патриархи',
    difficulty: 'MEDIUM',
  },
  {
    text: 'Сколько сыновей было у патриарха Иакова?',
    options: ['7', '10', '12', '13'],
    correctIndex: 2,
    explanation:
      'У Иакова было двенадцать сыновей, ставших родоначальниками колен Израилевых.',
    testament: 'OLD',
    book: 'Бытие',
    chapter: 35,
    verses: '35:22–26',
    topic: 'Патриархи',
    difficulty: 'EASY',
  },
  {
    text: 'В какую страну был продан Иосиф работорговцами?',
    options: ['Египет', 'Вавилон', 'Ассирия', 'Мадиам'],
    correctIndex: 0,
    explanation: 'Братья продали Иосифа купцам, шедшим в Египет (Быт. 37:28).',
    testament: 'OLD',
    book: 'Бытие',
    chapter: 37,
    verses: '37:28',
    topic: 'Иосиф',
    difficulty: 'EASY',
  },
  {
    text: 'Кто вывел народ израильский из египетского рабства?',
    options: ['Аарон', 'Иисус Навин', 'Моисей', 'Самуил'],
    correctIndex: 2,
    explanation: 'Бог призвал Моисея вывести Свой народ из Египта (Исх. 3).',
    testament: 'OLD',
    book: 'Исход',
    chapter: 3,
    topic: 'Исход',
    difficulty: 'EASY',
  },
  {
    text: 'Сколько казней навёл Бог на Египет перед исходом израильтян?',
    options: ['7', '9', '10', '12'],
    correctIndex: 2,
    explanation:
      'Всего было десять казней египетских, последняя — смерть первенцев.',
    testament: 'OLD',
    book: 'Исход',
    chapter: 7,
    verses: '7–12',
    topic: 'Исход',
    difficulty: 'EASY',
  },
  {
    text: 'Сколько заповедей получил Моисей на горе Синай?',
    options: ['7', '10', '12', '613'],
    correctIndex: 1,
    explanation: 'Бог дал Моисею десять заповедей на скрижалях (Исх. 20).',
    testament: 'OLD',
    book: 'Исход',
    chapter: 20,
    topic: 'Исход',
    difficulty: 'EASY',
  },
  {
    text: 'Сколько лет израильтяне странствовали по пустыне, прежде чем войти в землю обетованную?',
    options: ['10', '25', '40', '70'],
    correctIndex: 2,
    explanation:
      'Из-за неверия израильтяне странствовали по пустыне сорок лет (Чис. 14:33).',
    testament: 'OLD',
    book: 'Числа',
    chapter: 14,
    verses: '14:33',
    topic: 'Исход',
    difficulty: 'MEDIUM',
  },
  {
    text: 'Кто возглавил израильтян после смерти Моисея?',
    options: ['Иисус Навин', 'Халев', 'Гедеон', 'Аарон'],
    correctIndex: 0,
    explanation:
      'Господь поставил Иисуса Навина преемником Моисея (Нав. 1:1–2).',
    testament: 'OLD',
    book: 'Иисус Навин',
    chapter: 1,
    topic: 'Завоевание земли обетованной',
    difficulty: 'MEDIUM',
  },
  {
    text: 'Стены какого города пали после того, как израильтяне семь раз обошли его с трубами?',
    options: ['Иерусалим', 'Гай', 'Иерихон', 'Вефиль'],
    correctIndex: 2,
    explanation:
      'После семикратного обхода с трубным гласом стены Иерихона рухнули (Нав. 6:19).',
    testament: 'OLD',
    book: 'Иисус Навин',
    chapter: 6,
    topic: 'Завоевание земли обетованной',
    difficulty: 'EASY',
  },
  {
    text: 'Какой судья Израиля потерял силу, лишившись волос из-за Далиды?',
    options: ['Гедеон', 'Аод', 'Иеффай', 'Самсон'],
    correctIndex: 3,
    explanation:
      'Сила Самсона была в его волосах; Далида остригла его и предала филистимлянам (Суд. 16).',
    testament: 'OLD',
    book: 'Книга Судей',
    chapter: 16,
    topic: 'Судьи',
    difficulty: 'EASY',
  },
  {
    text: 'Кто сказал свекрови: «Народ твой будет моим народом, и твой Бог — моим Богом»?',
    options: ['Орфа', 'Руфь', 'Далида', 'Юдифь'],
    correctIndex: 1,
    explanation:
      'Эти слова моавитянка Руфь сказала своей свекрови Ноемини (Руфь 1:16).',
    testament: 'OLD',
    book: 'Руфь',
    chapter: 1,
    verses: '1:16',
    topic: 'Судьи',
    difficulty: 'MEDIUM',
  },
  {
    text: 'Какого великана-филистимлянина победил юный Давид с помощью пращи?',
    options: ['Ог', 'Голиаф', 'Авессалом', 'Саул'],
    correctIndex: 1,
    explanation:
      'Давид поразил филистимского великана Голиафа камнем из пращи (1 Цар. 17:49–50).',
    testament: 'OLD',
    book: '1-я Царств',
    chapter: 17,
    topic: 'Царь Давид',
    difficulty: 'EASY',
  },
  {
    text: 'Кто помазал Давида на царство над Израилем?',
    options: ['Илий', 'Нафан', 'Самуил', 'Гад'],
    correctIndex: 2,
    explanation:
      'Пророк Самуил помазал Давида елеем по повелению Господа (1 Цар. 16:13).',
    testament: 'OLD',
    book: '1-я Царств',
    chapter: 16,
    topic: 'Царь Давид',
    difficulty: 'MEDIUM',
  },
  {
    text: 'Какой царь Израиля прославился мудростью и построил первый Иерусалимский храм?',
    options: ['Саул', 'Давид', 'Соломон', 'Ровоам'],
    correctIndex: 2,
    explanation:
      'Царь Соломон, сын Давида, построил храм Господу в Иерусалиме (3 Цар. 6).',
    testament: 'OLD',
    book: '3-я Царств',
    chapter: 6,
    topic: 'Цари Израиля',
    difficulty: 'EASY',
  },
  {
    text: 'Сколько друзей пришли утешать многострадального Иова?',
    options: ['2', '3', '4', '5'],
    correctIndex: 1,
    explanation:
      'К Иову пришли трое друзей: Елифаз, Вилдад и Софар (Иов 2:11).',
    testament: 'OLD',
    book: 'Иов',
    chapter: 2,
    verses: '2:11',
    topic: 'Книга Иова',
    difficulty: 'MEDIUM',
  },
  {
    text: 'Какой пророк был брошен в львиный ров за молитву Богу?',
    options: ['Иеремия', 'Иезекииль', 'Даниил', 'Илия'],
    correctIndex: 2,
    explanation:
      'За верность молитве Богу Даниил был брошен в ров со львами, но не пострадал (Дан. 6).',
    testament: 'OLD',
    book: 'Даниил',
    chapter: 6,
    topic: 'Пророки',
    difficulty: 'EASY',
  },
  {
    text: 'Какого пророка Бог послал в Ниневию, но тот сначала бежал на корабле в другую сторону?',
    options: ['Осия', 'Амос', 'Иона', 'Наум'],
    correctIndex: 2,
    explanation:
      'Иона получил повеление идти в Ниневию, но сел на корабль, отплывающий в Фарсис (Иона 1:1–3).',
    testament: 'OLD',
    book: 'Иона',
    chapter: 1,
    topic: 'Пророки',
    difficulty: 'EASY',
  },
  {
    text: 'Кто был проглочен большой рыбой и провёл в её чреве три дня и три ночи?',
    options: ['Ной', 'Илия', 'Елисей', 'Иона'],
    correctIndex: 3,
    explanation:
      'Иона был во чреве рыбы три дня и три ночи, моля Бога о спасении (Иона 1:17–2:1).',
    testament: 'OLD',
    book: 'Иона',
    chapter: 1,
    verses: '1:17',
    topic: 'Пророки',
    difficulty: 'EASY',
  },
  {
    text: 'Со жрецами какого языческого бога состязался пророк Илия на горе Кармил?',
    options: ['Дагон', 'Молох', 'Ваал', 'Астарта'],
    correctIndex: 2,
    explanation:
      'Илия состязался с четырьмястами пятьюдесятью пророками Ваала (3 Цар. 18:19–40).',
    testament: 'OLD',
    book: '3-я Царств',
    chapter: 18,
    topic: 'Пророки',
    difficulty: 'HARD',
  },
  // --- Новый Завет ---
  {
    text: 'В каком городе родился Иисус Христос?',
    options: ['Назарет', 'Иерусалим', 'Вифлеем', 'Капернаум'],
    correctIndex: 2,
    explanation:
      'Иисус родился в Вифлееме Иудейском, как было предсказано пророками (Лк. 2:4–7).',
    testament: 'NEW',
    book: 'Евангелие от Луки',
    chapter: 2,
    topic: 'Рождество Христово',
    difficulty: 'EASY',
  },
  {
    text: 'Кто крестил Иисуса в водах реки Иордан?',
    options: [
      'Апостол Пётр',
      'Иоанн Креститель',
      'Андрей Первозванный',
      'Пророк Илия',
    ],
    correctIndex: 1,
    explanation: 'Иоанн Креститель крестил Иисуса в Иордане (Мф. 3:13–17).',
    testament: 'NEW',
    book: 'Евангелие от Матфея',
    chapter: 3,
    topic: 'Служение Иисуса',
    difficulty: 'EASY',
  },
  {
    text: 'Сколько апостолов избрал Иисус Христос?',
    options: ['7', '10', '12', '70'],
    correctIndex: 2,
    explanation:
      'Иисус избрал двенадцать апостолов из числа Своих учеников (Мф. 10:1–4).',
    testament: 'NEW',
    book: 'Евангелие от Матфея',
    chapter: 10,
    topic: 'Апостолы',
    difficulty: 'EASY',
  },
  {
    text: 'Сколько дней Иисус постился в пустыне перед искушением от дьявола?',
    options: ['7', '30', '40', '50'],
    correctIndex: 2,
    explanation: 'Иисус постился сорок дней и сорок ночей в пустыне (Мф. 4:2).',
    testament: 'NEW',
    book: 'Евангелие от Матфея',
    chapter: 4,
    verses: '4:2',
    topic: 'Служение Иисуса',
    difficulty: 'EASY',
  },
  {
    text: 'Сколькими хлебами и рыбами Иисус накормил пять тысяч человек?',
    options: [
      '5 хлебами и 2 рыбами',
      '7 хлебами и 3 рыбами',
      '2 хлебами и 5 рыбами',
      '12 хлебами и 2 рыбами',
    ],
    correctIndex: 0,
    explanation:
      'Иисус благословил пять хлебов и две рыбы, и все насытились (Мф. 14:17–21).',
    testament: 'NEW',
    book: 'Евангелие от Матфея',
    chapter: 14,
    topic: 'Чудеса Иисуса',
    difficulty: 'MEDIUM',
  },
  {
    text: 'Кто предал Иисуса за тридцать сребреников?',
    options: ['Пётр', 'Фома', 'Иуда Искариот', 'Варавва'],
    correctIndex: 2,
    explanation:
      'Иуда Искариот согласился предать Иисуса за тридцать сребреников (Мф. 26:14–16).',
    testament: 'NEW',
    book: 'Евангелие от Матфея',
    chapter: 26,
    topic: 'Страсти Христовы',
    difficulty: 'EASY',
  },
  {
    text: 'Кто трижды отрёкся от Иисуса в ночь перед распятием?',
    options: ['Иоанн', 'Пётр', 'Иаков', 'Андрей'],
    correctIndex: 1,
    explanation:
      'Апостол Пётр трижды отрёкся от Христа, прежде чем пропел петух (Мф. 26:69–75).',
    testament: 'NEW',
    book: 'Евангелие от Матфея',
    chapter: 26,
    topic: 'Страсти Христовы',
    difficulty: 'EASY',
  },
  {
    text: 'На каком холме был распят Иисус Христос?',
    options: ['Елеонская гора', 'Синай', 'Голгофа', 'Фавор'],
    correctIndex: 2,
    explanation:
      'Иисус был распят на месте, называемом Голгофа (Ин. 19:17–18).',
    testament: 'NEW',
    book: 'Евангелие от Иоанна',
    chapter: 19,
    topic: 'Страсти Христовы',
    difficulty: 'EASY',
  },
  {
    text: 'На какой день после смерти воскрес Иисус Христос?',
    options: ['На второй', 'На третий', 'На седьмой', 'На сороковой'],
    correctIndex: 1,
    explanation:
      'Согласно Писанию, Христос воскрес в третий день (1 Кор. 15:4).',
    testament: 'NEW',
    book: '1-е Коринфянам',
    chapter: 15,
    verses: '15:4',
    topic: 'Воскресение',
    difficulty: 'MEDIUM',
  },
  {
    text: 'Кто первым увидел воскресшего Христа у пустого гроба по Евангелию от Иоанна?',
    options: ['Апостол Пётр', 'Апостол Иоанн', 'Мария Магдалина', 'Фома'],
    correctIndex: 2,
    explanation:
      'Мария Магдалина первой увидела воскресшего Господа у гроба (Ин. 20:14–16).',
    testament: 'NEW',
    book: 'Евангелие от Иоанна',
    chapter: 20,
    topic: 'Воскресение',
    difficulty: 'MEDIUM',
  },
  {
    text: 'Какой апостол усомнился в воскресении Христа, пока не увидел ран от гвоздей?',
    options: ['Филипп', 'Варфоломей', 'Фома', 'Матфей'],
    correctIndex: 2,
    explanation:
      'Апостол Фома поверил лишь тогда, когда своими глазами увидел раны Христа (Ин. 20:24–29).',
    testament: 'NEW',
    book: 'Евангелие от Иоанна',
    chapter: 20,
    topic: 'Воскресение',
    difficulty: 'EASY',
  },
  {
    text: 'В день какого праздника Святой Дух сошёл на апостолов в виде огненных языков?',
    options: ['Пасха', 'Пятидесятница', 'Преображение', 'Праздник Кущей'],
    correctIndex: 1,
    explanation:
      'Святой Дух сошёл на апостолов в день Пятидесятницы (Деян. 2:1–4).',
    testament: 'NEW',
    book: 'Деяния',
    chapter: 2,
    topic: 'Церковь',
    difficulty: 'MEDIUM',
  },
  {
    text: 'Кто стал первым христианским мучеником, побитым камнями?',
    options: ['Иаков', 'Стефан', 'Варнава', 'Тимофей'],
    correctIndex: 1,
    explanation:
      'Диакон Стефан был побит камнями за проповедь об Иисусе Христе (Деян. 7:57–60).',
    testament: 'NEW',
    book: 'Деяния',
    chapter: 7,
    topic: 'Церковь',
    difficulty: 'HARD',
  },
  {
    text: 'Как звали апостола язычников, чудесно обращённого ко Христу по пути в Дамаск?',
    options: ['Варнава', 'Сила', 'Савл (Павел)', 'Тит'],
    correctIndex: 2,
    explanation:
      'Гонитель христиан Савл был обращён явлением Христа на пути в Дамаск и стал апостолом Павлом (Деян. 9:1–19).',
    testament: 'NEW',
    book: 'Деяния',
    chapter: 9,
    topic: 'Апостол Павел',
    difficulty: 'EASY',
  },
  {
    text: 'На каком острове апостол Павел потерпел кораблекрушение по пути в Рим?',
    options: ['Крит', 'Мальта', 'Кипр', 'Родос'],
    correctIndex: 1,
    explanation:
      'Корабль с Павлом потерпел крушение у острова Мальта (Деян. 28:1).',
    testament: 'NEW',
    book: 'Деяния',
    chapter: 28,
    verses: '28:1',
    topic: 'Апостол Павел',
    difficulty: 'HARD',
  },
  {
    text: 'Какая книга Нового Завета последняя и содержит пророческие видения апостола Иоанна?',
    options: ['Деяния', 'Послание Иуды', 'Откровение', 'Евангелие от Иоанна'],
    correctIndex: 2,
    explanation:
      'Книга Откровение (Апокалипсис) завершает Новый Завет видениями апостола Иоанна.',
    testament: 'NEW',
    book: 'Откровение',
    chapter: 1,
    topic: 'Откровение',
    difficulty: 'MEDIUM',
  },
];

async function main() {
  await prisma.question.deleteMany({});
  await prisma.question.createMany({
    data: questions.map((q) => ({ ...q, options: q.options })),
  });
  console.log(`Seeded ${questions.length} questions.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
