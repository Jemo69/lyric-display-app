import { XMLParser } from 'fast-xml-parser';

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
  try {
    return parser.parse(xml);
  } catch (e) {
    console.error('XML parsing error:', e);
    return null;
  }
}

export function detectBibleFormat(content) {
  if (content.includes('"books":') && content.includes('"number":') && content.includes('"text":')) {
    return 'freeshow';
  }
  
  if (content.includes('XMLBIBLE') && content.includes('BIBLEBOOK')) {
    return 'zefania';
  }
  if (content.includes('osisText') && content.includes('osisID')) {
    return 'osis';
  }
  if (content.includes('bible') && content.includes('b n=') && content.includes('v n=')) {
    return 'opensong';
  }
  if (content.includes('bible') && content.includes('verse number=')) {
    return 'beblia';
  }
  
  return 'unknown';
}
