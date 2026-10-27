export interface SentenceSplitter {
  push(token: string): void;
  flush(): void;
}

export const ABBREVIATIONS: Set<string> = new Set([
  "dr.",
  "mr.",
  "mrs.",
  "ms.",
  "prof.",
  "st.",
  "e.g.",
  "i.e.",
  "u.s.",
  "u.k.",
  "vs.",
  "a.m.",
  "p.m.",
  "etc.",
]);

export function isAbbreviation(wordWithDot: string): boolean {
  const normalized = wordWithDot.trim().toLowerCase();
  return ABBREVIATIONS.has(normalized);
}

export function isDecimal(buffer: string, dotIndex: number): boolean {
  if (dotIndex <= 0 || dotIndex >= buffer.length - 1) {
    return false;
  }
  const prev = buffer[dotIndex - 1];
  const next = buffer[dotIndex + 1];
  return /\d/.test(prev) && /\d/.test(next);
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
        const nextChar = buffer[i + 1];

        // 1. Period, exclamation mark, question mark followed by whitespace
        if ((char === "." || char === "!" || char === "?") && /\s/.test(nextChar)) {
          // If period, check for decimal: e.g. 3.14
          if (char === "." && isDecimal(buffer, i)) {
            continue;
          }

          // If period, check for abbreviations: Dr., Mr., etc.
          if (char === ".") {
            const precedingText = buffer.slice(0, i + 1);
            const wordMatch = precedingText.match(/[a-zA-Z.]+$/);
            if (wordMatch && isAbbreviation(wordMatch[0])) {
              continue;
            }
          }

          const candidate = buffer.slice(0, i + 1).trim();
          if (candidate.length > 0) {
            splitIndex = i + 1;
            break;
          }
        }

        // 2. Comma or semicolon: split if buffer >= 60 chars so first audio starts sooner
        if ((char === "," || char === ";") && /\s/.test(nextChar)) {
          const candidate = buffer.slice(0, i + 1).trim();
          if (candidate.length >= 60) {
            splitIndex = i + 1;
            break;
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
