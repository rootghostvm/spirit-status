"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

export type AdminSelectOption = {
  value: string;
  label: string;
  hint?: string;
  tone?: string;
};

type AdminSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: AdminSelectOption[];
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
};

export function AdminSelect({
  value,
  onChange,
  options,
  disabled = false,
  placeholder = "Select…",
  ariaLabel,
}: AdminSelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value);
  const selectedIndex = options.findIndex((o) => o.value === value);

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        close();
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, close]);

  useEffect(() => {
    if (open) {
      setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    }
  }, [open, selectedIndex]);

  function selectOption(option: AdminSelectOption) {
    onChange(option.value);
    close();
  }

  function onTriggerKeyDown(event: KeyboardEvent) {
    if (disabled) return;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) {
          setOpen(true);
        } else {
          setActiveIndex((i) => Math.min(options.length - 1, Math.max(0, i) + 1));
        }
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!open) {
          setOpen(true);
        } else {
          setActiveIndex((i) => Math.max(0, (i < 0 ? options.length : i) - 1));
        }
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (!open) {
          setOpen(true);
        } else if (activeIndex >= 0 && options[activeIndex]) {
          selectOption(options[activeIndex]);
        }
        break;
      case "Escape":
        if (open) {
          event.preventDefault();
          close();
        }
        break;
      default:
        break;
    }
  }

  return (
    <div
      className={`admin-select ${open ? "is-open" : ""} ${disabled ? "is-disabled" : ""}`}
      ref={rootRef}
    >
      <button
        type="button"
        className="admin-select-trigger"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => {
          if (!disabled) setOpen((v) => !v);
        }}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="admin-select-value">
          {selected?.tone ? (
            <span
              className={`admin-select-dot tone-${selected.tone}`}
              aria-hidden
            />
          ) : null}
          <span>{selected?.label ?? placeholder}</span>
        </span>
        <span className="admin-select-chevron" aria-hidden />
      </button>

      {open ? (
        <ul
          id={listId}
          className="admin-select-menu"
          role="listbox"
          aria-label={ariaLabel}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;
            return (
              <li
                key={option.value}
                role="option"
                aria-selected={isSelected}
                className={`admin-select-option ${isSelected ? "is-selected" : ""} ${isActive ? "is-active" : ""}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectOption(option)}
              >
                {option.tone ? (
                  <span
                    className={`admin-select-dot tone-${option.tone}`}
                    aria-hidden
                  />
                ) : null}
                <span className="admin-select-option-copy">
                  <span className="admin-select-option-label">
                    {option.label}
                  </span>
                  {option.hint ? (
                    <span className="admin-select-option-hint">
                      {option.hint}
                    </span>
                  ) : null}
                </span>
                {isSelected ? (
                  <span className="admin-select-check" aria-hidden>
                    ✓
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
