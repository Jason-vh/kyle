import { decodeEntities } from "./xml.ts";

/** One of the owner's servers, shared with a user. */
export interface PlexServerShare {
  /** Identifies the share itself, which is what revoking one is addressed to. */
  id: string;
  machineIdentifier: string;
  /** Invited, but not yet taken up. */
  pending: boolean;
}

/** A user plex.tv reports as having a share on one of the owner's servers. */
export interface PlexShareListUser {
  accountId: string;
  /** Empty for managed Home users, who cannot sign in with their own Plex account. */
  username: string;
  title: string;
  email: string;
  /** Publicly fetchable avatar URL. */
  thumb: string;
  shares: PlexServerShare[];
}

/** How a user stands on one particular server, if they are on it at all. */
export function shareOn(
  user: PlexShareListUser,
  machineIdentifier: string,
): PlexServerShare | undefined {
  return user.shares.find((share) => share.machineIdentifier === machineIdentifier);
}

/** Parses plex.tv's `/api/users` share list. */
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
          email: decodeEntities(el.getAttribute("email") ?? ""),
          thumb: decodeEntities(el.getAttribute("thumb") ?? ""),
          shares: [],
        };
        if (current.accountId) users.push(current);
      },
    })
    .on("server", {
      element(el) {
        // Servers follow their parent user in document order.
        const machineIdentifier = el.getAttribute("machineidentifier");
        const id = el.getAttribute("id");
        if (!current || !machineIdentifier || !id) return;
        current.shares.push({
          id,
          machineIdentifier,
          pending: el.getAttribute("pending") === "1",
        });
      },
    })
    .transform(new Response(xml))
    .text();

  return users;
}
