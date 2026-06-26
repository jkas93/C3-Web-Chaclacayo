import { Menu, MenuButton, MenuItems, MenuItem, Transition } from '@headlessui/react';
import type { ReactNode } from 'react';

export interface C3MenuItemConfig {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  dividerBefore?: boolean;
}

interface C3MenuProps {
  trigger: ReactNode;
  items: C3MenuItemConfig[];
  /** Posición del dropdown. Default: 'bottom end' */
  anchor?: 'bottom end' | 'bottom start' | 'top end' | 'top start';
}

/**
 * C3Menu — Dropdown de acciones construido sobre Headless UI Menu.
 * - Keyboard navigation (flechas, Enter, Escape, Tab)
 * - data-active, data-focus para estilo hover
 * - Animación scale+fade con Transition
 * - Soporte para separadores y items peligrosos
 */
export const C3Menu = ({ trigger, items, anchor = 'bottom end' }: C3MenuProps) => {
  return (
    <Menu as="div" className="c3-menu-root">
      <MenuButton as="div" className="c3-menu-trigger">
        {trigger}
      </MenuButton>

      <Transition
        enter="c3-menu-enter"
        enterFrom="c3-menu-enter-from"
        enterTo="c3-menu-enter-to"
        leave="c3-menu-leave"
        leaveFrom="c3-menu-leave-from"
        leaveTo="c3-menu-leave-to"
      >
        <MenuItems className="c3-menu-items" anchor={anchor}>
          {items.map((item, idx) => (
            <span key={idx}>
              {item.dividerBefore && <div className="c3-menu-divider" role="separator" />}
              <MenuItem disabled={item.disabled}>
                <button
                  onClick={item.onClick}
                  className={`c3-menu-item ${item.danger ? 'c3-menu-item--danger' : ''}`}
                  disabled={item.disabled}
                >
                  {item.icon && <span className="c3-menu-item-icon" aria-hidden="true">{item.icon}</span>}
                  {item.label}
                </button>
              </MenuItem>
            </span>
          ))}
        </MenuItems>
      </Transition>
    </Menu>
  );
};
