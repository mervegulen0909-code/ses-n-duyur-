/**
 * Pre-publication filter for user-submitted text.
 *
 * App Store Review Guideline 1.2 requires "a method for filtering objectionable
 * material from being posted to the app" — note *from being posted*. Reporting
 * plus moderator review is reactive and does not satisfy that clause on its own,
 * so this runs on the server before the row is written.
 *
 * Deliberately narrow. A broad word list produces the Scunthorpe problem — real
 * words rejected because they contain a substring — and a comment section that
 * refuses innocent text is worse than one that occasionally needs a moderator.
 * The list therefore holds only unambiguous slurs and obscenities, matched on
 * word boundaries, in the languages the app actually ships in.
 *
 * The evasion handling matters more than the list length: an attacker writes
 * "f.u.c.k" or "sh1t", not the plain form. Normalisation collapses those before
 * matching, which catches far more than adding entries ever would.
 */

/**
 * Unambiguous obscenities and slurs. Matched as whole words after
 * normalisation, so "assess", "Scunthorpe", "classic" and the like are safe.
 *
 * Keep this list SHORT. Anything context-dependent (insults that are also
 * ordinary words, political or religious terms, reclaimed language) belongs to
 * human moderation, not to a regex — see the reporting flow.
 */
const BLOCKED_TERMS = [
  // English
  'fuck',
  'fucking',
  'motherfucker',
  'cunt',
  'nigger',
  'nigga',
  'faggot',
  'retard',
  'whore',
  // Turkish
  'amk',
  'amina',
  'orospu',
  'piç',
  'yarrak',
  'sikeyim',
  'göt',
  // Spanish
  'puta',
  'pendejo',
  'cabron',
  // French
  'putain',
  'salope',
  'connard',
] as const;

/**
 * Characters commonly substituted to slip past a filter, mapped back to the
 * letter they imitate.
 */
const LEET_MAP: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
  '!': 'i',
};

/**
 * Fold text to a comparable form: lower case, accents stripped, leet digits
 * mapped back to letters, and separators inserted between letters removed so
 * "f.u.c.k" and "s h i t" collapse to their plain forms.
 *
 * Separator removal only collapses runs of single letters, so ordinary spacing
 * between words survives and "a fine day" does not become "afineday".
 */
function normalize(text: string): string {
  const lowered = text
    .toLocaleLowerCase('en-US')
    // Turkish dotted/dotless i and other diacritics fold to ASCII so a single
    // list entry covers "PİÇ", "piç" and "pic".
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

  const deLeet = lowered.replace(/[013457@$!]/g, (c) => LEET_MAP[c] ?? c);

  // Collapse letters that were split by punctuation or spaces: three or more
  // single letters in a row separated by non-letters are joined back up.
  return deLeet.replace(/\b(?:[a-z][^a-z0-9]{1,2}){2,}[a-z]\b/g, (run) =>
    run.replace(/[^a-z]/g, ''),
  );
}

/**
 * True when the text contains a blocked term as a whole word.
 *
 * Word-boundary matching is what keeps this usable: without it, "assassin",
 * "Scunthorpe" and "analysis" all trip a naive substring filter.
 */
export function containsObjectionableContent(text: string): boolean {
  const normalized = normalize(text);
  return BLOCKED_TERMS.some((term) => {
    const folded = normalize(term);
    // Escape nothing: every entry is plain letters after normalisation.
    return new RegExp(`(?:^|[^a-z])${folded}(?:[^a-z]|$)`).test(normalized);
  });
}
