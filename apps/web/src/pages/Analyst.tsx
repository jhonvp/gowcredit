import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { api, type DocumentFile } from '../api';
import { useAuth } from '../auth';
import {
  CaseStatusLine,
  ClarificationHistory,
  DecisionCard,
  ExtractionPanel,
} from '../components/case-parts';
import { CopilotPanel } from '../components/CopilotPanel';
import { OwnerLinkPanel } from '../components/OwnerLinkPanel';
import { LoadError } from '../components/LoadError';
import { isCaseInFlight, STATUS_LABEL, TIER } from '../format';
import { Shell } from './Shell';
import { CaseTable } from './Supplier';

export function AnalystHome() {
  const { session } = useAuth();
  // In the URL, so a filtered list can be reloaded and shared.
  const [params, setParams] = useSearchParams();
  const status = params.get('estado') ?? '';
  const cases = useQuery({
    queryKey: ['cases'],
    queryFn: () => api.listCases(session?.token ?? ''),
    refetchInterval: 5000,
  });
  const rows = (cases.data ?? []).filter((c) => !status || c.status === status);
  return (
    <Shell title="Solicitudes">
      <label className="filter">
        Filtrar por estado
        <select
          name="estado"
          value={status}
          onChange={(e) => setParams(e.target.value ? { estado: e.target.value } : {})}
        >
          <option value="">Todos</option>
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {cases.isError ? (
        <LoadError error={cases.error} onRetry={() => void cases.refetch()} />
      ) : cases.isPending ? (
        <p className="muted">Cargando solicitudes…</p>
      ) : (
        <CaseTable
          rows={rows}
          base="/analyst/cases"
          empty={status ? 'Ninguna solicitud con este estado.' : 'Todavía no hay solicitudes.'}
        />
      )}
    </Shell>
  );
}

/** Analyst case view: the document next to the extracted fields (coloured by tier), the cascade, the decision and the clarifications. */
export function AnalystCase() {
  const { id = '' } = useParams();
  const { session } = useAuth();
  const token = session?.token ?? '';
  const q = useQuery({
    queryKey: ['case', id],
    queryFn: () => api.getCase(token, id),
    refetchInterval: (query) =>
      query.state.data && !isCaseInFlight(query.state.data) ? false : 2000,
  });
  const c = q.data;
  // The open document is in the URL: reload and shared links land on the same one.
  const [params, setParams] = useSearchParams();
  const selected = params.get('doc');
  const docId = selected ?? c?.documents[0]?.id ?? null;
  // The loaded file is tagged with its document id, so a slow response for a document the analyst
  // already left is never shown in place of the selected one.
  const [loaded, setLoaded] = useState<{ docId: string; file: DocumentFile | null } | null>(null);
  const current = loaded?.docId === docId ? loaded : null;
  const file = current?.file ?? null;
  const doc = c?.documents.find((d) => d.id === docId);

  useEffect(() => {
    if (!docId || !token) return;
    let cancelled = false;
    let url: string | null = null;
    api.documentFile(token, docId).then(
      (f) => {
        if (f.kind === 'pdf') {
          // Arrived after cleanup: nobody will show it, so release the blob now.
          if (cancelled) return URL.revokeObjectURL(f.url);
          url = f.url;
        }
        if (!cancelled) setLoaded({ docId, file: f });
      },
      () => {
        if (!cancelled) setLoaded({ docId, file: null });
      },
    );
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [docId, token]);

  return (
    <Shell
      title={`Solicitud ${id.slice(0, 8)}`}
      back={{ to: '/analyst', label: 'Volver a solicitudes' }}
    >
      {q.isError && !c ? (
        <LoadError error={q.error} onRetry={() => void q.refetch()} />
      ) : !c ? (
        <p className="muted">Cargando solicitud…</p>
      ) : (
        <>
          <CaseStatusLine c={c} />
          <Legend />
          {c.decision && <DecisionCard decision={c.decision} detailed />}
          <div className="tabs">
            {c.documents.map((d) => (
              <button
                key={d.id}
                type="button"
                className={d.id === docId ? 'active' : ''}
                aria-pressed={d.id === docId}
                onClick={() => setParams({ doc: d.id }, { replace: true })}
              >
                {d.originalName}
              </button>
            ))}
          </div>
          <div className="split">
            <div className="viewer">
              {file?.kind === 'pdf' ? (
                <iframe title="Documento" src={file.url} />
              ) : file ? (
                <pre className="xml" aria-label="Documento">
                  {file.text}
                </pre>
              ) : (
                <p className="muted" role="status">
                  {current ? 'No pudimos cargar el documento.' : 'Cargando documento…'}
                </p>
              )}
            </div>
            <div>{doc && <ExtractionPanel doc={doc} analyst />}</div>
          </div>
          {c.clarifications.some((r) => r.status === 'open') && (
            <OwnerLinkPanel token={token} caseId={c.id} />
          )}
          <CopilotPanel token={token} caseId={c.id} />
          <ClarificationHistory items={c.clarifications} />
        </>
      )}
    </Shell>
  );
}

function Legend() {
  return (
    <p className="legend">
      <span className="sr-only">Niveles de extracción: </span>
      {Object.entries(TIER).map(([k, v]) => (
        <span key={k}>
          <i aria-hidden="true" style={{ background: v.color }} /> {v.label}
        </span>
      ))}
    </p>
  );
}
