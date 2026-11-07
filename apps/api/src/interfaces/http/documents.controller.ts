import { createHash } from 'node:crypto';
import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UnsupportedMediaTypeException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { CaseView, SubmitDocumentResponse } from '@gowcredit/contracts';
import {
  CASE_REPOSITORY_PORT,
  type CaseRepositoryPort,
} from '../../application/ports/case-repository.port';
import {
  MAX_DOCUMENT_BYTES,
  SubmitDocumentUseCase,
  UnsupportedDocumentError,
} from '../../application/use-cases/submit-document.use-case';
import { toCaseView } from './case.presenter';

/** The fields of a Multer in-memory upload this controller uses. */
interface MulterFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

/** Document intake and case status. Auth guards arrive with the auth PR (ADR 0005). */
@Controller()
export class DocumentsController {
  constructor(
    private readonly submit: SubmitDocumentUseCase,
    @Inject(CASE_REPOSITORY_PORT) private readonly cases: CaseRepositoryPort,
  ) {}

  @Post('documents')
  @HttpCode(202)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 } }))
  async upload(@UploadedFile() file?: MulterFile): Promise<SubmitDocumentResponse> {
    if (!file) throw new BadRequestException('multipart field "file" is required');
    try {
      const created = await this.submit.execute({
        originalName: file.originalname,
        mimeType: file.mimetype,
        bytes: file.buffer,
        sha256: createHash('sha256').update(file.buffer).digest('hex'),
      });
      return {
        caseId: created.id,
        documentId: created.documents[0]?.id as string,
        status: created.status,
      };
    } catch (e) {
      if (e instanceof UnsupportedDocumentError) throw new UnsupportedMediaTypeException(e.message);
      throw e;
    }
  }

  @Get('cases/:id')
  async getCase(@Param('id', new ParseUUIDPipe()) id: string): Promise<CaseView> {
    const found = await this.cases.findCase(id);
    if (!found) throw new NotFoundException('case not found');
    return toCaseView(found);
  }
}
