import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  GoneException,
  type HttpException,
  NotFoundException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ClarificationClosedError } from '../../application/use-cases/answer-clarification.use-case';
import {
  CaseNotFoundError,
  UnsupportedDocumentError,
} from '../../application/use-cases/submit-document.use-case';
import { InvalidAnswerError } from '../../domain/clarification/questions';

type AppError =
  UnsupportedDocumentError | CaseNotFoundError | InvalidAnswerError | ClarificationClosedError;

/**
 * One mapping from application/domain errors to HTTP, for every controller: the same error gets the
 * same status on every route (an unsupported upload is 415 for suppliers and owners alike). The body
 * has Nest's usual shape; the messages are written for clients and carry no document data.
 */
@Catch(UnsupportedDocumentError, CaseNotFoundError, InvalidAnswerError, ClarificationClosedError)
export class ApplicationErrorFilter implements ExceptionFilter<AppError> {
  catch(error: AppError, host: ArgumentsHost): void {
    const http = toHttp(error);
    host.switchToHttp().getResponse<Response>().status(http.getStatus()).json(http.getResponse());
  }
}

export function toHttp(error: AppError): HttpException {
  if (error instanceof UnsupportedDocumentError)
    return new UnsupportedMediaTypeException(error.message);
  if (error instanceof CaseNotFoundError) return new NotFoundException(error.message);
  if (error instanceof InvalidAnswerError) return new UnprocessableEntityException(error.message);
  return new GoneException(error.message);
}
