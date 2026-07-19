import firaRegular from '../assets/fonts/Fira_Sans/FiraSans-Regular.woff2?url';
import firaItalic from '../assets/fonts/Fira_Sans/FiraSans-Italic.woff2?url';
import firaBold from '../assets/fonts/Fira_Sans/FiraSans-Bold.woff2?url';
import firaBoldItalic from '../assets/fonts/Fira_Sans/FiraSans-BoldItalic.woff2?url';
import interRegular from '../assets/fonts/Inter/Inter-VariableFont_opsz,wght.woff2?url';
import interItalic from '../assets/fonts/Inter/Inter-Italic-VariableFont_opsz,wght.woff2?url';
import latoRegular from '../assets/fonts/Lato/Lato-Regular.woff2?url';
import latoItalic from '../assets/fonts/Lato/Lato-Italic.woff2?url';
import latoBold from '../assets/fonts/Lato/Lato-Bold.woff2?url';
import latoBoldItalic from '../assets/fonts/Lato/Lato-BoldItalic.woff2?url';
import montserratRegular from '../assets/fonts/Montserrat/Montserrat-VariableFont_wght.woff2?url';
import montserratItalic from '../assets/fonts/Montserrat/Montserrat-Italic-VariableFont_wght.woff2?url';
import notoRegular from '../assets/fonts/Noto_Sans/NotoSans-VariableFont_wdth,wght.woff2?url';
import notoItalic from '../assets/fonts/Noto_Sans/NotoSans-Italic-VariableFont_wdth,wght.woff2?url';
import openSansRegular from '../assets/fonts/Open_Sans/OpenSans-VariableFont_wdth,wght.woff2?url';
import openSansItalic from '../assets/fonts/Open_Sans/OpenSans-Italic-VariableFont_wdth,wght.woff2?url';
import poppinsRegular from '../assets/fonts/Poppins/Poppins-Regular.woff2?url';
import poppinsItalic from '../assets/fonts/Poppins/Poppins-Italic.woff2?url';
import poppinsBold from '../assets/fonts/Poppins/Poppins-Bold.woff2?url';
import poppinsBoldItalic from '../assets/fonts/Poppins/Poppins-BoldItalic.woff2?url';
import robotoRegular from '../assets/fonts/Roboto/Roboto-VariableFont_wdth,wght.woff2?url';
import robotoItalic from '../assets/fonts/Roboto/Roboto-Italic-VariableFont_wdth,wght.woff2?url';
import workSansRegular from '../assets/fonts/Work_Sans/WorkSans-VariableFont_wght.woff2?url';
import workSansItalic from '../assets/fonts/Work_Sans/WorkSans-Italic-VariableFont_wght.woff2?url';

const faces = {
  'Fira Sans': [[firaRegular, 400, 'normal'], [firaItalic, 400, 'italic'], [firaBold, 700, 'normal'], [firaBoldItalic, 700, 'italic']],
  Inter: [[interRegular, '100 900', 'normal'], [interItalic, '100 900', 'italic']],
  Lato: [[latoRegular, 400, 'normal'], [latoItalic, 400, 'italic'], [latoBold, 700, 'normal'], [latoBoldItalic, 700, 'italic']],
  Montserrat: [[montserratRegular, '100 900', 'normal'], [montserratItalic, '100 900', 'italic']],
  'Noto Sans': [[notoRegular, '100 900', 'normal'], [notoItalic, '100 900', 'italic']],
  'Open Sans': [[openSansRegular, '100 900', 'normal'], [openSansItalic, '100 900', 'italic']],
  Poppins: [[poppinsRegular, 400, 'normal'], [poppinsItalic, 400, 'italic'], [poppinsBold, 700, 'normal'], [poppinsBoldItalic, 700, 'italic']],
  Roboto: [[robotoRegular, '100 900', 'normal'], [robotoItalic, '100 900', 'italic']],
  'Work Sans': [[workSansRegular, '100 900', 'normal'], [workSansItalic, '100 900', 'italic']],
};

const loaded = new Set();
const pending = new Map();

export function ensureFontLoaded(family) {
  const normalized = typeof family === 'string' ? family.replace(/["']/g, '').trim() : '';
  if (!normalized || loaded.has(normalized) || !faces[normalized] || typeof document === 'undefined') return Promise.resolve();
  if (pending.has(normalized)) return pending.get(normalized);
  const promise = Promise.all(faces[normalized].map(([url, weight, style]) => {
    const font = new FontFace(normalized, `url(${url})`, { weight: String(weight), style, display: 'swap' });
    document.fonts.add(font);
    return font.load();
  })).then(() => loaded.add(normalized)).finally(() => pending.delete(normalized));
  pending.set(normalized, promise);
  return promise;
}
