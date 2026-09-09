import Link from 'next/link';
import { FriendsIcon, PlayIcon, TournamentIcon } from '@/components/icons/nav-icons';
import { Card } from '@/components/ui/card';
import { ModeIcon } from '@/components/ui/mode-icon';
import { modeTheme } from '@/lib/mode-theme';

export default function PlayModePage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pt-6">
      <div>
        <h1 className="text-xl font-bold">Играть</h1>
        <p className="text-sm text-text-secondary">Выберите режим игры</p>
      </div>

      <Link href="/play/solo">
        <Card className="flex-row items-center gap-4">
          <ModeIcon accent={modeTheme('/play/solo').accent}>
            <PlayIcon className="h-6 w-6" />
          </ModeIcon>
          <div>
            <p className="font-semibold">Одиночная игра</p>
            <p className="text-sm text-text-secondary">Проверьте свои знания без соперника</p>
          </div>
        </Card>
      </Link>

      <Link href="/play/duel">
        <Card className="flex-row items-center gap-4">
          <ModeIcon accent={modeTheme('/play/duel').accent}>
            <FriendsIcon className="h-6 w-6" />
          </ModeIcon>
          <div>
            <p className="font-semibold">Дуэль</p>
            <p className="text-sm text-text-secondary">
              Один на один: найдите соперника или позовите любого игрока
            </p>
          </div>
        </Card>
      </Link>

      {/* Вторая дуэль, с другой механикой: не вопросы с вариантами, а
          гонка за одним словом. Стоит рядом с первой, потому что выбор
          между ними — это выбор настроения, а не режима. */}
      <Link href="/hot-cold/duel">
        <Card className="flex-row items-center gap-4">
          {/* Было эмодзи: среди линейных иконок оно смотрелось наклейкой
              с чужого экрана и меняло вид на каждой платформе. */}
          <ModeIcon accent={modeTheme('/hot-cold').accent}>
            <FlameIcon className="h-6 w-6" />
          </ModeIcon>
          <div>
            <p className="font-semibold">Горячо-холодно, дуэль</p>
            <p className="text-sm text-text-secondary">
              Одно слово на двоих. Видно, насколько близко соперник, но не его слова
            </p>
          </div>
        </Card>
      </Link>

      {/* Единственный режим, где играют не через сеть, а вокруг одного
          телефона — поэтому он и стоит отдельно от дуэлей и комнат. */}
      <Link href="/play/alias">
        <Card className="flex-row items-center gap-4">
          <ModeIcon accent={modeTheme('/play/alias').accent}>
            <SpeakIcon className="h-6 w-6" />
          </ModeIcon>
          <div>
            <p className="font-semibold">
              Alias <span className="text-xs font-medium text-primary">компанией</span>
            </p>
            <p className="text-sm text-text-secondary">
              Объясняйте слова на время. Один телефон, две команды, рядом за столом
            </p>
          </div>
        </Card>
      </Link>

      {/* Единственный режим, где знание Библии ни при чём: чистый риск за
          столом. Стоит после учебных намеренно — он для того вечера, когда
          учиться не хочется, а играть с человеком хочется. */}
      <Link href="/play/dice">
        <Card className="flex-row items-center gap-4">
          <ModeIcon accent={modeTheme('/play/dice').accent}>
            <DiceIcon className="h-6 w-6" />
          </ModeIcon>
          <div>
            <p className="font-semibold">
              Кости <span className="text-xs font-medium text-primary">один на один</span>
            </p>
            <p className="text-sm text-text-secondary">
              Шесть костей на двоих. Забрать очки или рискнуть и бросить ещё
            </p>
          </div>
        </Card>
      </Link>

      <Link href="/play/room">
        <Card className="flex-row items-center gap-4">
          <ModeIcon accent={modeTheme('/play/room').accent}>
            <TournamentIcon className="h-6 w-6" />
          </ModeIcon>
          <div>
            <p className="font-semibold">Комната</p>
            <p className="text-sm text-text-secondary">
              До 20 игроков одновременно, по коду или в открытом списке
            </p>
          </div>
        </Card>
      </Link>
    </div>
  );
}

/**
 * Пламя и говорящий — иконки под «Горячо-холодно» и Alias.
 *
 * Раньше на их месте стояли эмодзи. Среди линейных иконок приложения они
 * смотрелись наклейками с чужого экрана, а вдобавок рисуются на каждой
 * платформе по-своему: то плоско, то объёмно, то другим цветом — и
 * подобрать под них цвет режима нельзя в принципе.
 */
function FlameIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      {/* Простой силуэт: острый верх, наплыв слева, широкое основание.
          Первый вариант был подробнее — с перегибом и вторым язычком
          внутри — и на двадцати четырёх пикселях превращался в каплю с
          точкой. Мелкая иконка держится силуэтом, а не деталями. */}
      <path
        d="M12 2.5c3.2 3.6 6 5.8 6 9.6a6 6 0 0 1-12 0c0-2.1 1-3.6 2.2-4.8.2 1.1.8 1.9 1.7 2.3.4-2.8.9-4.9 2.1-7.1z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Две кости — иконка режима. Точки настоящие: единица и пятёрка, самые
 * узнаваемые грани из тех, что вообще дают очки. */
function DiceIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="2.5" y="7" width="11" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="8" cy="12.5" r="1.4" fill="currentColor" />
      <rect
        x="11.5"
        y="3.5"
        width="10"
        height="10"
        rx="2.6"
        stroke="currentColor"
        strokeWidth="1.8"
        fill="none"
      />
      <circle cx="14.4" cy="6.4" r="1" fill="currentColor" />
      <circle cx="18.6" cy="6.4" r="1" fill="currentColor" />
      <circle cx="16.5" cy="8.5" r="1" fill="currentColor" />
      <circle cx="14.4" cy="10.6" r="1" fill="currentColor" />
      <circle cx="18.6" cy="10.6" r="1" fill="currentColor" />
    </svg>
  );
}

function SpeakIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M4 5h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-5 4V5z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M19.5 8c1 1.2 1 4.8 0 6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}
