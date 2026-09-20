import { afterEach, expect, spyOn, test } from "bun:test";
import { downloadImages, MAX_IMAGE_SIZE, MAX_IMAGES } from "./images.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});
const image = { name: "image.png", url: "https://images.test/image.png" };

function stub(response: Response) {
  globalThis.fetch = (async () => response) as unknown as typeof fetch;
}

test("downloads supported image bytes with their authorization", async () => {
  globalThis.fetch = (async (_url, init) => {
    expect(init?.headers).toEqual({ Authorization: "Bearer test" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    return new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-type": "image/png; charset=binary" },
    });
  }) as typeof fetch;
  expect(
    await downloadImages("test", [{ ...image, headers: { Authorization: "Bearer test" } }]),
  ).toEqual([{ type: "image", mimeType: "image/png", data: "AQID" }]);
});

test.each([undefined, "1"])(
  "enforces actual bytes even without an honest content length: %s",
  async (length) => {
    let cancelled = false;
    stub(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(MAX_IMAGE_SIZE));
            controller.enqueue(new Uint8Array(1));
          },
          cancel() {
            cancelled = true;
          },
        }),
        {
          headers: { "content-type": "image/png", ...(length ? { "content-length": length } : {}) },
        },
      ),
    );
    expect(await downloadImages("test", [image])).toEqual([]);
    expect(cancelled).toBe(true);
  },
);

test("rejects declared oversize images before retaining the body", async () => {
  let cancelled = false;
  stub(
    new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
      {
        headers: { "content-type": "image/png", "content-length": String(MAX_IMAGE_SIZE + 1) },
      },
    ),
  );
  expect(await downloadImages("test", [image])).toEqual([]);
  expect(cancelled).toBe(true);
});

test("rejects image formats the model cannot consume", async () => {
  stub(new Response("<svg></svg>", { headers: { "content-type": "image/svg+xml" } }));
  expect(await downloadImages("test", [image])).toEqual([]);
});

test("a deadline cancels a body that never finishes", async () => {
  const controller = new AbortController();
  const timeout = spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
    expect(ms).toBe(15_000);
    return controller.signal;
  });
  const reading = Promise.withResolvers<void>();
  let cancelled = false;
  stub(
    new Response(
      new ReadableStream({
        pull() {
          reading.resolve();
        },
        cancel() {
          cancelled = true;
        },
      }),
      { headers: { "content-type": "image/png" } },
    ),
  );
  try {
    const result = downloadImages("test", [image]);
    await reading.promise;
    controller.abort(new Error("Deadline exceeded"));
    expect(await result).toEqual([]);
    expect(cancelled).toBe(true);
  } finally {
    timeout.mockRestore();
  }
});

test("caps each message and downloads at most three images concurrently", async () => {
  const gates = Array.from({ length: MAX_IMAGES }, () => Promise.withResolvers<Response>());
  let calls = 0;
  globalThis.fetch = (() => gates[calls++]!.promise) as unknown as typeof fetch;
  const result = downloadImages(
    "test",
    Array.from({ length: MAX_IMAGES + 5 }, () => image),
  );
  expect(calls).toBe(3);
  for (const gate of gates)
    gate.resolve(new Response("data", { headers: { "content-type": "image/png" } }));
  expect(await result).toHaveLength(MAX_IMAGES);
  expect(calls).toBe(MAX_IMAGES);
});
