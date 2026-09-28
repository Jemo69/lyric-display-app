// src/speech/bookAliases.js — convenience re-export.
//
// The confusion table itself is static data and lives in
// shared/bible/bookAliases.js (plan 11 detector 2: "A static data table
// in shared/bible/bookAliases.js"). This module exists so speech code can
// import the table from the same directory as the rest of the engine.

export {
  BOOK_ALIAS_ROWS,
  CANONICAL_BOOK_NAMES,
  STRIPPED_PHRASES,
  lookupBookAlias,
  resolveBookAlias,
  stripBookPrefix,
} from 'shared/bible/bookAliases.js';
