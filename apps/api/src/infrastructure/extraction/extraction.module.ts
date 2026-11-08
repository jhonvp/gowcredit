import { Module } from '@nestjs/common';
import { ToolLoopAgent } from '../../application/agents/tool-loop-agent';
import { AGENT_PORT, type AgentPort } from '../../application/ports/agent.port';
import {
  DOCUMENT_TEXT_PORT,
  type DocumentTextPort,
} from '../../application/ports/document-text.port';
import { LLM_PORT, type LlmPort } from '../../application/ports/llm.port';
import { LOGGER_PORT, type LoggerPort } from '../../application/ports/logger.port';
import {
  STATEMENT_EXTRACTORS,
  type StatementExtractorPort,
} from '../../application/ports/statement-extractor.port';
import { ExtractBankStatementUseCase } from '../../application/use-cases/extract-bank-statement.use-case';
import { AppConfig } from '../config/app-config';
import { createLlm } from '../llm/create-llm';
import { T3LlmStatementExtractor } from './llm/t3-llm-statement-extractor';
import { T4RepairAgentExtractor } from './llm/t4-repair-agent-extractor';
import { T1OcrStatementExtractor } from './ocr/t1-ocr-statement-extractor';
import { TesseractOcrAdapter } from './ocr/tesseract-ocr.adapter';
import { PopplerTextAdapter } from './pdf/poppler-text.adapter';
import { T0StatementExtractor } from './t0/t0-statement-extractor';
import { T2ClassifierStatementExtractor } from './t2/t2-classifier-statement-extractor';

/**
 * Extraction cascade wiring (ADR 0002/0003/0004/0010). Tier order is cost order:
 * T0 deterministic → T1 OCR → T2 line classifier → T3 Haiku → T4 Opus repair agent.
 */
@Module({
  providers: [
    { provide: DOCUMENT_TEXT_PORT, useValue: new PopplerTextAdapter() },
    {
      provide: LLM_PORT,
      inject: [AppConfig, LOGGER_PORT],
      useFactory: (config: AppConfig, logger: LoggerPort) => createLlm(config.llm, logger),
    },
    {
      provide: AGENT_PORT,
      inject: [LLM_PORT, LOGGER_PORT],
      useFactory: (llm: LlmPort, logger: LoggerPort) => new ToolLoopAgent(llm, logger),
    },
    {
      provide: STATEMENT_EXTRACTORS,
      inject: [LLM_PORT, AGENT_PORT],
      useFactory: (llm: LlmPort, agent: AgentPort): StatementExtractorPort[] => [
        new T0StatementExtractor(),
        new T1OcrStatementExtractor(new TesseractOcrAdapter()),
        new T2ClassifierStatementExtractor(),
        new T3LlmStatementExtractor(llm),
        new T4RepairAgentExtractor(agent),
      ],
    },
    {
      provide: ExtractBankStatementUseCase,
      inject: [DOCUMENT_TEXT_PORT, STATEMENT_EXTRACTORS, LOGGER_PORT],
      useFactory: (text: DocumentTextPort, tiers: StatementExtractorPort[], logger: LoggerPort) =>
        new ExtractBankStatementUseCase(text, tiers, logger),
    },
  ],
  exports: [ExtractBankStatementUseCase, LLM_PORT, AGENT_PORT],
})
export class ExtractionModule {}
