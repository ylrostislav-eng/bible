'use client';

import type { DiceValue } from '@bible-arena/shared';
import { useEffect, useRef, useState } from 'react';
import { reportClientError } from '@/lib/telemetry';
import { DiceScene, type SceneSide } from './scene';
import type { OpponentAppearance } from './tavern';

/**
 * Обёртка сцены для React.
 *
 * Сцена живёт в `ref`, а не в состоянии, и React её не перерисовывает:
 * пересоздание WebGL-контекста на каждый ответ сервера — это чёрный
 * кадр раз в полторы секунды опроса. Свойства не «отдаются в рендер», а
 * доталкиваются в сцену эффектами, и цикл отрисовки идёт своим ходом.
 */

export interface DiceSceneProps {
  dice: DiceValue[];
  /** Меняется на каждый новый бросок — по нему запускается анимация. */
  rollKey: string;
  /** Выбрано, но ещё не подтверждено. */
  picked: number[];
  /** Уже отложено сервером. */
  locked: number[];
  /** Что даёт очки: подсказка, а не выбор за игрока. */
  hint: number[];
  interactive: boolean;
  side: SceneSide;
  rivalThinking: boolean;
  opponentAppearance: OpponentAppearance;
  telemetry?: {
    matchId: string;
    version: number;
    phase: string;
  };
  onPick: (index: number) => void;
}

export default function DiceSceneView(props: DiceSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<DiceScene | null>(null);
  const pickRef = useRef(props.onPick);
  const telemetryRef = useRef(props.telemetry);
  const initialOpponentAppearance = useRef(props.opponentAppearance);
  const previousRoll = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);

  // Обработчик нажатия живёт в `ref`, а не передаётся в сцену напрямую:
  // сцена создаётся один раз, а `onPick` — новая функция на каждый
  // рендер. Записывать `ref` во время рендера линтер не даёт (и
  // правильно: React вправе рендер выбросить), поэтому эффектом.
  useEffect(() => {
    pickRef.current = props.onPick;
  }, [props.onPick]);

  useEffect(() => {
    telemetryRef.current = props.telemetry;
  }, [props.telemetry]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let scene: DiceScene;
    try {
      scene = new DiceScene({
        canvas,
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        onPick: (index) => pickRef.current(index),
        onContextLost: () => {
          reportClientError('dice_webgl_context_lost', 'Потерян WebGL-контекст игры в кости', {
            ...telemetryRef.current,
          });
        },
        onContextRestored: (lostForMs) => {
          if (lostForMs < 3000) return;
          reportClientError(
            'dice_webgl_slow_restore',
            'WebGL-контекст игры в кости восстанавливался дольше 3 секунд',
            { ...telemetryRef.current, lostForMs: Math.round(lostForMs) },
          );
        },
        onQualityChange: (quality, fps) => {
          if (quality !== 'low') return;
          reportClientError('dice_low_fps', 'Игра в кости перешла на низкое качество', {
            ...telemetryRef.current,
            fps: Math.round(fps),
          });
        },
      });
    } catch {
      // WebGL может быть недоступен: старый WebView, отключённое
      // ускорение. Экран должен остаться играбельным — падать нельзя.
      const timer = setTimeout(() => setFailed(true), 0);
      return () => clearTimeout(timer);
    }

    sceneRef.current = scene;
    // Только в разработке: живая проверка иначе слепа. Внутри сцены нет
    // ни одного DOM-узла, и снаружи не видно ни куда легли кости, ни
    // включён ли выбор, — а без этого проверка сводится к «потыкать в
    // случайные точки и поверить». Так уже вышло: перебор по сетке
    // попадал в щели между костями и объявил выбор сломанным, хотя он
    // работал.
    if (process.env.NODE_ENV !== 'production') {
      (window as unknown as Record<string, unknown>).__dice = scene;
    }
    scene.resize();
    // Соперник должен быть выбран до первого кадра. Иначе сцена успевает
    // один раз показать встроенный силуэт, прежде чем следующий React-эффект
    // передаст портрет из состояния матча.
    scene.setOpponent(initialOpponentAppearance.current);
    scene.start();

    const observer = new ResizeObserver(() => scene.resize());
    observer.observe(canvas);

    return () => {
      observer.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Новые кости. Анимация — только когда сменился ключ броска: при
  // возвращении в партию и при опросе кости обязаны просто лежать, иначе
  // стол трясётся каждые полторы секунды.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const changed = previousRoll.current !== props.rollKey;
    if (!changed) return;
    const isNewRoll = previousRoll.current !== null;
    previousRoll.current = props.rollKey;
    scene.setDice(props.dice, props.rollKey, isNewRoll && props.dice.length > 0);
  }, [props.dice, props.rollKey]);

  useEffect(() => {
    sceneRef.current?.setSelection(props.picked, props.locked, props.hint);
  }, [props.picked, props.locked, props.hint]);

  useEffect(() => {
    sceneRef.current?.setInteractive(props.interactive);
  }, [props.interactive]);

  useEffect(() => {
    sceneRef.current?.setSide(props.side);
  }, [props.side]);

  useEffect(() => {
    sceneRef.current?.setRivalThinking(props.rivalThinking);
  }, [props.rivalThinking]);

  useEffect(() => {
    sceneRef.current?.setOpponent(props.opponentAppearance);
  }, [props.opponentAppearance]);

  if (failed) {
    return (
      <div className="flex h-full items-center justify-center rounded-3xl bg-[#1a120b] p-6 text-center text-sm text-[#d8c6a6]">
        Стол не открылся: устройство не поддерживает трёхмерную графику. Игра работает, но кости
        придётся читать по цифрам ниже.
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full rounded-3xl"
      // Кости выбираются касанием прямо в сцене — браузер не должен
      // принимать это касание за начало прокрутки.
      style={{ touchAction: 'manipulation' }}
      aria-label="Стол с костями"
    />
  );
}
