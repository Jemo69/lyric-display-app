// src/pages/ControlPanel.jsx

import React from 'react';
import LyricDisplayApp from '../components/LyricDisplayApp';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ControlPanel');

const ControlPanel = () => {
  logger.info('ControlPanel mounted');
  return (
  <div className="w-full h-full text-black font-grotesk">
    <LyricDisplayApp />
  </div>
  );
};

export default ControlPanel;