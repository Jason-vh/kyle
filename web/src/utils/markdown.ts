function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatSlackLinks(escaped: string): string {
  return escaped.replace(/&lt;(https?:\/\/[^|]+)\|(.+?)&gt;/g, (_, url: string, label: string) => {
    const href = url.replace(/&amp;/g, "&");
    return `<a href="${href}" target="_blank" rel="noopener">${label}</a>`;
  });
}

export function renderMarkdown(raw: string): string {
  const escaped = escapeHtml(raw);

  // 1. Extract fenced code blocks
  const codeBlocks: string[] = [];
  let text = escaped.replace(/```(\w*)\n([\s\S]*?)```/g, (_, _lang: string, code: string) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code>${code}</code></pre>`);
    return `@@CODE_${idx}@@`;
  });

  // 2. Extract inline code
  const inlineCode: string[] = [];
  text = text.replace(/`([^`\n]+)`/g, (_, code: string) => {
    const idx = inlineCode.length;
    inlineCode.push(`<code>${code}</code>`);
    return `@@INLINE_${idx}@@`;
  });

  // 3. Bold
  text = text.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");

  // 4. Italic
  text = text.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");

  // 5. Slack mrkdwn links
  text = formatSlackLinks(text);

  // 6. Markdown links [text](url)
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (_, label: string, url: string) => {
    const href = url.replace(/&amp;/g, "&");
    return `<a href="${href}" target="_blank" rel="noopener">${label}</a>`;
  });

  // 7. Bare URLs (not already inside an href="...")
  text = text.replace(/(?<!")https?:\/\/[^\s<&)]+(?:&amp;[^\s<&)]+)*/g, (url) => {
    const href = url.replace(/&amp;/g, "&");
    return `<a href="${href}" target="_blank" rel="noopener">${url}</a>`;
  });

  // 8. Unordered lists
  text = text.replace(/(^|\n)(- .+(?:\n- .+)*)/g, (_, prefix: string, block: string) => {
    const items = block
      .split("\n")
      .map((line: string) => `<li>${line.slice(2)}</li>`)
      .join("");
    return `${prefix}<ul>${items}</ul>`;
  });

  // 9. Paragraphs
  text = text
    .split(/\n{2,}/)
    .map((p: string) => {
      const trimmed = p.trim();
      if (!trimmed) return "";
      if (
        trimmed.startsWith("<ul>") ||
        trimmed.startsWith("@@CODE_") ||
        trimmed.startsWith("<pre>")
      )
        return trimmed;
      return `<p>${trimmed.replace(/\n/g, "<br>")}</p>`;
    })
    .join("");

  // 10. Restore code blocks and inline code
  text = text.replace(/@@CODE_(\d+)@@/g, (_, idx: string) => codeBlocks[parseInt(idx)]!);
  text = text.replace(/@@INLINE_(\d+)@@/g, (_, idx: string) => inlineCode[parseInt(idx)]!);

  return text;
}
