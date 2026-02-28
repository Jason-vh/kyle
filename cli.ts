#!/usr/bin/env bun

const BASE_URL = process.env.KYLE_URL || "http://localhost:3000";

let conversationId: string | undefined;

const rl = require("readline").createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt() {
  rl.question("you: ", async (message: string) => {
    if (!message.trim()) return prompt();
    if (message.trim() === "/quit") return rl.close();
    if (message.trim() === "/new") {
      conversationId = undefined;
      console.log("(new conversation)\n");
      return prompt();
    }

    try {
      const res = await fetch(`${BASE_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.CHAT_API_KEY && { Authorization: `Bearer ${process.env.CHAT_API_KEY}` }),
        },
        body: JSON.stringify({ message, conversationId }),
      });

      if (!res.ok) {
        console.error(`Error: ${res.status} ${await res.text()}\n`);
        return prompt();
      }

      const data = (await res.json()) as { conversationId: string; response: string };
      conversationId = data.conversationId;
      console.log(`\nkyle: ${data.response}\n`);
    } catch (err) {
      console.error(`Connection error: ${err}\n`);
    }

    prompt();
  });
}

console.log("Kyle CLI (type /quit to exit, /new for new conversation)\n");
prompt();
