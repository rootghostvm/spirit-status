"use client";

type SegmentedOption = {
  value: string;
  label: string;
};

type SegmentedControlProps = {
  value: string;
  onChange: (value: string) => void;
  options: SegmentedOption[];
  disabled?: boolean;
  ariaLabel?: string;
};

export function SegmentedControl({
  value,
  onChange,
  options,
  disabled = false,
  ariaLabel,
}: SegmentedControlProps) {
  return (
    <div
      className={`segmented ${disabled ? "is-disabled" : ""}`}
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className={isActive ? "is-active" : ""}
            aria-pressed={isActive}
            disabled={disabled}
            onClick={() => {
              if (!disabled && option.value !== value) {
                onChange(option.value);
              }
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
