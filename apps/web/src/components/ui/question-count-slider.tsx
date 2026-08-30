interface QuestionCountSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

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
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-text-secondary">{label}</span>
        <span className="text-lg font-bold text-primary">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-hover accent-primary disabled:cursor-not-allowed disabled:opacity-50"
      />
      <div className="flex justify-between text-xs text-text-muted">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
