import StageOutput from './StageOutput';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('Stage');

const Stage = () => {
  logger.info('Stage mounted');
  return <StageOutput outputKey="stage" displayName="Stage" />;
};

export default Stage;
