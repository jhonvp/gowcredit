import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { api } from '../api';
import { useAuth } from '../auth';
import {
  ClarificationHistory,
  DecisionCard,
  ExtractionPanel,
  StatusPill,
} from '../components/case-parts';
import { CopilotPanel } from '../components/CopilotPanel';
import { isInFlight, TIER } from '../format';
import { Shell } from './Shell';
import { CaseTable } from './Supplier';

export function AnalystHome() {
  const { session } = useAuth();
  const [status, setStatus] = useState('');
  const cases = useQuery({
    queryKey: ['cases'],
    queryFn: () => api.listCases(session?.token ?? ''),
    refetchInterval: 5000,
  });
  const rows = (cases.data ?? []).filter((c) => !status || c.status === status);
  return (
    <Shell title="Solicitudes">
      <label className="inline">
        Estado{' '}
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filtrar por estado"
        >
          <option value="">Todos</option>
          <option value="AWAITING_OWNER">Esperando al dueño</option>
          <option value="DECIDED">Decididos</option>
          <option value="FAILED">Con error</option>
        </select>
      </label>
      <CaseTable rows={rows} base="/analyst/cases" />
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
      query.state.data && !isInFlight(query.state.data.status) ? false : 2000,
  });
  const c = q.data;
  const [selected, setSelected] = useState<string | null>(null);
  const docId = selected ?? c?.documents[0]?.id ?? null;
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const doc = c?.documents.find((d) => d.id === docId);

  useEffect(() => {
    if (!docId || !token) return;
    let url: string | null = null;
    api.documentUrl(token, docId).then(
      (u) => {
        url = u;
        setFileUrl(u);
      },
      () => setFileUrl(null),
    );
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [docId, token]);

  return (
    <Shell title={`Solicitud ${id.slice(0, 8)}`}>
      {!c ? (
        <p className="muted">Cargando…</p>
      ) : (
        <>
          <p>
            Estado: <StatusPill c={c} /> <Legend />
          </p>
          {c.decision && <DecisionCard decision={c.decision} detailed />}
          <div className="tabs">
            {c.documents.map((d) => (
              <button
                key={d.id}
                type="button"
                className={d.id === docId ? 'active' : ''}
                onClick={() => setSelected(d.id)}
              >
                {d.originalName}
              </button>
            ))}
          </div>
          <div className="split">
            <div className="viewer">
              {fileUrl && doc?.docType !== 'CFDI_INVOICE' ? (
                <iframe title="Documento" src={fileUrl} />
              ) : fileUrl ? (
                <iframe title="Documento" src={fileUrl} className="xml" />
              ) : (
                <p className="muted">Sin vista previa</p>
              )}
            </div>
            <div>{doc && <ExtractionPanel doc={doc} analyst />}</div>
          </div>
          <CopilotPanel token={token} caseId={c.id} />
          <ClarificationHistory items={c.clarifications} />
        </>
      )}
    </Shell>
  );
}

function Legend() {
  return (
    <span className="legend" aria-label="Leyenda de niveles">
      {Object.entries(TIER).map(([k, v]) => (
        <span key={k}>
          <i style={{ background: v.color }} /> {v.label}
        </span>
      ))}
    </span>
  );
}
