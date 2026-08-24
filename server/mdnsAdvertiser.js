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

  const publish = (serviceName, allowRetry) => {
    const service = bonjourInstance.publish({
      name: serviceName,
      type: SERVICE_TYPE,
      port,
      txt,
    });

    service.on('up', () => {
      log.info(`Advertising _lyricdisplay._tcp as "${serviceName}" on port ${port}`);
    });

    service.on('error', (error) => {
      // Name collisions happen when a second desktop runs on the same LAN.
      // Retry once with a suffix; otherwise degrade gracefully — discovery
      // still works via subnet sweep / manual IP / QR.
      if (allowRetry && serviceName === name) {
        log.warn(`mDNS name "${serviceName}" in use, retrying with suffix`);
        try {
          service.stop(() => {});
        } catch (_) {
          // ignore
        }
        publishedService = publish(`${name} #${process.pid % 1000}`, false);
        return;
      }
      log.warn('mDNS advertisement failed (non-critical):', error.message);
      publishedService = null;
    });

    return service;
  };

  publishedService = publish(name, true);
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
