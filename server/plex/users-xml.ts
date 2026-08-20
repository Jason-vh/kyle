/** A user plex.tv reports as having a share on one of the owner's servers. */
export interface PlexShareListUser {
  accountId: string;
  /** Empty for managed Home users, who cannot sign in with their own Plex account. */
  username: string;
  title: string;
  /** Machine identifiers of the owner's servers this user has an accepted share on. */
  machineIdentifiers: string[];
}

const XML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/** XML defines only five named entities, so this covers the whole grammar. */
function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (match, ref: string) => {
    if (ref.startsWith("#x") || ref.startsWith("#X")) {
      return String.fromCodePoint(parseInt(ref.slice(2), 16));
    }
    if (ref.startsWith("#")) return String.fromCodePoint(parseInt(ref.slice(1), 10));
    return XML_ENTITIES[ref] ?? match;
  });
}

/**
 * Parses plex.tv's `/api/users` share list.
 *
 * The response is XML and Bun ships no XML parser, but the document is flat
 * attribute data, so HTMLRewriter reads it correctly. It lowercases attribute
 * names and leaves entities encoded, both of which are handled here.
 */
export async function parseShareList(xml: string): Promise<PlexShareListUser[]> {
  const users: PlexShareListUser[] = [];
  let current: PlexShareListUser | null = null;

  await new HTMLRewriter()
    .on("user", {
      element(el) {
        current = {
          accountId: el.getAttribute("id") ?? "",
          username: decodeEntities(el.getAttribute("username") ?? ""),
          title: decodeEntities(el.getAttribute("title") ?? ""),
          machineIdentifiers: [],
        };
        if (current.accountId) users.push(current);
      },
    })
    .on("server", {
      element(el) {
        // Servers follow their parent user in document order.
        const machineId = el.getAttribute("machineidentifier");
        const accepted = el.getAttribute("pending") !== "1";
        if (current && machineId && accepted) current.machineIdentifiers.push(machineId);
      },
    })
    .transform(new Response(xml))
    .text();

  return users;
}
