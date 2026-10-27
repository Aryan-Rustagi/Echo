// Self-contained deterministic test harness (works with or without vitest)
type TestFn = () => void | Promise<void>;
const describe = (name: string, fn: () => void) => {
  console.log(`[TEST SUITE] ${name}`);
  fn();
};
const it = (name: string, fn: TestFn) => {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`, err);
    throw err;
  }
};
const expect = (actual: any) => ({
  toBe: (expected: any) => {
    if (actual !== expected) {
      throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
    }
  },
  toEqual: (expected: any) => {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a !== b) {
      throw new Error(`Expected deep equality:\nExpected: ${b}\nReceived: ${a}`);
    }
  },
  toContain: (item: any) => {
    if (typeof actual === "string" && !actual.includes(item)) {
      throw new Error(`Expected "${actual}" to contain "${item}"`);
    }
    if (Array.isArray(actual) && !actual.includes(item)) {
      throw new Error(`Expected array to contain ${item}`);
    }
  },
});

import {
  isAbbreviation,
  isDecimal,
  createSentenceSplitter,
} from "./llm/sentences";

describe("Sentence Splitter - Lexical Analysis", function () {
  it("correctly identifies known abbreviations", function () {
    expect(isAbbreviation("Dr.")).toBe(true);
    expect(isAbbreviation("dr.")).toBe(true);
    expect(isAbbreviation("Mr.")).toBe(true);
    expect(isAbbreviation("Mrs.")).toBe(true);
    expect(isAbbreviation("Ms.")).toBe(true);
    expect(isAbbreviation("St.")).toBe(true);
    expect(isAbbreviation("e.g.")).toBe(true);
    expect(isAbbreviation("i.e.")).toBe(true);
    expect(isAbbreviation("U.S.")).toBe(true);
    expect(isAbbreviation("vs.")).toBe(true);
    expect(isAbbreviation("a.m.")).toBe(true);
    expect(isAbbreviation("p.m.")).toBe(true);
    expect(isAbbreviation("etc.")).toBe(true);

    // Negative cases
    expect(isAbbreviation("hospital.")).toBe(false);
    expect(isAbbreviation("sentence.")).toBe(false);
    expect(isAbbreviation("hello.")).toBe(false);
  });

  it("correctly detects numeric decimals without splitting", function () {
    const text1 = "The value of pi is 3.14159 approximately.";
    expect(isDecimal(text1, text1.indexOf("."))).toBe(true);

    const text2 = "Temperature reached 98.6 degrees.";
    expect(isDecimal(text2, text2.indexOf("."))).toBe(true);

    const text3 = "End of sentence. Next one.";
    expect(isDecimal(text3, text3.indexOf("."))).toBe(false);
  });

  it("does not prematurely split on titles like Dr. and abbreviations like e.g.", function () {
    const emitted: string[] = [];
    const splitter = createSentenceSplitter(function handleSentence(sentence) {
      emitted.push(sentence);
    });

    splitter.push("Dr. Smith visited Washington, D.C. yesterday. ");
    splitter.flush();

    expect(emitted).toEqual([
      "Dr. Smith visited Washington, D.C. yesterday.",
    ]);
  });

  it("does not split on time abbreviations like a.m. or decimals", function () {
    const emitted: string[] = [];
    const splitter = createSentenceSplitter(function handleSentence(sentence) {
      emitted.push(sentence);
    });

    splitter.push("The flight departs at 9:30 a.m. from gate 4. ");
    splitter.flush();

    expect(emitted).toEqual([
      "The flight departs at 9:30 a.m. from gate 4.",
    ]);
  });

  it("splits early on commas once the buffer exceeds 60 characters", function () {
    const emitted: string[] = [];
    const splitter = createSentenceSplitter(function handleSentence(sentence) {
      emitted.push(sentence);
    });

    // 72 characters before the comma
    splitter.push("This introductory clause is intentionally quite lengthy and exceeds sixty characters, ");
    expect(emitted.length).toBe(1);
    expect(emitted[0]).toContain("exceeds sixty characters,");

    splitter.push("allowing the first synthesized audio chunk to start much sooner.");
    splitter.flush();

    expect(emitted.length).toBe(2);
    expect(emitted[1]).toBe("allowing the first synthesized audio chunk to start much sooner.");
  });

  it("flushes remaining buffer tokens when stream concludes", function () {
    const emitted: string[] = [];
    const splitter = createSentenceSplitter(function handleSentence(sentence) {
      emitted.push(sentence);
    });

    splitter.push("Sentence one has punctuation. ");
    expect(emitted).toEqual(["Sentence one has punctuation."]);

    splitter.push("Sentence two has no trailing period");
    splitter.flush();

    expect(emitted).toEqual([
      "Sentence one has punctuation.",
      "Sentence two has no trailing period",
    ]);
  });
});
