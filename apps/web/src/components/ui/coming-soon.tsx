import { ScreenBack } from './screen-back';
import { ScreenIcon } from './screen-icon';
import type { ComponentType } from 'react';

interface ComingSoonProps {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
}

/**
 * Заглушка режима, до которого ещё не дошли руки.
 *
 * ## Почему текст лежит на подложке, а не прямо на фоне
 *
 * Раньше лежал прямо на фоне, и это было безопасно, пока фон был ровным
 * и почти чёрным. С обоями (`ScreenBackground`) середина экрана —
 * единственная полоса, которую затемнение почти не трогает: там у кадра
 * сюжет. На «Турнирах» подпись легла ровно на подсвеченные листья венка
 * и стала едва читаемой.
 *
 * Общее правило после этой находки: текст, который лежит прямо на обоях
 * в средней полосе экрана, обязан иметь свою непрозрачную подложку.
 * Поднимать затемнение вместо этого нельзя — оно гасит все девять
 * картинок ради одного экрана.
 */
export function ComingSoon({ icon: Icon, title, description }: ComingSoonProps) {
  return (
    <div className="screen-fill px-6 text-center">
      {/* Сообщение висит по центру, а выход уходит вниз, как на всех
          остальных экранах. Раньше выход стоял сразу под сообщением, то
          есть в середине экрана: на «Турнирах» он попадал ровно на
          подсвеченный венок обоев и терял контраст — да и до середины
          экрана большому пальцу тянуться. */}
      <div className="my-auto flex flex-col items-center gap-3">
        <ScreenIcon icon={Icon} size="lg" />
        <div className="glass-edge flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface px-5 py-4">
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="max-w-xs text-sm text-text-secondary">{description}</p>
          <span className="mt-1 rounded-full bg-surface-hover px-3 py-1 text-xs font-medium text-text-secondary">
            В разработке
          </span>
        </div>
      </div>
      {/* Экран, на котором нечего делать, обязан хотя бы выпускать. Здесь
          этого не было: человек заходил в «Турниры», видел «в разработке»
          и оставался с ним наедине. */}
      <ScreenBack href="/" label="Назад на главную" />
    </div>
  );
}
