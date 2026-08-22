// server/mdnsAdvertiser.js
// Advertises LyricDisplay on the local network via mDNS/Bonjour so mobile
// controllers can discover the desktop without typing an IP address.
import bonjour from 'bonjour';
import createServerLogger from './logger.js';

const log = createServerLogger('mDNS');

const SERVICE_TYPE = 'lyricdisplay';

let bonjourInstance = null;
let publishedService = null;

function advertise({ name, port, txt = {} }) {
  if (publishedService) return publishedService;

  bonjourInstance = bonjour();
  publishedService = bonjourInstance.publish({
    name,
    type: SERVICE_TYPE,
    port,
    txt,
  });

  publishedService.on('up', () => {
    log.info(`Advertising _lyricdisplay._tcp as "${name}" on port ${port}`);
  });

  return publishedService;
}

function unadvertise() {
  try {
    publishedService?.stop(() => {});
    publishedService = null;
  } catch (error) {
    log.warn('mDNS unadvertise failed (non-critical):', error.message);
  }
  try {
    bonjourInstance?.destroy();
    bonjourInstance = null;
  } catch (error) {
    log.warn('mDNS teardown failed (non-critical):', error.message);
  }
}

export default { advertise, unadvertise };
