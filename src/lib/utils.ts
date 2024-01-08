import * as fs from "fs";
import path from "path";
import gitDiff from "git-diff";
import { RefactorExampleCode } from "../index";
import { RefactorDescribedItem } from "../prompts/describe-refactor";
import { ApplyRefactorItem } from "../prompts/determine-applicable-refactors";
import { keyBy } from "lodash";
import { ChatCompletionCreateParamsNonStreaming } from "openai/src/resources/chat/completions";
import retry from "async-retry";

export const getCodeText = ({
  code,
  codeFilePath
}: RefactorExampleCode): string => {
  if (code) {
    return code;
  }
  if (!codeFilePath) {
    throw new Error("Must provide either toRefactor or refactorFilePath!");
  }
  if (!fs.existsSync(codeFilePath)) {
    throw new Error(`File does not exist: ${codeFilePath}`);
  }
  const codeTextFromFile = fs.readFileSync(codeFilePath, "utf-8");
  if (!codeTextFromFile?.trim()) {
    throw new Error(`File is empty: ${codeFilePath}`);
  }
  return codeTextFromFile;
};

export const removeCodeBlock = (text: string | null): string | null => text != null ? text
  .trim()
  .replace(/^```.*/, "")
  .replace(/```$/, "") : null;

export const loadFile = (
  dirPath: string,
  fileName?: string
): string => {
  let filePath: string;
  if (fileName) {
    filePath = path.resolve(dirPath, fileName);
  } else {
    filePath = dirPath;
  }
  if (!fs.existsSync(filePath)) {
    throw new Error(`File does not exist: ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf-8");
};

export const loadTsConfigJsonFileMappings = (dirPath: string): string | null => {
  try {
    const tsconfig = JSON.parse(loadFile(dirPath, "tsconfig.json"));
    const tsconfigPaths = tsconfig?.compilerOptions?.paths;
    if (tsconfigPaths) {
      return JSON.stringify(tsconfigPaths, null, 1);
    }
    return null;
  } catch {
    return null;
  }
};

export const findGitDiff = (before: string, after: string): string => {
  const diff = gitDiff(before, after, { flags: "--diff-algorithm=minimal --ignore-all-space" });
  if (!diff) {
    throw new Error("Could not find diff");
  }
  return diff;
};

interface FilterRefactorsToThoseApplicable {
  applyRefactorItems: ApplyRefactorItem[],
  refactorDescription: RefactorDescribedItem[]
}
export const filterRefactorsToThoseApplicable = ({
  applyRefactorItems,
  refactorDescription
}: FilterRefactorsToThoseApplicable): RefactorDescribedItem[] => {
  const applyRefactorItemByIndex = keyBy(applyRefactorItems, "index");
  const refactorsToApply: RefactorDescribedItem[] = [];
  for (let i = 1; i < refactorDescription.length + 1; i++) {
    if (!applyRefactorItemByIndex[i]) {
      throw new Error(`Missing refactoring item for index ${i}`);
    }
    if (!applyRefactorItemByIndex[i].isApplicable) {
      continue;
    }
    refactorsToApply.push(refactorDescription[i - 1]);
  }
  return refactorsToApply;
};

function wrapText(text: string, maxLineLength: number): string[] {
  const wrappedLines: string[] = [];
  let currentLine = text;

  while (currentLine.length > maxLineLength) {
    let spaceIndex = currentLine.lastIndexOf(" ", maxLineLength);
    if (spaceIndex === -1) spaceIndex = maxLineLength;
    wrappedLines.push(currentLine.substring(0, spaceIndex));
    currentLine = currentLine.substring(spaceIndex).trim();
  }

  wrappedLines.push(currentLine);
  return wrappedLines;
}

export const replaceWhitespaceWithSingleSpace = (input: string): string => input
  .replace(/ +/g, " ")
  .replace(/\n+/g, "\n")
  .replace(/\t+/g, "\t")
  .replace(/\r+/g, "\r")
  .trim();


export const applyFnToAllStringProperties = (
  obj: any,
  fn: (input: string) => string
): any => {
  if (typeof obj === "string") {
    return fn(obj);
  } else if (Array.isArray(obj)) {
    return obj.map(x => applyFnToAllStringProperties(x, fn));
  } else if (typeof obj === "object" && obj !== null) {
    const sanitizedObject: Record<string, any> = {};
    Object.keys(obj).forEach(key => {
      sanitizedObject[key] = applyFnToAllStringProperties(obj[key], fn);
    });
    return sanitizedObject;
  }
  return obj;
};

export const cleanBodyForCreate = (
  body: ChatCompletionCreateParamsNonStreaming
): ChatCompletionCreateParamsNonStreaming => {
  // body.tools = applyFnToAllStringProperties(body.tools, replaceWhitespaceWithSingleSpace);
  // body.messages = applyFnToAllStringProperties(body.messages, replaceWhitespaceWithSingleSpace);
  return body;
};

const MAX_RETRIES = 3;
export const withRetry = <T, A>(
  name: string,
  fn: (args: A) => Promise<T>
): (args: A) => Promise<T> => {
  let lastError: Error | null = null;
  return (args: A): Promise<T> => (
    retry(async (bail, attemptNumber) => {
      if (attemptNumber > 1) {
        console.log(`${name} :: Retry attempt number ${attemptNumber}`);
      }
      if (attemptNumber === MAX_RETRIES + 1) {
        bail(lastError ?? new Error(`${name} :: Reached max retries`));
        return {} as T;
      }
      return fn(args);
    }, {
      onRetry: e => {
        lastError = e;
      },
      retries: MAX_RETRIES,
      minTimeout: 500,
      maxTimeout: 3000,
      factor: 2
    })
  );
};