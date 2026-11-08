import { Component, type ReactNode } from 'react';

interface State {
  failed: boolean;
}

/**
 * Last-resort boundary: a render error in one screen shows a short message with a way back instead
 * of a blank page. Nothing about the error is shown or sent (it may contain case data).
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="narrow">
        <h1>Algo salió mal</h1>
        <p role="alert">No pudimos mostrar esta pantalla.</p>
        <button type="button" onClick={() => window.location.reload()}>
          Volver a cargar
        </button>
      </main>
    );
  }
}
