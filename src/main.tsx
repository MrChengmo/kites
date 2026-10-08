import { t, useLanguage } from './i18n';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '@fontsource-variable/noto-sans-sc';
import './style.css';
import { setupNative } from './native';
void setupNative();
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    if (this.state.error)
      return (
        <main className="fatal">
          <img src="/kite.svg" width="44" />
          <h1>{t('Let’s get you back.')}</h1>
          <p>{this.state.error}</p>
          <button className="primary" onClick={() => location.reload()}>
            {t('Reload Kites')}
          </button>
        </main>
      );
    return this.props.children;
  }
}
function Root() {
  useLanguage();
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
