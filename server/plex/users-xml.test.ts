import { describe, expect, test } from "bun:test";
import { parseShareList } from "./users-xml.ts";

const MACHINE = "78ee2e1158f735ad25c46adae45e886c332d4be8";
const OTHER = "ddb7ef97532d1ac8f33a4cc6e7abd8cfa19c3338";

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer>
  <User id="135927761" title="AnthemLoompa" username="AnthemLoompa" restricted="0">
    <Server id="1" machineIdentifier="${OTHER}" pending="0"/>
    <Server id="2" machineIdentifier="${MACHINE}" pending="0"/>
  </User>
  <User id="535008446" title="Victor" username="" restricted="1">
    <Server id="3" machineIdentifier="${MACHINE}" pending="0"/>
  </User>
  <User id="777" title="Ben &amp; Jerry&apos;s" username="ben">
    <Server id="4" machineIdentifier="${MACHINE}" pending="1"/>
  </User>
  <User id="888" title="Elsewhere" username="elsewhere">
    <Server id="5" machineIdentifier="${OTHER}" pending="0"/>
  </User>
</MediaContainer>`;

describe("parseShareList", () => {
  test("reads every user and the servers they are shared on", async () => {
    const users = await parseShareList(xml);

    expect(users.map((u) => u.accountId)).toEqual(["135927761", "535008446", "777", "888"]);
    expect(users[0]!.machineIdentifiers).toEqual([OTHER, MACHINE]);
  });

  test("decodes XML entities in names", async () => {
    const users = await parseShareList(xml);

    expect(users.find((u) => u.accountId === "777")!.title).toBe("Ben & Jerry's");
  });

  test("leaves managed users without a username", async () => {
    const users = await parseShareList(xml);

    const victor = users.find((u) => u.accountId === "535008446")!;
    expect(victor.username).toBe("");
    expect(victor.title).toBe("Victor");
  });

  test("omits shares the user has not accepted", async () => {
    const users = await parseShareList(xml);

    expect(users.find((u) => u.accountId === "777")!.machineIdentifiers).toEqual([]);
  });

  test("ignores an empty document", async () => {
    expect(await parseShareList("<MediaContainer/>")).toEqual([]);
  });
});
