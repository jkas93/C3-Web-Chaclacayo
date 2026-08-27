import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

if (!Element.prototype.getAnimations) {
  Element.prototype.getAnimations = () => [];
}

afterEach(() => cleanup());
