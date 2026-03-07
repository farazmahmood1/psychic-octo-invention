/**
 * Vitest setup for admin frontend tests.
 */
import { expect } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend vitest expect with jest-dom matchers
expect.extend(matchers);

// Mock the fetch API
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Reset mocks between tests
beforeEach(() => {
  mockFetch.mockReset();
});
