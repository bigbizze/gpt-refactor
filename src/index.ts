import OpenAI from "openai";
import { path as appRootPath } from "app-root-path";
import path from "path";
import { RefactorOneFileArgs } from "./refactor-one-file";
import { RefactorDirectoryArgs } from "./refactor-directory";

export { aiRefactorDirectory } from "./refactor-directory";
export { aiRefactorOneFileOrCode } from "./refactor-one-file";
export { appRootPath };

require("dotenv").config({
  path: path.resolve(appRootPath, ".env")
});

export const examplesPath = path.resolve(appRootPath, "examples");
export enum Examples {
  AFTER_EXAMPLE = "after-example.txt",
  BEFORE_EXAMPLE = "before-example.txt",
  REFACTOR_CODE_EXAMPLE_1 = "refactor-1.txt",
  REFACTOR_CODE_EXAMPLE_2 = "refactor-2.txt"
}

export const openai = new OpenAI();

export type RefactorExampleCode =
  | {
    code: string,
    codeFilePath?: never
  }
  | {
    code?: never,
    codeFilePath: string
  };

export interface AiRefactorResult {
  filePath: string,
  refactoredCode: string
}

export type AllRefactorArgs =
  & RefactorOneFileArgs
  & RefactorDirectoryArgs;

