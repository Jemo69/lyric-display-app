import RegularOutput from './RegularOutput';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('Output2');

const Output2 = () => {
  logger.info('Output2 mounted');
  return <RegularOutput outputKey="output2" displayName="Output 2" />;
};

export default Output2;
