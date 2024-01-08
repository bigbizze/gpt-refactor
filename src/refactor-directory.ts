import { findGitDiff, getCodeText, loadFile } from "./lib/utils";
import { getFlattenedFileStructurePaths, getSerializedFileStructure } from "./lib/file-structure";
import pLimit from "p-limit";
import { doRefactorCode } from "./lib/do-refactor-code";
import { AiRefactorResult, RefactorExampleCode } from "./index";
import { describeRefactor, RefactorDescribedItem } from "./prompts/describe-refactor";
import { NoApplicableRefactors } from "./lib/errors";
import { makeLogWriter } from "./lib/write-logs";
import path from "path";

export interface RefactorDirectoryArgs {
  code: {
    beforeExample: RefactorExampleCode,
    afterExample: RefactorExampleCode
  },
  paths: {
    repositoryRootAbsolutePath: string,
    examplePathRelativeToRoot: string,
    refactorDirectoryPathRelativeToRoot: string
  },
  language?: string,
  logResultOutput?: boolean,
  maxConcurrency?: number,
  fileToRefactorFilterFn?: (filePath: string) => boolean,
  overwriteFilesWithResult?: boolean,
  writeLogsEnabled?: boolean,
  pathsToIgnoreForRefactoring?: string[],
  refactorDescription?: RefactorDescribedItem[]
}

export const aiRefactorDirectory = async ({
  code,
  paths,
  language = "typescript",
  logResultOutput = false,
  maxConcurrency = 2,
  fileToRefactorFilterFn,
  overwriteFilesWithResult,
  writeLogsEnabled = false,
  pathsToIgnoreForRefactoring = [],
  refactorDescription: _refactorDescription
}: RefactorDirectoryArgs): Promise<AiRefactorResult[]> => {
  const beforeExampleCode = getCodeText(code.beforeExample);
  const afterExampleCode = getCodeText(code.afterExample);
  const logWriter = makeLogWriter(writeLogsEnabled, `${paths.refactorDirectoryPathRelativeToRoot}_DIRECTORY`);
  let filesToRefactor = await getFlattenedFileStructurePaths(paths.refactorDirectoryPathRelativeToRoot, pathsToIgnoreForRefactoring);
  if (fileToRefactorFilterFn) {
    filesToRefactor = filesToRefactor.filter(fileToRefactorFilterFn);
  }

  const gitDiff = findGitDiff(beforeExampleCode, afterExampleCode);
  logWriter({
    title: "Git diff",
    body: gitDiff
  });

  const serializedFileStructure = await getSerializedFileStructure(paths.repositoryRootAbsolutePath);
  logWriter({
    title: "File structure",
    body: serializedFileStructure
  });

  let refactorDescription: RefactorDescribedItem[];
  if (_refactorDescription) {
    refactorDescription = _refactorDescription;
  } else {
    refactorDescription = await describeRefactor({
      beforeExampleCode,
      afterExampleCode,
      paths,
      language,
      gitDiff,
      serializedFileStructure
    });
  }
  logWriter({
    title: "Refactor description",
    body: refactorDescription
  });

  const limit = pLimit(maxConcurrency);
  const refactorPromises = filesToRefactor.map((fileToRefactor, i) => (
    limit(async () => {
      const refactorCode = loadFile(fileToRefactor);
      const { refactorDirectoryPathRelativeToRoot, ...pathsWithoutRefactorDir } = paths;
      const _paths = {
        ...pathsWithoutRefactorDir,
        toRefactorPathRelativeToRoot: path.relative(paths.repositoryRootAbsolutePath, fileToRefactor),
        outputFilePath: overwriteFilesWithResult ? fileToRefactor : undefined,
        refactorDirectoryPathRelativeToRoot: ""
      };
      const logWriter = makeLogWriter(writeLogsEnabled, fileToRefactor);
      delete (_paths as any).refactorDirectoryPathRelativeToRoot;
      const msg = `#${i + 1}/${fileToRefactor.length} :: Performing refactor checks and a potential refactor for file ${_paths.outputFilePath}`;
      console.log(msg);
      logWriter({
        title: msg
      });
      const {
        data: refactorResult, error
      } = await doRefactorCode({
        refactorCode,
        beforeExampleCode,
        afterExampleCode,
        language,
        logResultOutput,
        refactorDescription,
        gitDiff,
        serializedFileStructure,
        logWriter,
        paths: _paths
      });
      if (error && NoApplicableRefactors.is(error)) {
        console.warn(`${fileToRefactor} :: No applicable refactor found`);
        logWriter({
          title: "No applicable refactor found"
        });
        return null;
      } else if (error) {
        logWriter({
          title: "Error performing refactor",
          body: error
        });
        throw error;
      }
      console.log(`${fileToRefactor} :: Applied refactor successfully`);
      logWriter({
        title: "Applied refactor successfully"
      });
      return {
        filePath: fileToRefactor,
        refactoredCode: refactorResult
      };
    })
  ));
  const multiFileRefactorResult = await Promise.all(refactorPromises);
  return multiFileRefactorResult.filter((result): result is AiRefactorResult => result != null);
};



