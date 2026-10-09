export interface SentenceSplitter {
  push(token: string): void;
  flush(): void;
}

export function createSentenceSplitter(
  onSentence: (sentence: string) => void
): SentenceSplitter {
  let buffer = "";

  function extractSentences(): void {
    while (true) {
      let splitIndex = -1;

      for (let i = 0; i < buffer.length - 1; i += 1) {
        const char = buffer[i];
        if (char === "." || char === "!" || char === "?") {
          const nextChar = buffer[i + 1];
          if (/\s/.test(nextChar)) {
            const candidate = buffer.slice(0, i + 1).trim();
            if (candidate.length >= 15) {
              splitIndex = i + 1;
              break;
            }
          }
        }
      }

      if (splitIndex !== -1) {
        const sentence = buffer.slice(0, splitIndex).trim();
        buffer = buffer.slice(splitIndex).trimStart();
        if (sentence.length > 0) {
          onSentence(sentence);
        }
      } else {
        break;
      }
    }
  }

  return {
    push: function push(token: string): void {
      buffer += token;
      extractSentences();
    },
    flush: function flush(): void {
      extractSentences();
      const remaining = buffer.trim();
      buffer = "";
      if (remaining.length > 0) {
        onSentence(remaining);
      }
    },
  };
}
