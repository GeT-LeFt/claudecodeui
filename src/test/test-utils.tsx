/**
 * Shared test utilities for React component tests.
 *
 * Provides `renderWithProviders` that wraps components in a minimal i18n
 * context using real English translations — so assertions can match against
 * visible user-facing text rather than raw i18n keys.
 */
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import type { ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';

import enAuth from '../i18n/locales/en/auth.json';
import enChat from '../i18n/locales/en/chat.json';
import enCommon from '../i18n/locales/en/common.json';
import enSettings from '../i18n/locales/en/settings.json';
import enSidebar from '../i18n/locales/en/sidebar.json';

// Create a dedicated i18n instance for tests so it never collides with the app
// instance or with `localStorage`-based language detection.
const testI18n = i18n.createInstance();
testI18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  ns: ['common', 'auth', 'settings', 'sidebar', 'chat'],
  defaultNS: 'common',
  resources: {
    en: {
      common: enCommon,
      auth: enAuth,
      settings: enSettings,
      sidebar: enSidebar,
      chat: enChat,
    },
  },
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

/**
 * Render a component wrapped in the i18n provider (with real English
 * translations).  Returns the standard Testing Library queries plus a
 * pre-configured `userEvent` instance for simulating interactions.
 */
export function renderWithProviders(ui: ReactElement) {
  const user = userEvent.setup();
  return {
    user,
    ...render(<I18nextProvider i18n={testI18n}>{ui}</I18nextProvider>),
  };
}
