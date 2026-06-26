import { Transition } from '@headlessui/react';
import type { ReactNode } from 'react';

type TransitionPreset = 'fadeSlideUp' | 'fade' | 'scale' | 'slideRight' | 'slideDown';

interface C3TransitionProps {
  show: boolean;
  preset?: TransitionPreset;
  children: ReactNode;
}

const PRESET_CLASSES: Record<TransitionPreset, {
  enter: string;
  enterFrom: string;
  enterTo: string;
  leave: string;
  leaveFrom: string;
  leaveTo: string;
}> = {
  fadeSlideUp: {
    enter: 'c3-tr-fadeSlideUp-enter',
    enterFrom: 'c3-tr-fadeSlideUp-enter-from',
    enterTo: 'c3-tr-fadeSlideUp-enter-to',
    leave: 'c3-tr-fadeSlideUp-leave',
    leaveFrom: 'c3-tr-fadeSlideUp-leave-from',
    leaveTo: 'c3-tr-fadeSlideUp-leave-to',
  },
  fade: {
    enter: 'c3-tr-fade-enter',
    enterFrom: 'c3-tr-fade-enter-from',
    enterTo: 'c3-tr-fade-enter-to',
    leave: 'c3-tr-fade-leave',
    leaveFrom: 'c3-tr-fade-leave-from',
    leaveTo: 'c3-tr-fade-leave-to',
  },
  scale: {
    enter: 'c3-tr-scale-enter',
    enterFrom: 'c3-tr-scale-enter-from',
    enterTo: 'c3-tr-scale-enter-to',
    leave: 'c3-tr-scale-leave',
    leaveFrom: 'c3-tr-scale-leave-from',
    leaveTo: 'c3-tr-scale-leave-to',
  },
  slideRight: {
    enter: 'c3-tr-slideRight-enter',
    enterFrom: 'c3-tr-slideRight-enter-from',
    enterTo: 'c3-tr-slideRight-enter-to',
    leave: 'c3-tr-slideRight-leave',
    leaveFrom: 'c3-tr-slideRight-leave-from',
    leaveTo: 'c3-tr-slideRight-leave-to',
  },
  slideDown: {
    enter: 'c3-tr-slideDown-enter',
    enterFrom: 'c3-tr-slideDown-enter-from',
    enterTo: 'c3-tr-slideDown-enter-to',
    leave: 'c3-tr-slideDown-leave',
    leaveFrom: 'c3-tr-slideDown-leave-from',
    leaveTo: 'c3-tr-slideDown-leave-to',
  },
};

/**
 * C3Transition — Wrapper de transición declarativa con presets.
 * Construido sobre Headless UI Transition.
 * Reemplaza todos los @keyframes inline y <style> tags del proyecto.
 */
export const C3Transition = ({ show, preset = 'fade', children }: C3TransitionProps) => {
  const classes = PRESET_CLASSES[preset];
  return (
    <Transition
      show={show}
      enter={classes.enter}
      enterFrom={classes.enterFrom}
      enterTo={classes.enterTo}
      leave={classes.leave}
      leaveFrom={classes.leaveFrom}
      leaveTo={classes.leaveTo}
    >
      {children}
    </Transition>
  );
};
