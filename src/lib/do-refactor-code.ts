import { determineApplicableRefactors } from "../prompts/determine-applicable-refactors";
import { performCodeRefactor } from "../prompts/perform-code-refactor";
import { filterRefactorsToThoseApplicable } from "./utils";
import fs from "fs";
import { AllRefactorArgs } from "../index";
import { RefactorDescribedItem } from "../prompts/describe-refactor";
import { isSensibleRefactor } from "../prompts/is-sensible-refactor";
import retry from "async-retry";
import { NoApplicableRefactors, NonsensicalRefactorError } from "./errors";
import { err, ok, Result } from "ts-error-as-value";
import { LogWriter } from "./write-logs";

export interface RefactorPromptArgs extends Omit<AllRefactorArgs, "refactor" | "code" | "language" | "logResultOutput" | "shouldTestIfShouldRefactor"> {
  refactorCode: string,
  beforeExampleCode: string,
  afterExampleCode: string,
  language: string,
  refactorDescription: RefactorDescribedItem[],
  serializedFileStructure: string
}

export interface DoRefactorCodeArgs extends RefactorPromptArgs {
  logResultOutput: boolean,
  gitDiff: string,
  serializedFileStructure: string,
  logWriter: LogWriter
}


const MAX_RETRIES = 3;
export const doRefactorCode = async ({
  refactorCode,
  beforeExampleCode,
  afterExampleCode,
  paths,
  refactorDescription,
  gitDiff,
  language,
  logResultOutput,
  serializedFileStructure,
  logWriter
}: DoRefactorCodeArgs): Promise<Result<string>> => {
  let lastError: Error | null = null;
  try {
    return await retry(async (bail, attemptNumber): Promise<Result<string>> => {
      if (attemptNumber > 1) {
        logWriter({
          title: "doRefactorCode Retry attempt number",
          body: attemptNumber
        });
      }
      if (
        (lastError != null && !(NonsensicalRefactorError.is(lastError)))
        || attemptNumber === MAX_RETRIES + 1
      ) {
        return err(lastError ?? new Error("Unknown error"));
      }

      const applyRefactorItems = await determineApplicableRefactors({
        refactorCode,
        beforeExampleCode,
        afterExampleCode,
        paths,
        refactorDescription,
        language,
        gitDiff,
        serializedFileStructure
      });

      logWriter({
        title: "Determined applicable refactors",
        body: applyRefactorItems
      });

      const applicableRefactors = filterRefactorsToThoseApplicable({
        refactorDescription,
        applyRefactorItems
      });

      logWriter({
        title: "Filtered to applicable refactors",
        body: applicableRefactors
      });

      if (!applicableRefactors.length) {
        return err(new NoApplicableRefactors());
      }

      const refactorResult = await performCodeRefactor({
        refactorCode,
        beforeExampleCode,
        afterExampleCode,
        paths,
        language,
        gitDiff,
        serializedFileStructure,
        refactorDescription: applicableRefactors
      });

      logWriter({
        title: "Performed code refactor",
        body: refactorResult
      });

      if (!refactorResult) {
        throw new NonsensicalRefactorError();
      }

      if (!await isSensibleRefactor({
        refactorCode,
        beforeExampleCode,
        afterExampleCode,
        paths,
        language,
        gitDiff,
        serializedFileStructure,
        refactorDescription: applicableRefactors,
        codeAfterRefactor: refactorResult
      })) {
        throw new NonsensicalRefactorError();
      }

      if (!refactorResult) {
        return err(new Error("This should never happen"));
      }

      if (paths.outputFilePath) {
        logWriter({
          title: "Writing refactor result to file",
          body: paths.outputFilePath
        });
        fs.writeFileSync(paths.outputFilePath, refactorResult, "utf-8");
      }

      if (logResultOutput) {
        console.log(refactorResult);
      }

      return ok(refactorResult);
    }, {
      retries: 3,
      minTimeout: 500,
      maxTimeout: 3000,
      factor: 2,
      onRetry: e => {
        lastError = e;
      }
    });
  } catch (e) {
    return err(e instanceof Error ? e : new Error("Unknown error"));
  }
};