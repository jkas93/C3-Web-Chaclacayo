import { RadioGroup, Radio, Label, Description } from '@headlessui/react';

export interface C3RadioOption {
  value: string;
  label: string;
  description?: string;
  icon?: string;    // emoji
  color?: string;   // color de acento
  bgColor?: string;
}

interface C3RadioGroupProps {
  value: string;
  onChange: (value: string) => void;
  options: C3RadioOption[];
  label?: string;
}

/**
 * C3RadioGroup — Selector de opciones con tarjetas visuales.
 * Construido sobre Headless UI RadioGroup.
 * - Keyboard navigation (flechas)
 * - data-checked para estilo de selección
 * - data-focus para indicador de foco accesible
 */
export const C3RadioGroup = ({ value, onChange, options, label }: C3RadioGroupProps) => {
  return (
    <RadioGroup value={value} onChange={onChange} className="c3-radiogroup" aria-label={label}>
      {label && (
        <Label className="c3-radiogroup-label">{label}</Label>
      )}
      <div className="c3-radiogroup-options">
        {options.map(opt => (
          <Radio
            key={opt.value}
            value={opt.value}
            className="c3-radiogroup-option"
            style={{
              '--radio-color': opt.color,
              '--radio-bg': opt.bgColor,
            } as React.CSSProperties}
          >
            {opt.icon && (
              <span className="c3-radiogroup-icon" aria-hidden="true">
                {opt.icon}
              </span>
            )}
            <div className="c3-radiogroup-text">
              <Label className="c3-radiogroup-option-label">{opt.label}</Label>
              {opt.description && (
                <Description className="c3-radiogroup-option-desc">{opt.description}</Description>
              )}
            </div>
            <span className="c3-radiogroup-check" aria-hidden="true" />
          </Radio>
        ))}
      </div>
    </RadioGroup>
  );
};
