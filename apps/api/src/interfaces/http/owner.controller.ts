import { createHash } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  type OwnerAnswerResponse,
  OwnerAnswersRequestSchema,
  type OwnerRequestView,
  type SubmitDocumentResponse,
} from '@gowcredit/contracts';
import {
  CASE_REPOSITORY_PORT,
  type CaseRepositoryPort,
} from '../../application/ports/case-repository.port';
import {
  CLARIFICATION_REPOSITORY_PORT,
  type ClarificationRepositoryPort,
} from '../../application/ports/clarification.ports';
import { AnswerClarificationUseCase } from '../../application/use-cases/answer-clarification.use-case';
import {
  MAX_DOCUMENT_BYTES,
  SubmitDocumentUseCase,
} from '../../application/use-cases/submit-document.use-case';
import type { Principal } from '../../domain/auth/principal';
import { CurrentPrincipal, Public } from '../../infrastructure/auth/guards';

interface MulterFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

/**
 * Document owner endpoints, authenticated only by the magic link (X-Owner-Token). The owner sees
 * the open questions of one case (no amounts or other documents), answers them, or uploads a document.
 */
@Controller('owner')
@Public()
@UseGuards(AuthGuard('magic-link'))
export class OwnerController {
  constructor(
    @Inject(CLARIFICATION_REPOSITORY_PORT) private readonly requests: ClarificationRepositoryPort,
    @Inject(CASE_REPOSITORY_PORT) private readonly cases: CaseRepositoryPort,
    private readonly answer: AnswerClarificationUseCase,
    private readonly submit: SubmitDocumentUseCase,
  ) {}

  @Get('request')
  async request(@CurrentPrincipal() p: Principal): Promise<OwnerRequestView> {
    const r = p.kind === 'owner' ? await this.requests.findById(p.requestId) : null;
    if (!r) throw new NotFoundException();
    return {
      round: r.round,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      questions: r.questions.map((q) => ({ code: q.code, type: q.type, text: q.text })),
    };
  }

  @Post('answers')
  @HttpCode(200)
  async answers(
    @CurrentPrincipal() p: Principal,
    @Body() body: unknown,
  ): Promise<OwnerAnswerResponse> {
    if (p.kind !== 'owner') throw new NotFoundException();
    const parsed = OwnerAnswersRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Las respuestas enviadas no son válidas');
    return this.answer.execute(p.requestId, parsed.data.answers);
  }

  /** Uploads a requested document (recent statement, corrected XML) into the owner's case. */
  @Post('documents')
  @HttpCode(202)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 } }))
  async upload(
    @CurrentPrincipal() p: Principal,
    @UploadedFile() file?: MulterFile,
  ): Promise<SubmitDocumentResponse> {
    if (p.kind !== 'owner') throw new NotFoundException();
    if (!file) throw new BadRequestException('Seleccione un archivo');
    const c = await this.cases.findCase(p.caseId);
    if (!c) throw new NotFoundException();
    const updated = await this.submit.execute(
      {
        originalName: file.originalname,
        mimeType: file.mimetype,
        bytes: file.buffer,
        sha256: createHash('sha256').update(file.buffer).digest('hex'),
      },
      { supplierId: c.supplierId, caseId: c.id },
    );
    return {
      caseId: updated.id,
      documentId: updated.documents[updated.documents.length - 1]?.id as string,
      status: updated.status,
    };
  }
}
