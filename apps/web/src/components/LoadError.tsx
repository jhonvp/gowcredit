import { ApiError } from '../api';

/** A screen that could not load: says what happened and offers a way forward. */
export function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const notFound = error instanceof ApiError && error.status === 404;
  return (
    <div className="card" role="alert">
      <p>
        {notFound
          ? 'No encontramos esta solicitud. Verifique el enlace o vuelva a la lista.'
          : 'No pudimos cargar la información. Revise su conexión e intente de nuevo.'}
      </p>
      {!notFound && (
        <button type="button" className="secondary" onClick={onRetry}>
          Reintentar
        </button>
      )}
    </div>
  );
}
