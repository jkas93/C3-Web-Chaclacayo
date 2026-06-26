import { Listbox, ListboxButton, ListboxOptions, ListboxOption, Transition } from '@headlessui/react';
import { ChevronDown, Check } from 'lucide-react';

export interface C3ListboxOption {
  value: string;
  label: string;
  icon?: string;        // emoji o símbolo
  description?: string;
  disabled?: boolean;
}

interface C3ListboxProps {
  value: string;
  onChange: (value: string) => void;
  options: C3ListboxOption[];
  placeholder?: string;
  disabled?: boolean;
  label?: string;
}

/**
 * C3Listbox — Select estilizado construido sobre Headless UI Listbox.
 * - Keyboard navigation completa (flechas, Home, End, Enter, Escape)
 * - Estados data-selected, data-focus, data-active
 * - Animación de apertura con Transition
 * - Checkmark en opción seleccionada
 */
export const C3Listbox = ({ value, onChange, options, placeholder = 'Seleccionar...', disabled = false, label }: C3ListboxProps) => {
  const selected = options.find(o => o.value === value);

  return (
    <div className="c3-listbox-wrapper">
      {label && <span className="c3-listbox-label">{label}</span>}
      <Listbox value={value} onChange={onChange} disabled={disabled}>
        <ListboxButton className="c3-listbox-button">
          <span className="c3-listbox-button-text">
            {selected ? (
              <>
                {selected.icon && <span className="c3-listbox-icon">{selected.icon}</span>}
                {selected.label}
              </>
            ) : (
              <span className="c3-listbox-placeholder">{placeholder}</span>
            )}
          </span>
          <ChevronDown size={16} className="c3-listbox-chevron" aria-hidden="true" />
        </ListboxButton>

        <Transition
          enter="c3-listbox-enter"
          enterFrom="c3-listbox-enter-from"
          enterTo="c3-listbox-enter-to"
          leave="c3-listbox-leave"
          leaveFrom="c3-listbox-leave-from"
          leaveTo="c3-listbox-leave-to"
        >
          <ListboxOptions className="c3-listbox-options" anchor="bottom start">
            {options.map(opt => (
              <ListboxOption
                key={opt.value}
                value={opt.value}
                disabled={opt.disabled}
                className="c3-listbox-option"
              >
                {({ selected: isSel }) => (
                  <>
                    <span className="c3-listbox-option-check">
                      {isSel && <Check size={14} />}
                    </span>
                    {opt.icon && <span className="c3-listbox-icon">{opt.icon}</span>}
                    <span className="c3-listbox-option-text">
                      <span className="c3-listbox-option-label">{opt.label}</span>
                      {opt.description && (
                        <span className="c3-listbox-option-desc">{opt.description}</span>
                      )}
                    </span>
                  </>
                )}
              </ListboxOption>
            ))}
            {options.length === 0 && (
              <div className="c3-listbox-empty">Sin opciones disponibles</div>
            )}
          </ListboxOptions>
        </Transition>
      </Listbox>
    </div>
  );
};
