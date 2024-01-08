# GPT Refactor

## Overview
Takes in the before and after of the same code as context and from that can apply the same refactor (in an abstract sense) to other files,
or to all files in a directory.

First we create an abstract summary of the distinct components that make up the refactor which produced the after code from the before code.
Then we use that abstract summary with additional context to identify which of the distinct refactors are relevant for the files we want to refactor.
Then we produce a new version of the file from the relevant refactors for it.
Then we test that the result is a valid refactor for the context and this file.

Must have GPT-4 Turbo to use right now.

### Usage One File
```ts

aiRefactorOneFileOrCode({
  code: {
    beforeExample: {
      codeFilePath: path.resolve(examplesPath, Examples.BEFORE_EXAMPLE)
    },
    afterExample: {
      codeFilePath: path.resolve(examplesPath, Examples.AFTER_EXAMPLE)
    },
    refactorCode: {
      codeFilePath: path.resolve(examplesPath, Examples.REFACTOR_CODE_EXAMPLE_2)
    }
  },
  paths: {
    examplePathRelativeToRoot: "pages/api/producer-firm/[producerFirmId]/production/[productionId]/reconciliation/credit-card-file-name.page.ts",
    toRefactorPathRelativeToRoot: "pages/api/producer-firm/[producerFirmId]/production/[productionId]/reconciliation/credit-card-statement.page.ts",
    outputFilePath: require("path").resolve(require("app-root-path").path, "src", "output.ts"),
    repositoryRootAbsolutePath: "/Users/charles/Documents/rc-sep-13/packages/app"
  }
})
  .then(result => {
    console.log(result);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
```

### Usage Multiple Files
```ts

aiRefactorDirectory({
  code: {
    beforeExample: {
      codeFilePath: path.resolve(examplesPath, Examples.BEFORE_EXAMPLE)
    },
    afterExample: {
      codeFilePath: path.resolve(examplesPath, Examples.AFTER_EXAMPLE)
    }
  },
  paths: {
    examplePathRelativeToRoot: "pages/api/producer-firm/[producerFirmId]/production/[productionId]/reconciliation/credit-card-file-name.page.ts",
    repositoryRootAbsolutePath: "/Users/charles/Documents/rc-sep-13/packages/app",
    refactorDirectoryPathRelativeToRoot: "/Users/charles/Documents/rc-sep-13/packages/app/pages"
  },
  fileToRefactorFilterFn: filePath => filePath.endsWith(".page.ts") && !filePath.endsWith(".test.ts"),
  overwriteFilesWithResult: true,
  writeLogsEnabled: true,
  pathsToIgnoreForRefactoring: toIgnore,
  refactorDescription: [
    {
      index: 1,
      "refactorTitle": "Type Alias Creation for Method Handlers",
      "refactorDescription": "Introduced type aliases for the MethodHandler return types to improve code readability and maintainability. This change makes it easier to understand the expected return type of the API handlers at a glance.",
      "gitDiffSection": "@@ -4,7 +4,8 @@\n+type GET = MethodHandler<ProductionAndProducerFirmId, string[]>\n-export const GET_getCreditCardStatementFileName: MethodHandler<ProductionAndProducerFirmId, {}> = async ({\n+export const GET_getCreditCardStatementFileName: GET = async ({"
    },
    {
      index: 2,
      "refactorTitle": "Filtering Out Undefined Values from Arrays",
      "refactorDescription": "Added a filter to the mapping of file names to exclude undefined values. This ensures that the returned array only contains valid strings, which can prevent potential runtime errors and improve data integrity.",
      "gitDiffSection": "@@ -37,7 +38,9 @@\n- const fileNames = data.map(({ file_name }) => file_name);\n+ const fileNames = data\n+ .map(({ file_name }) => file_name)\n+ .filter((fileName): fileName is string => !!fileName);"
    }
  ],
  maxConcurrency: 8
})
  .then(result => {
    console.log(result);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
```