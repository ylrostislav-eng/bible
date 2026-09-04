import Link from 'next/link';
import { FriendsIcon, PlayIcon, TournamentIcon } from '@/components/icons/nav-icons';
import { Card } from '@/components/ui/card';

export default function PlayModePage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pt-6">
      <div>
        <h1 className="text-xl font-bold">Играть</h1>
        <p className="text-sm text-text-secondary">Выберите режим игры</p>
      </div>

      <Link href="/play/solo">
        <Card className="flex-row items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-hover">
            <PlayIcon className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="font-semibold">Одиночная игра</p>
            <p className="text-sm text-text-secondary">Проверьте свои знания без соперника</p>
          </div>
        </Card>
      </Link>

      <Link href="/play/duel">
        <Card className="flex-row items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-hover">
            <FriendsIcon className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="font-semibold">Дуэль</p>
            <p className="text-sm text-text-secondary">Сразитесь с другом по коду приглашения</p>
          </div>
        </Card>
      </Link>

      {/* Вторая дуэль, с другой механикой: не вопросы с вариантами, а
          гонка за одним словом. Стоит рядом с первой, потому что выбор
          между ними — это выбор настроения, а не режима. */}
      <Link href="/hot-cold/duel">
        <Card className="flex-row items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-hover">
            <span className="text-xl" aria-hidden>
              🔥
            </span>
          </div>
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
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-hover">
            <span className="text-xl" aria-hidden>
              🗣
            </span>
          </div>
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

      <Link href="/play/room">
        <Card className="flex-row items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-hover">
            <TournamentIcon className="h-6 w-6 text-primary" />
          </div>
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
