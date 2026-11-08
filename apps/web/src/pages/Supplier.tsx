import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../api';
import { useAuth } from '../auth';
import {
  CaseStatusLine,
  DecisionCard,
  ExtractionPanel,
  StatusPill,
} from '../components/case-parts';
import { LoadError } from '../components/LoadError';
import { dateTime, errorText, isCaseInFlight, OUTCOME_LABEL } from '../format';
import { Shell } from './Shell';

/** Supplier home: upload a statement or a CFDI and follow its cases. */
export function SupplierHome() {
  const { session } = useAuth();
  const token = session?.token ?? '';
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [fileMissing, setFileMissing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
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
      if (fileInput.current) fileInput.current.value = '';
      void qc.invalidateQueries({ queryKey: ['cases'] });
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setFileMissing(!file);
    if (file) upload.mutate();
    else fileInput.current?.focus();
  }

  return (
    <Shell title="Mis solicitudes">
      <form className="card" onSubmit={submit} aria-label="Subir documento">
        <h2 className="h3">Subir documento</h2>
        <label>
          Archivo
          <input
            ref={fileInput}
            type="file"
            name="archivo"
            accept=".pdf,.xml,application/pdf,application/xml,text/xml"
            aria-describedby="archivo-ayuda"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setFileMissing(false);
            }}
          />
        </label>
        <p className="muted" id="archivo-ayuda">
          Estado de cuenta en PDF o factura CFDI en XML, hasta 20&nbsp;MB.
        </p>
        <label>
          Correo del dueño del documento
          <input
            type="email"
            name="correo-dueno"
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
            required
            autoComplete="off"
            spellCheck={false}
            aria-describedby="correo-ayuda"
          />
        </label>
        <p className="muted" id="correo-ayuda">
          Si falta algún dato, le enviaremos las preguntas a este correo.
        </p>
        {fileMissing && (
          <p className="error" role="alert">
            Seleccione un archivo para continuar.
          </p>
        )}
        <button type="submit" disabled={upload.isPending}>
          {upload.isPending ? 'Enviando…' : 'Enviar documento'}
        </button>
        {upload.isError && (
          <p className="error" role="alert">
            {errorText(upload.error, 'No se pudo subir el documento. Intente de nuevo.')}
          </p>
        )}
        {upload.data && (
          <p role="status">
            Documento recibido.{' '}
            <Link to={`/supplier/cases/${upload.data.caseId}`}>Ver solicitud</Link>
          </p>
        )}
      </form>
      <h2 className="h3">Solicitudes</h2>
      {cases.isError ? (
        <LoadError error={cases.error} onRetry={() => void cases.refetch()} />
      ) : cases.isPending ? (
        <p className="muted">Cargando solicitudes…</p>
      ) : (
        <CaseTable
          rows={cases.data}
          base="/supplier/cases"
          empty="Todavía no tiene solicitudes. Suba un documento para empezar."
        />
      )}
    </Shell>
  );
}

export function CaseTable({
  rows,
  base,
  empty,
}: {
  rows: {
    id: string;
    status: Parameters<typeof StatusPill>[0]['c']['status'];
    outcome: keyof typeof OUTCOME_LABEL | null;
    documentCount: number;
    createdAt: string;
  }[];
  base: string;
  empty: string;
}) {
  if (!rows.length) return <p className="empty">{empty}</p>;
  return (
    <div className="table-scroll">
      <table className="cases">
        <thead>
          <tr>
            <th>Solicitud</th>
            <th>Estado</th>
            <th>Decisión</th>
            <th className="num">Documentos</th>
            <th>Creada</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td>
                <Link to={`${base}/${c.id}`} translate="no">
                  {c.id.slice(0, 8)}
                </Link>
              </td>
              <td>
                <StatusPill c={c} />
              </td>
              <td>{c.outcome ? OUTCOME_LABEL[c.outcome] : '—'}</td>
              <td className="num">{c.documentCount}</td>
              <td className="nowrap">{dateTime(c.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Supplier case view: status, decision with the reasons that matter, and adding a second document. */
export function SupplierCase() {
  const { id = '' } = useParams();
  const { session } = useAuth();
  const token = session?.token ?? '';
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [fileMissing, setFileMissing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const q = useQuery({
    queryKey: ['case', id],
    queryFn: () => api.getCase(token, id),
    refetchInterval: (query) =>
      query.state.data && !isCaseInFlight(query.state.data) ? false : 2000,
  });
  const add = useMutation({
    mutationFn: () => api.upload(token, file as File, '', id),
    onSuccess: () => {
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      void qc.invalidateQueries({ queryKey: ['case', id] });
    },
  });
  const c = q.data;
  return (
    <Shell
      title={`Solicitud ${id.slice(0, 8)}`}
      back={{ to: '/supplier', label: 'Volver a mis solicitudes' }}
    >
      {q.isError && !c ? (
        <LoadError error={q.error} onRetry={() => void q.refetch()} />
      ) : !c ? (
        <p className="muted">Cargando solicitud…</p>
      ) : (
        <>
          <CaseStatusLine c={c} />
          {c.decision && <DecisionCard decision={c.decision} detailed={false} />}
          {c.documents.map((d) => (
            <ExtractionPanel key={d.id} doc={d} analyst={false} />
          ))}
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault();
              setFileMissing(!file);
              if (file) add.mutate();
              else fileInput.current?.focus();
            }}
          >
            <h2 className="h4">Agregar documento a esta solicitud</h2>
            <label>
              Documento adicional
              <input
                ref={fileInput}
                type="file"
                name="documento"
                accept=".pdf,.xml"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setFileMissing(false);
                }}
              />
            </label>
            {fileMissing && (
              <p className="error" role="alert">
                Seleccione un archivo para continuar.
              </p>
            )}
            <button type="submit" disabled={add.isPending}>
              {add.isPending ? 'Agregando…' : 'Agregar documento'}
            </button>
            {add.isError && (
              <p className="error" role="alert">
                {errorText(add.error, 'No se pudo agregar el documento. Intente de nuevo.')}
              </p>
            )}
          </form>
        </>
      )}
    </Shell>
  );
}
