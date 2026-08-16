export type ThinkSplit = {
  thinking: string | null;
  answer: string;
  thinkingOpen: boolean;
};

export function splitThink(text: string): ThinkSplit {
  const open = /<think>\s*/i;
  const start = text.search(open);
  if (start < 0) {
    return { thinking: null, answer: text, thinkingOpen: false };
  }
  const before = text.slice(0, start);
  const afterOpen = text.slice(start).replace(open, "");
  const close = afterOpen.search(/\s*<\/think>\s*/i);
  if (close < 0) {
    return { thinking: afterOpen, answer: before, thinkingOpen: true };
  }
  const thinking = afterOpen.slice(0, close);
  const rest = afterOpen.slice(close).replace(/\s*<\/think>\s*/i, "");
  return {
    thinking,
    answer: `${before}${rest}`.trimStart(),
    thinkingOpen: false,
  };
}

export function visibleAnswer(text: string): string {
  return splitThink(text).answer;
}

export function isUsefulThink(thinking: string | null): boolean {
  if (!thinking?.trim()) {
    return false;
  }
  const lower = thinking.toLowerCase();
  return ![
    "thinking process",
    "analyze the request",
    "determine the persona",
    "se ti chiedono chi sei",
    "ainside è solo",
    "ainside e' solo",
  ].some((marker) => lower.includes(marker));
}
