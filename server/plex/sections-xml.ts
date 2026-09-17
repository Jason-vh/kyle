/**
 * Parses plex.tv's `/api/servers` listing for the sections of one server.
 *
 * A section is numbered twice: the server's own key, and the id plex.tv files
 * it under. Sharing is expressed in the latter, which only this listing gives.
 */
export async function parseLibrarySectionIds(
  xml: string,
  machineIdentifier: string,
): Promise<number[]> {
  const sectionIds: number[] = [];
  let inServer = false;

  await new HTMLRewriter()
    .on("server", {
      element(el) {
        // Sections follow their parent server in document order.
        inServer = el.getAttribute("machineidentifier") === machineIdentifier;
      },
    })
    .on("section", {
      element(el) {
        if (!inServer) return;
        const id = Number(el.getAttribute("id"));
        if (Number.isInteger(id)) sectionIds.push(id);
      },
    })
    .transform(new Response(xml))
    .text();

  return sectionIds;
}
