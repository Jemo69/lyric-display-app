import { XMLParser } from 'fast-xml-parser';
import createSharedLogger from '../logger.js';

const log = createSharedLogger('BibleXML');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  ignoreDeclaration: true,
  parseAttributeValue: true,
  parseTagValue: true,
  trimValues: true
});

export function xml2json(xml) {
  log.debug(`xml2json: parsing XML, length=${xml?.length || 0}`);
  try {
    return parser.parse(xml);
  } catch (e) {
    log.error('XML parsing error:', e);
    return null;
  }
}

export function detectBibleFormat(content) {
  if (content.includes('XMLBIBLE') && content.includes('BIBLEBOOK')) {
    log.debug('detectBibleFormat: detected zefania format');
    return 'zefania';
  }
  if (content.includes('osisText') && content.includes('osisID')) {
    log.debug('detectBibleFormat: detected osis format');
    return 'osis';
  }
  if (content.includes('bible') && content.includes('b n=') && content.includes('v n=')) {
    log.debug('detectBibleFormat: detected opensong format');
    return 'opensong';
  }
  if (content.includes('bible') && content.includes('verse number=')) {
    log.debug('detectBibleFormat: detected beblia format');
    return 'beblia';
  }
  
  log.debug('detectBibleFormat: format unknown');
  return 'unknown';
}
