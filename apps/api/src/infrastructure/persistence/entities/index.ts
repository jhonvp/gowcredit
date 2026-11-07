import { CaseOrmEntity } from './case.orm-entity';
import { ClarificationOrmEntity } from './clarification.orm-entity';
import { DecisionOrmEntity } from './decision.orm-entity';
import { DocumentOrmEntity } from './document.orm-entity';
import { ExtractionOrmEntity } from './extraction.orm-entity';
import { ApiKeyOrmEntity, UserOrmEntity } from './user.orm-entity';

export const ORM_ENTITIES = [
  CaseOrmEntity,
  DocumentOrmEntity,
  ExtractionOrmEntity,
  DecisionOrmEntity,
  UserOrmEntity,
  ApiKeyOrmEntity,
  ClarificationOrmEntity,
];
export {
  ApiKeyOrmEntity,
  CaseOrmEntity,
  ClarificationOrmEntity,
  DecisionOrmEntity,
  DocumentOrmEntity,
  ExtractionOrmEntity,
  UserOrmEntity,
};
