import { CaseOrmEntity } from './case.orm-entity';
import { DecisionOrmEntity } from './decision.orm-entity';
import { DocumentOrmEntity } from './document.orm-entity';
import { ExtractionOrmEntity } from './extraction.orm-entity';

export const ORM_ENTITIES = [
  CaseOrmEntity,
  DocumentOrmEntity,
  ExtractionOrmEntity,
  DecisionOrmEntity,
];
export { CaseOrmEntity, DecisionOrmEntity, DocumentOrmEntity, ExtractionOrmEntity };
