import {
  type CaseSummaryView,
  CaseSummaryViewSchema,
  type CaseView,
  CaseViewSchema,
  type CopilotResponse,
  CopilotResponseSchema,
  type LoginResponse,
  LoginResponseSchema,
  type OwnerAnswerResponse,
  OwnerAnswerResponseSchema,
  type OwnerAnswersRequest,
  type OwnerLinkResponse,
  OwnerLinkResponseSchema,
  type OwnerRequestView,
  OwnerRequestViewSchema,
  type SubmitDocumentResponse,
  SubmitDocumentResponseSchema,
} from '@gowcredit/contracts';
import type { z } from 'zod';

/**
 * Thin API client. Every response is parsed with the shared zod contracts (ADR 0011), so an API/web
 * drift fails loudly here instead of rendering wrong data.
 */
/** A downloaded document: PDFs as an object URL for the viewer, anything else as plain text. */
export type DocumentFile = { kind: 'pdf'; url: string } | { kind: 'text'; text: string };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

let sessionExpired: () => void = () => undefined;

/** Called when the API rejects the session token (expired, or the user no longer exists). */
export function onSessionExpired(handler: () => void): void {
  sessionExpired = handler;
}

async function call<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit & { token?: string | null; ownerToken?: string } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.token) headers.set('Authorization', `Bearer ${init.token}`);
  if (init.ownerToken) headers.set('X-Owner-Token', init.ownerToken);
  const res = await fetch(path, { ...init, headers });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && init.token) sessionExpired();
    const msg = (body as { message?: string | string[] } | null)?.message;
    throw new ApiError(res.status, Array.isArray(msg) ? msg.join('; ') : (msg ?? res.statusText));
  }
  return schema.parse(body);
}

const json = (data: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(data),
});

export const api = {
  login: (email: string, password: string): Promise<LoginResponse> =>
    call('/api/auth/login', LoginResponseSchema, json({ email, password })),

  listCases: (token: string): Promise<CaseSummaryView[]> =>
    call('/api/cases', CaseSummaryViewSchema.array(), { token }),

  getCase: (token: string, id: string): Promise<CaseView> =>
    call(`/api/cases/${id}`, CaseViewSchema, { token }),

  upload: (
    token: string,
    file: File,
    ownerEmail: string,
    caseId?: string,
  ): Promise<SubmitDocumentResponse> => {
    const form = new FormData();
    form.append('file', file);
    if (ownerEmail && !caseId) form.append('ownerEmail', ownerEmail);
    const path = caseId ? `/api/cases/${caseId}/documents` : '/api/documents';
    return call(path, SubmitDocumentResponseSchema, { method: 'POST', body: form, token });
  },

  copilot: (token: string, caseId: string, question: string): Promise<CopilotResponse> =>
    call(`/api/cases/${caseId}/copilot`, CopilotResponseSchema, { ...json({ question }), token }),

  /** New owner magic link (replaces the emailed one); 404 where sharing is disabled. */
  ownerLink: (token: string, caseId: string): Promise<OwnerLinkResponse> =>
    call(`/api/cases/${caseId}/owner-link`, OwnerLinkResponseSchema, { method: 'POST', token }),

  /**
   * Authenticated download. PDFs become an object URL for the browser's PDF viewer. Anything else
   * (CFDI XML) comes back as text and is shown escaped: an uploaded XML can carry XHTML <script>, and
   * a blob: URL has this app's origin, so it must never be rendered as a document.
   */
  async documentFile(token: string, documentId: string): Promise<DocumentFile> {
    const res = await fetch(`/api/documents/${documentId}/file`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new ApiError(res.status, res.statusText);
    const type = res.headers.get('content-type') ?? '';
    if (type.startsWith('application/pdf')) {
      const pdf = new Blob([await res.arrayBuffer()], { type: 'application/pdf' });
      return { kind: 'pdf', url: URL.createObjectURL(pdf) };
    }
    return { kind: 'text', text: await res.text() };
  },

  owner: {
    request: (ownerToken: string): Promise<OwnerRequestView> =>
      call('/api/owner/request', OwnerRequestViewSchema, { ownerToken }),
    answer: (ownerToken: string, body: OwnerAnswersRequest): Promise<OwnerAnswerResponse> =>
      call('/api/owner/answers', OwnerAnswerResponseSchema, { ...json(body), ownerToken }),
    upload: (ownerToken: string, file: File): Promise<SubmitDocumentResponse> => {
      const form = new FormData();
      form.append('file', file);
      return call('/api/owner/documents', SubmitDocumentResponseSchema, {
        method: 'POST',
        body: form,
        ownerToken,
      });
    },
  },
};
