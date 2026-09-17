import { decodeEntities } from "./xml.ts";

/** An invitation the owner has sent that nobody has taken up yet. */
export interface PlexSentInvite {
  id: string;
  email: string;
  /** Empty when the invitation went to someone without a Plex account. */
  username: string;
  friendlyName: string;
  thumb: string;
}

/**
 * Parses plex.tv's `/api/invites/requested` list of sent invitations.
 *
 * Invitations to a server and invitations to be a friend live in the same
 * list; only the former have anything to do with access to the library.
 */
export async function parseSentInvites(xml: string): Promise<PlexSentInvite[]> {
  const invites: PlexSentInvite[] = [];

  await new HTMLRewriter()
    .on("invite", {
      element(el) {
        const id = el.getAttribute("id");
        if (!id || el.getAttribute("server") !== "1") return;
        invites.push({
          id,
          email: decodeEntities(el.getAttribute("email") ?? ""),
          username: decodeEntities(el.getAttribute("username") ?? ""),
          friendlyName: decodeEntities(el.getAttribute("friendlyname") ?? ""),
          thumb: decodeEntities(el.getAttribute("thumb") ?? ""),
        });
      },
    })
    .transform(new Response(xml))
    .text();

  return invites;
}
