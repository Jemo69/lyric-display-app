/**
 * shared/speech/numberDictionary.js — spoken numbers in eight languages
 * (Phase 3).
 *
 * WHY THIS FILE EXISTS. Selah ships in 60+ UI languages and is used by
 * churches across Europe, Africa, and Latin America. `wordsToDigits` understood
 * English only, so for a French- or Norwegian-speaking congregation the
 * detector heard "Jean trois seize" and could not turn it into "John 3:16" — the
 * feature was effectively English-only while the app was not.
 *
 * The numbers themselves are language-independent arithmetic. What differs is
 * the VOCABULARY. So the parsing state machine stays in
 * `src/speech/spokenForm.js` untouched and only its lookup tables are pulled
 * out here. That split is the whole design: one parser, eight vocabularies,
 * and a new language is a data change rather than a code change.
 *
 * SCOPE IS DELIBERATE. Only 0-100 plus the scale words appear, because a Bible
 * citation is `Book Chapter:Verse` and both numbers are below 200. "two hundred
 * and thirty" appears because it costs one entry and appears in preaching, but
 * nothing above a thousand is supported because nothing in a scripture citation
 * needs it.
 *
 * ACCENTS MATTER. French, Spanish, Portuguese, German, and Norwegian all carry
 * accented characters, and speech-to-text DOES emit them. So the accented forms
 * are the primary entries here and the unaccented forms are also present,
 * because a Windows input method may produce either for the same word.
 *
 * NO LOGGING, NO I/O. Static data and pure lookups.
 */

/**
 * @typedef {object} LocaleNumbers
 * @property {Record<string, number>} cardinals  "three" -> 3
 * @property {Record<string, number>} ordinals   "third" -> 3
 * @property {Record<string, number>} scales     "hundred" -> 100
 * @property {string[]} joiners  words that join parts of ONE compound number
 *   after a SCALE word ("two hundred AND twenty one"). Deliberately separate
 *   from cardinals: "and" is a joiner in English but is ALSO an ordinary word,
 *   so it must only be skipped when a scale has just been seen.
 * @property {string[]} [tensJoiners] words that join after a TENS word, for
 *   languages that write "vingt et un" (21) rather than "vingt-et-un" or
 *   "twenty-one". English has none — it uses the scale joiner and a hyphen —
 *   which is why this is optional rather than required.
 */

/** English — the original vocabulary, moved verbatim so behaviour cannot drift. */
const EN = Object.freeze({
  cardinals: {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
    eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
    fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
    nineteen: 19, twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50,
    sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  },
  ordinals: {
    first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7,
    eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13,
    fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17,
    eighteenth: 18, nineteenth: 19, twentieth: 20, thirtieth: 30,
    fortieth: 40, fiftieth: 50, sixtieth: 60, seventieth: 70, eightieth: 80,
    ninetieth: 90,
  },
  scales: { hundred: 100, thousand: 1000, million: 1000000 },
  joiners: ['and'],
  // English writes 21 as "twenty-one" or "twenty one" — never "twenty and
  // one". The scale joiner is for "two hundred AND twenty one" only.
  tensJoiners: [],
});

/** French — "Jean trois seize" -> John 3:16. */
const FR = Object.freeze({
  cardinals: {
    zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6,
    sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13,
    quatorze: 14, quinze: 15, seize: 16, dixsept: 17, dixhuit: 18,
    dixneuf: 19, vingt: 20, trente: 30, quarante: 40, cinquante: 50,
    soixante: 60, soixante_dix: 70, soixante_dix_neuf: 79, quatre_vingt: 80,
    quatre_vingt_dix: 90,
  },
  ordinals: {
    premier: 1, première: 1, deuxième: 2, second: 2, troisième: 3,
    quatrième: 4, cinquième: 5, sixième: 6, septième: 7, huitième: 8,
    neuvième: 9, dixième: 10, onzième: 11, douzième: 12, treizième: 13,
    quatorzième: 14, quinzième: 15, seizième: 16, dixseptième: 17,
    dixhuitième: 18, dixneuvième: 19, vingtième: 20, trentième: 30,
    quarantième: 40, cinquantième: 50, soixanteième: 60,
  },
  scales: { cent: 100, cents: 100, mille: 1000, millions: 1000000 },
  joiners: [],
  // "vingt et un" is 21 and "soixante et onze" is 71. French puts a joiner
  // after a TENS word, which the English rule (join only after a scale) does
  // not cover — without this, "vingt-et-un" parsed as "20 et 1".
  tensJoiners: ['et'],
});

/** Spanish — "Juan tres dieciséis" -> John 3:16. */
const ES = Object.freeze({
  cardinals: {
    cero: 0, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
    siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13,
    catorce: 14, quince: 15, dieciséis: 16, dieciseis: 16, diecisiete: 17,
    dieciocho: 18, diecinueve: 19, veinte: 20, treinta: 30, cuarenta: 40,
    cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
  },
  ordinals: {
    primero: 1, primer: 1, segunda: 2, segundo: 2, tercero: 3, tercer: 3,
    cuarta: 4, cuarto: 4, quinto: 5, sexto: 6, septimo: 7, séptimo: 7,
    octavo: 8, noveno: 9, décimo: 10, decimo: 10, undécimo: 11,
    duodécimo: 12, decimotercero: 13, decimocuarto: 14, decimoquinto: 15,
    decimosexto: 16, decimoséptimo: 17, decimoctavo: 18, decimonoveno: 19,
    vigésimo: 20, vigesimo: 20, trigésimo: 30, cuadragésimo: 40,
    quincuagésimo: 50, sexagésimo: 60,
  },
  scales: { cien: 100, ciento: 100, mil: 1000, millón: 1000000, millon: 1000000 },
  joiners: ['y'],
  // Spanish writes 21 as "veintiuno" — one word. No tens joiner.
  tensJoiners: [],
});

/** German — "Johannes drei sechzehn" -> John 3:16. */
const DE = Object.freeze({
  cardinals: {
    null: 0, eins: 1, ein: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, funf: 5,
    sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12,
    zwolf: 12, dreizehn: 13, vierzehn: 14, fünfzehn: 15, funfzehn: 15,
    sechzehn: 16, siebzehn: 17, siebenzehn: 17, achtzehn: 18, neunzehn: 19,
    zwanzig: 20, dreißig: 30, dreissig: 30, vierzig: 40, fünfzig: 50,
    funfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90,
  },
  ordinals: {
    erste: 1, erster: 1, ersten: 1, zweite: 2, zweiter: 2, dritte: 3,
    vierte: 4, fünfte: 5, sechste: 6, siebte: 7, achte: 8, neunte: 9,
    zehnte: 10, elfte: 11, zwölfte: 12, dreizehnte: 13, vierzehnte: 14,
    fünfzehnte: 15, sechzehnte: 16, siebzehnte: 17, achtzehnte: 18,
    neunzehnte: 19, zwanzigste: 20, dreißigste: 30, vierzigste: 40,
    fünfzigste: 50, sechzigste: 60,
  },
  scales: { hundert: 100, tausend: 1000, million: 1000000 },
  joiners: ['und'],
  // German writes 21 as "einundzwanzig" — one word. There is no tens joiner.
  tensJoiners: [],
});

/** Portuguese — "João três dezesseis" -> John 3:16. */
const PT = Object.freeze({
  cardinals: {
    zero: 0, um: 1, uma: 1, dois: 2, duas: 2, três: 3, tres: 3, quatro: 4,
    cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
    treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16,
    dezesseis: 16, dezassete: 17, dezoito: 18, dezanove: 19, vinte: 20,
    trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70,
    oitenta: 80, noventa: 90,
  },
  ordinals: {
    primeiro: 1, primeira: 1, segundo: 2, segunda: 2, terceiro: 3, terceira: 3,
    quarto: 4, quinta: 5, sexto: 6, sétimo: 7, setimo: 7, oitavo: 8, nono: 9,
    décimo: 10, decimo: 10,vigésimo: 20, vigesimo: 20, trigésimo: 30,
  },
  scales: { cem: 100, cento: 100, mil: 1000, milhão: 1000000, milhao: 1000000 },
  joiners: ['e'],
  // "vinte e um" is 21. Same shape as French.
  tensJoiners: ['e'],
});

/** Italian — "Giovanni tre sedici" -> John 3:16. */
const IT = Object.freeze({
  cardinals: {
    zero: 0, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6,
    sette: 7, otto: 8, nove: 9, dieci: 10, undici: 11, dodici: 12, tredici: 13,
    quattordici: 14, quindici: 15, sedici: 16, diciassette: 17,
    diciotto: 18, diciannove: 19, venti: 20, trenta: 30, quaranta: 40,
    cinquanta: 50, sessanta: 60, settanta: 70, ottanta: 80, novanta: 90,
  },
  ordinals: {
    primo: 1, prima: 1, secondo: 2, seconda: 2, terzo: 3, terza: 3,
    quarto: 4, quarta: 4, quinto: 5, sesto: 6, settimo: 7, ottavo: 8,
    nono: 9, decimo: 10, undicesimo: 11, dodicesimo: 12, ventesimo: 20,
    trentesimo: 30, quarantesimo: 40,
  },
  scales: { cento: 100, mille: 1000, mila: 1000, milione: 1000000 },
  joiners: [],
  // Italian writes 21 as "ventuno" — one word. No tens joiner.
  tensJoiners: [],
});

/** Dutch — "Johannes drie zestien" -> John 3:16. */
const NL = Object.freeze({
  cardinals: {
    nul: 0, een: 1, één: 1, twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6,
    zeven: 7, acht: 8, negen: 9, tien: 10, elf: 11, twaalf: 12, dertien: 13,
    veertien: 14, vijftien: 15, zestien: 16, zeventien: 17, achttien: 18,
    negentien: 19, twintig: 20, dertig: 30, veertig: 40, vijftig: 50,
    zestig: 60, zeventig: 70, tachtig: 80, negentig: 90,
  },
  ordinals: {
    eerste: 1, eerste_: 1, tweede: 2, derde: 3, vierde: 4, vijfde: 5,
    zesde: 6, zevende: 7, achtste: 8, negende: 9, tiende: 10, elfde: 11,
    twaalfde: 12, dertiende: 13, veertiende: 14, vijftiende: 15,
    zestiende: 16, zeventiende: 17, achttiende: 18, negentiende: 19,
    twintigste: 20, dertigste: 30, veertigste: 40,
  },
  scales: { honderd: 100, duizend: 1000, miljoen: 1000000 },
  joiners: ['en'],
  // Dutch writes 21 as "eenentwintig" — one word. No tens joiner.
  tensJoiners: [],
});

/** Norwegian — "Johannes tre seksten" -> John 3:16. */
const NO = Object.freeze({
  cardinals: {
    null: 0, en: 1, én: 1, ett: 1, to: 2, tre: 3, fire: 4, fem: 5, seks: 6,
    sju: 7, syv: 7, åtte: 8, atte: 8, ni: 9, ti: 10, elleve: 11, tolv: 12,
    tretten: 13, fjorten: 14, femten: 15, seksten: 16,
    sytten: 17, atten: 18, nitten: 19, tjue: 20, tretti: 30, førti: 40,
    femti: 50, seksti: 60, sytti: 70, åtti: 80, nitti: 90,
  },
  ordinals: {
    første: 1, andre: 2, tredje: 3, fjerde: 4, femte: 5, sjette: 6,
    sjuende: 7, åttende: 8, niende: 9, tiende: 10, ellevte: 11, tolvte: 12,
    trettende: 13, fjortende: 14, femtende: 15, sekstende: 16,
    syttende: 17, attende: 18, nittende: 19, tjuende: 20, trettiende: 30,
  },
  scales: { hundre: 100, tusen: 1000, million: 1000000 },
  joiners: ['og'],
  // Norwegian writes 21 as "tjueen" — one word. No tens joiner.
  tensJoiners: [],
});

/**
 * Every supported locale.
 *
 * Keys are the app's UI locale tags, lower-cased and region-stripped
 * (`pt_BR` -> `pt`, `fr_FR` -> `fr`, `en_GB` -> `en`) so a regional variant
 * resolves to its language without a second entry.
 */
export const NUMBER_DICTIONARIES = Object.freeze({
  en: EN,
  fr: FR,
  es: ES,
  de: DE,
  pt: PT,
  it: IT,
  nl: NL,
  no: NO,
});

/** English is the fallback for every unknown locale. */
export const DEFAULT_LOCALE = 'en';

/**
 * Reduce a UI locale tag to a dictionary key.
 *
 * "pt_BR" -> "pt", "en_GB" -> "en", "fr" -> "fr", "de-AT" -> "de".
 *
 * @param {string|null|undefined} locale
 * @returns {string} a key present in NUMBER_DICTIONARIES
 */
export function resolveLocale(locale) {
  if (typeof locale !== 'string') return DEFAULT_LOCALE;
  const base = locale.trim().toLowerCase().split(/[-_]/)[0];
  return Object.prototype.hasOwnProperty.call(NUMBER_DICTIONARIES, base) ? base : DEFAULT_LOCALE;
}

/**
 * The dictionary for a locale.
 *
 * @param {string|null|undefined} locale
 * @returns {LocaleNumbers}
 */
export function dictionaryFor(locale) {
  return NUMBER_DICTIONARIES[resolveLocale(locale)];
}

/** The locale keys this module actually serves. */
export const SUPPORTED_LOCALES = Object.freeze(Object.keys(NUMBER_DICTIONARIES));

export default dictionaryFor;