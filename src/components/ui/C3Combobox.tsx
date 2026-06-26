import {
  Combobox,
  ComboboxInput,
  ComboboxButton,
  ComboboxOptions,
  ComboboxOption,
  Transition,
} from '@headlessui/react';
import { ChevronDown, Check } from 'lucide-react';
import { useState } from 'react';

export interface C3ComboboxOption {
  value: string;
  label: string;
  subLabel?: string;
}

interface C3ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: C3ComboboxOption[];
  placeholder?: string;
  /** Función de filtrado personalizada. Por defecto: búsqueda por label insensible a mayúsculas */
  filterFn?: (query: string, option: C3ComboboxOption) => boolean;
  displayValue?: (value: string) => string;
  disabled?: boolean;
}

/**
 * C3Combobox — Input con búsqueda y autocompletado.
 * Construido sobre Headless UI Combobox.
 * - Filtrado en tiempo real
 * - Keyboard navigation completa
 * - Empty state cuando no hay resultados
 * - data-focus, data-selected para estilo de opciones
 */
export const C3Combobox = ({
  value,
  onChange,
  options,
  placeholder = 'Buscar...',
  filterFn,
  displayValue,
  disabled = false,
}: C3ComboboxProps) => {
  const [query, setQuery] = useState('');

  const defaultFilter = (q: string, opt: C3ComboboxOption) =>
    opt.label.toLowerCase().includes(q.toLowerCase()) ||
    (opt.subLabel?.toLowerCase().includes(q.toLowerCase()) ?? false);

  const filtered = query === ''
    ? options
    : options.filter(opt => (filterFn ?? defaultFilter)(query, opt));

  const getDisplayValue = (val: string) => {
    if (displayValue) return displayValue(val);
    return options.find(o => o.value === val)?.label ?? val;
  };

  return (
    <div className="c3-combobox">
      <Combobox
        value={value}
        onChange={(val: string | null) => onChange(val ?? '')}
        disabled={disabled}
      >
        <div className="c3-combobox-input-wrapper">
          <ComboboxInput
            className="c3-combobox-input"
            displayValue={getDisplayValue}
            onChange={e => setQuery(e.target.value)}
            placeholder={placeholder}
            autoComplete="off"
          />
          <ComboboxButton className="c3-combobox-button" aria-label="Abrir lista">
            <ChevronDown size={16} aria-hidden="true" />
          </ComboboxButton>
        </div>

        <Transition
          enter="c3-listbox-enter"
          enterFrom="c3-listbox-enter-from"
          enterTo="c3-listbox-enter-to"
          leave="c3-listbox-leave"
          leaveFrom="c3-listbox-leave-from"
          leaveTo="c3-listbox-leave-to"
          afterLeave={() => setQuery('')}
        >
          <ComboboxOptions className="c3-listbox-options" anchor="bottom start">
            {filtered.map(opt => (
              <ComboboxOption key={opt.value} value={opt.value} className="c3-listbox-option">
                {({ selected: isSel }) => (
                  <>
                    <span className="c3-listbox-option-check">
                      {isSel && <Check size={14} />}
                    </span>
                    <span className="c3-listbox-option-text">
                      <span className="c3-listbox-option-label">{opt.label}</span>
                      {opt.subLabel && (
                        <span className="c3-listbox-option-desc">{opt.subLabel}</span>
                      )}
                    </span>
                  </>
                )}
              </ComboboxOption>
            ))}

            {filtered.length === 0 && query !== '' && (
              <div className="c3-listbox-empty">
                Sin resultados para "<strong>{query}</strong>"
              </div>
            )}
          </ComboboxOptions>
        </Transition>
      </Combobox>
    </div>
  );
};

