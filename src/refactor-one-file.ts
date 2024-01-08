import { findGitDiff, getCodeText } from "./lib/utils";
import { doRefactorCode } from "./lib/do-refactor-code";
import { AiRefactorResult, RefactorExampleCode } from "./index";
import { describeRefactor, RefactorDescribedItem } from "./prompts/describe-refactor";
import { NoApplicableRefactors } from "./lib/errors";
import { getSerializedFileStructure } from "./lib/file-structure";
import { makeLogWriter } from "./lib/write-logs";

export interface RefactorOneFileArgs {
  code: {
    refactorCode: RefactorExampleCode,
    beforeExample: RefactorExampleCode,
    afterExample: RefactorExampleCode
  },
  paths: {
    repositoryRootAbsolutePath: string,
    examplePathRelativeToRoot: string,
    outputFilePath?: string,
    toRefactorPathRelativeToRoot: string
  },
  language?: string,
  logResultOutput?: boolean,
  writeLogsEnabled?: boolean,
  refactorDescription?: RefactorDescribedItem[]
}

export const aiRefactorOneFileOrCode = async ({
  code,
  paths,
  language = "typescript",
  logResultOutput = false,
  writeLogsEnabled = false,
  refactorDescription: _refactorDescription
}: RefactorOneFileArgs): Promise<AiRefactorResult[]> => {
  const logWriter = makeLogWriter(writeLogsEnabled, paths.toRefactorPathRelativeToRoot);
  const _paths = {
    ...paths,
    refactorDirectoryPathRelativeToRoot: ""
  };
  delete (_paths as any).refactorDirectoryPathRelativeToRoot;
  const beforeExampleCode = getCodeText(code.beforeExample);
  const afterExampleCode = getCodeText(code.afterExample);
  const refactorCode = getCodeText(code.refactorCode);
  logWriter({
    title: "Loaded examples and code to refactor"
  });
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
      language,
      gitDiff,
      serializedFileStructure,
      paths: _paths
    });
  }

  logWriter({
    title: "Refactor description",
    body: refactorDescription
  });
  const {
    data: refactoredResult, error
  } = await doRefactorCode({
    refactorCode,
    beforeExampleCode,
    afterExampleCode,
    refactorDescription,
    language,
    logResultOutput,
    gitDiff,
    serializedFileStructure,
    logWriter,
    paths: _paths
  });
  if (error && NoApplicableRefactors.is(error)) {
    logWriter({
      title: "No applicable refactor found"
    });
    console.error("No applicable refactor found");
    throw error;
  } else if (error) {
    logWriter({
      title: "Error performing refactor",
      body: error
    });
    throw error;
  }

  logWriter({
    title: "Applied refactor successfully"
  });
  console.log("Applied refactor successfully");
  return [ {
    refactoredCode: refactoredResult,
    filePath: paths.toRefactorPathRelativeToRoot!
  } ];
};

