const XML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/**
 * XML defines only five named entities, so this covers the whole grammar.
 *
 * Plex answers several endpoints in XML and Bun ships no XML parser, but the
 * documents are flat attribute data, which HTMLRewriter reads correctly. It
 * lowercases attribute names and leaves entities encoded; the first is a
 * caller's problem, the second is this function's.
 */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (match, ref: string) => {
    if (ref.startsWith("#x") || ref.startsWith("#X")) {
      return String.fromCodePoint(parseInt(ref.slice(2), 16));
    }
    if (ref.startsWith("#")) return String.fromCodePoint(parseInt(ref.slice(1), 10));
    return XML_ENTITIES[ref] ?? match;
  });
}
