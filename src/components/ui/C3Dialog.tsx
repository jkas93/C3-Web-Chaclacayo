import { Dialog, DialogBackdrop, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import type { ReactNode } from 'react';

interface C3DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Ancho máximo del panel. Default: '520px' */
  maxWidth?: string;
}

/**
 * C3Dialog — Modal accesible construido sobre Headless UI Dialog.
 * - Focus trap automático al abrir
 * - Cierre con Escape o click en backdrop
 * - Scroll lock en body
 * - Animación fade + scale con Transition
 * - Accesibilidad WAI-ARIA completa (role=dialog, aria-modal, aria-labelledby)
 */
export const C3Dialog = ({ open, onClose, title, children, maxWidth = '520px' }: C3DialogProps) => {
  return (
    <Transition show={open}>
      <Dialog onClose={onClose} className="c3-dialog-root">
        {/* Backdrop */}
        <TransitionChild>
          <DialogBackdrop className="c3-dialog-backdrop" />
        </TransitionChild>

        {/* Centering wrapper */}
        <div className="c3-dialog-outer">
          <TransitionChild>
            <DialogPanel className="c3-dialog-panel" style={{ maxWidth }}>
              {title && (
                <DialogTitle className="c3-dialog-title">
                  {title}
                </DialogTitle>
              )}
              {children}
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  );
};
