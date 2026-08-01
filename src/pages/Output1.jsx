import RegularOutput from './RegularOutput';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('Output1');

const Output1 = () => {
  logger.info('Output1 mounted');
  return <RegularOutput outputKey="output1" displayName="Output 1" />;
};

export default Output1;
