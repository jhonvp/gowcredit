import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { DecisionCard, ExtractionPanel, StatusPill } from '../components/case-parts';
import { dateTime, isInFlight, OUTCOME_LABEL } from '../format';
import { Shell } from './Shell';

/** Supplier home: upload a statement or a CFDI and follow its cases. */
export function SupplierHome() {
  const { session } = useAuth();
  const token = session?.token ?? '';
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [ownerEmail, setOwnerEmail] = useState(session?.user.email ?? '');
  const cases = useQuery({
    queryKey: ['cases'],
    queryFn: () => api.listCases(token),
    refetchInterval: 4000,
  });
  const upload = useMutation({
    mutationFn: () => api.upload(token, file as File, ownerEmail),
    onSuccess: () => {
      setFile(null);
      void qc.invalidateQueries({ queryKey: ['cases'] });
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (file) upload.mutate();
  }

  return (
    <Shell title="Mis solicitudes">
      <form className="card" onSubmit={submit} aria-label="Subir documento">
        <h3>Subir documento</h3>
        <p className="muted">Estado de cuenta (PDF) o factura CFDI (XML).</p>
        <input
          type="file"
          accept=".pdf,.xml,application/pdf,application/xml,text/xml"
          aria-label="Archivo"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <label>
          Correo del dueño del documento (recibe las preguntas)
          <input
            type="email"
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={!file || upload.isPending}>
          Enviar
        </button>
        {upload.isError && (
          <p className="error" role="alert">
            {upload.error instanceof ApiError ? upload.error.message : 'No se pudo subir'}
          </p>
        )}
        {upload.data && (
          <p role="status">
            Recibido. <Link to={`/supplier/cases/${upload.data.caseId}`}>Ver solicitud</Link>
          </p>
        )}
      </form>
      <CaseTable rows={cases.data ?? []} base="/supplier/cases" />
    </Shell>
  );
}

export function CaseTable({
  rows,
  base,
}: {
  rows: {
    id: string;
    status: Parameters<typeof StatusPill>[0]['c']['status'];
    outcome: keyof typeof OUTCOME_LABEL | null;
    documentCount: number;
    createdAt: string;
  }[];
  base: string;
}) {
  if (!rows.length) return <p className="muted">Sin solicitudes todavía.</p>;
  return (
    <table className="cases">
      <thead>
        <tr>
          <th>Solicitud</th>
          <th>Estado</th>
          <th>Decisión</th>
          <th>Documentos</th>
          <th>Creada</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.id}>
            <td>
              <Link to={`${base}/${c.id}`}>{c.id.slice(0, 8)}</Link>
            </td>
            <td>
              <StatusPill c={c} />
            </td>
            <td>{c.outcome ? OUTCOME_LABEL[c.outcome] : '—'}</td>
            <td>{c.documentCount}</td>
            <td>{dateTime(c.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Supplier case view: status, decision with the reasons that matter, and adding a second document. */
export function SupplierCase() {
  const { id = '' } = useParams();
  const { session } = useAuth();
  const token = session?.token ?? '';
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const q = useQuery({
    queryKey: ['case', id],
    queryFn: () => api.getCase(token, id),
    refetchInterval: (query) =>
      query.state.data && !isInFlight(query.state.data.status) ? false : 2000,
  });
  const add = useMutation({
    mutationFn: () => api.upload(token, file as File, '', id),
    onSuccess: () => {
      setFile(null);
      void qc.invalidateQueries({ queryKey: ['case', id] });
    },
  });
  const c = q.data;
  return (
    <Shell title={`Solicitud ${id.slice(0, 8)}`}>
      {!c ? (
        <p className="muted">Cargando…</p>
      ) : (
        <>
          <p>
            Estado: <StatusPill c={c} />
          </p>
          {c.decision && <DecisionCard decision={c.decision} detailed={false} />}
          {c.documents.map((d) => (
            <ExtractionPanel key={d.id} doc={d} analyst={false} />
          ))}
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault();
              if (file) add.mutate();
            }}
          >
            <h4>Agregar documento a esta solicitud</h4>
            <input
              type="file"
              accept=".pdf,.xml"
              aria-label="Documento adicional"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <button type="submit" disabled={!file || add.isPending}>
              Agregar
            </button>
          </form>
        </>
      )}
    </Shell>
  );
}
