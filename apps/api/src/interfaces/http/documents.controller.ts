import { createHash } from 'node:crypto';
import {
  StreamableFile,
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UnsupportedMediaTypeException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { CaseSummaryView, CaseView, SubmitDocumentResponse } from '@gowcredit/contracts';
import {
  CASE_REPOSITORY_PORT,
  type CaseRepositoryPort,
} from '../../application/ports/case-repository.port';
import {
  OBJECT_STORAGE_PORT,
  type ObjectStoragePort,
} from '../../application/ports/object-storage.port';
import {
  CLARIFICATION_REPOSITORY_PORT,
  type ClarificationRepositoryPort,
} from '../../application/ports/clarification.ports';
import {
  CaseNotFoundError,
  MAX_DOCUMENT_BYTES,
  SubmitDocumentUseCase,
  UnsupportedDocumentError,
} from '../../application/use-cases/submit-document.use-case';
import { canReadCase, type Principal, submittingSupplier } from '../../domain/auth/principal';
import { CurrentPrincipal, Roles } from '../../infrastructure/auth/guards';
import { toCaseView } from './case.presenter';

/** The fields of a Multer in-memory upload this controller uses. */
interface MulterFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

/**
 * Document intake and case status (ADR 0005): suppliers (JWT) and integrations (X-API-Key) submit;
 * analysts read every case; suppliers read their own. Another supplier's case answers 404.
 */
@Controller()
export class DocumentsController {
  constructor(
    private readonly submit: SubmitDocumentUseCase,
    @Inject(CASE_REPOSITORY_PORT) private readonly cases: CaseRepositoryPort,
    @Inject(CLARIFICATION_REPOSITORY_PORT) private readonly requests: ClarificationRepositoryPort,
    @Inject(OBJECT_STORAGE_PORT) private readonly storage: ObjectStoragePort,
  ) {}

  /** The original file, for the analyst's side-by-side view. Same access rule as the case. */
  @Get('documents/:id/file')
  async file(
    @CurrentPrincipal() p: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<StreamableFile> {
    const doc = await this.cases.findDocument(id);
    const c = doc ? await this.cases.findCase(doc.caseId) : null;
    if (!doc || !c || !canReadCase(p, c)) throw new NotFoundException('document not found');
    const bytes = await this.storage.get(doc.storageKey);
    return new StreamableFile(Buffer.from(bytes), {
      type: doc.mimeType,
      disposition: `inline; filename="${doc.originalName.replace(/[^\w.-]/g, '_')}"`,
    });
  }

  /** Multipart: `file`, optional `ownerEmail` (who answers questions; defaults to the supplier). */
  @Post('documents')
  @Roles('supplier')
  @HttpCode(202)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 } }))
  upload(
    @CurrentPrincipal() p: Principal,
    @Body('ownerEmail') ownerEmail?: string,
    @UploadedFile() file?: MulterFile,
  ): Promise<SubmitDocumentResponse> {
    return this.receive(p, file, { ownerEmail });
  }

  /** Adds a document to an existing case: a statement and an invoice are decided together. */
  @Post('cases/:id/documents')
  @Roles('supplier')
  @HttpCode(202)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 } }))
  addToCase(
    @CurrentPrincipal() p: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file?: MulterFile,
  ): Promise<SubmitDocumentResponse> {
    return this.receive(p, file, { caseId: id });
  }

  /** Most recent cases: all for analysts, own for suppliers and their keys. */
  @Get('cases')
  async list(
    @CurrentPrincipal() p: Principal,
    @Query('limit') limit?: string,
  ): Promise<CaseSummaryView[]> {
    const n = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const analyst = p.kind === 'user' && p.role === 'analyst';
    const rows = await this.cases.listCases({
      supplierId: analyst
        ? undefined
        : (submittingSupplier(p) ?? '00000000-0000-0000-0000-000000000000'),
      limit: n,
    });
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      outcome: r.outcome,
      documentCount: r.documentCount,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  private async receive(
    p: Principal,
    file: MulterFile | undefined,
    opts: { caseId?: string; ownerEmail?: string },
  ): Promise<SubmitDocumentResponse> {
    const supplierId = submittingSupplier(p);
    if (!supplierId) throw new ForbiddenException('only suppliers can submit documents');
    if (!file) throw new BadRequestException('multipart field "file" is required');
    const ownerEmail = opts.ownerEmail?.trim() || (p.kind === 'user' ? p.email : null);
    if (ownerEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail))
      throw new BadRequestException('ownerEmail is not a valid email');
    try {
      const updated = await this.submit.execute(
        {
          originalName: file.originalname,
          mimeType: file.mimetype,
          bytes: file.buffer,
          sha256: createHash('sha256').update(file.buffer).digest('hex'),
        },
        { supplierId, ownerEmail, caseId: opts.caseId },
      );
      return {
        caseId: updated.id,
        documentId: updated.documents[updated.documents.length - 1]?.id as string,
        status: updated.status,
      };
    } catch (e) {
      if (e instanceof UnsupportedDocumentError) throw new UnsupportedMediaTypeException(e.message);
      if (e instanceof CaseNotFoundError) throw new NotFoundException(e.message);
      throw e;
    }
  }

  @Get('cases/:id')
  async getCase(
    @CurrentPrincipal() p: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<CaseView> {
    const found = await this.cases.findCase(id);
    if (!found || !canReadCase(p, found)) throw new NotFoundException('case not found');
    return toCaseView(found, await this.requests.listByCase(found.id));
  }
}
