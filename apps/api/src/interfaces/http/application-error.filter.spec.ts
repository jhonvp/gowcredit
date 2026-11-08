import { describe, expect, it } from 'vitest';
import { ClarificationClosedError } from '../../application/use-cases/answer-clarification.use-case';
import {
  CaseNotFoundError,
  UnsupportedDocumentError,
} from '../../application/use-cases/submit-document.use-case';
import { InvalidAnswerError } from '../../domain/clarification/questions';
import { toHttp } from './application-error.filter';

describe('application error → HTTP', () => {
  it('maps each error to one status, on every route', () => {
    expect(toHttp(new UnsupportedDocumentError('not a pdf')).getStatus()).toBe(415);
    expect(toHttp(new CaseNotFoundError('c1')).getStatus()).toBe(404);
    expect(toHttp(new InvalidAnswerError('bad date')).getStatus()).toBe(422);
    expect(toHttp(new ClarificationClosedError()).getStatus()).toBe(410);
  });

  it('keeps the error message in the body', () => {
    expect(toHttp(new UnsupportedDocumentError('not a pdf')).getResponse()).toMatchObject({
      statusCode: 415,
      message: 'not a pdf',
    });
  });
});
