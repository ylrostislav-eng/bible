import clsx from 'clsx';

interface QuestionCountSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

// Native `accent-color` styling only fills the track up to the thumb in a
// couple of browsers and looks inconsistent everywhere else, so the track
// fill here is a plain CSS gradient computed from the value instead — the
// thumb itself is restyled via the (Tailwind v4) `[&::-webkit-slider-thumb]`
// / `[&::-moz-range-thumb]` arbitrary-selector variants.
// Thumb sized well past the 8px track for a real touch target (close to
// Apple's ~28px HIG minimum) — the track stays visually thin, but almost
// nobody grabs a slider by the track on a touchscreen anyway; the thumb is
// what needs to be easy to land a finger on.
const THUMB_CLASSES =
  '[&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:appearance-none ' +
  '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-bg ' +
  '[&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-[0_0_0_3px_rgba(232,176,75,0.25)] ' +
  '[&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110 ' +
  '[&::-moz-range-thumb]:h-7 [&::-moz-range-thumb]:w-7 [&::-moz-range-thumb]:rounded-full ' +
  '[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-bg [&::-moz-range-thumb]:bg-primary ' +
  '[&::-moz-range-thumb]:shadow-[0_0_0_3px_rgba(232,176,75,0.25)] [&::-moz-range-thumb]:transition-transform ' +
  '[&::-moz-range-thumb]:hover:scale-110 [&::-moz-range-track]:bg-transparent';

/** Shared by every screen that picks a duel/room question count (create
 * duel, adjust-down on join, friend challenges, room setup) so the min/max
 * clamping and styling live in one place. */
export function QuestionCountSlider({
  label,
  value,
  min,
  max,
  onChange,
  disabled,
}: QuestionCountSliderProps) {
  const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-text-secondary">{label}</span>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-lg font-bold text-primary">
          {value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          background: `linear-gradient(to right, var(--color-primary) ${percent}%, var(--color-surface-hover) ${percent}%)`,
        }}
        className={clsx(
          'h-3 w-full cursor-pointer appearance-none rounded-full outline-none disabled:cursor-not-allowed disabled:opacity-50',
          THUMB_CLASSES,
        )}
      />
      <div className="flex justify-between text-xs text-text-muted">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
