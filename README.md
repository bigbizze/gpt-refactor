# GPT Refactor

## Overview
Takes in the before and after of the same code as context and from that can apply the same refactor (in an abstract sense) to other files,
or to all files in a directory.

First we create an abstract summary of the distinct components that make up the refactor which produced the after code from the before code.
Then we use that abstract summary with additional context to identify which of the distinct refactors are relevant for the files we want to refactor.
Then we produce a new version of the file from the relevant refactors for it.
Then we test that the result is a valid refactor for the context and this file.

Must have GPT-4 Turbo to use right now.


### Usage Multiple Files
```ts

aiRefactorDirectory({
  code: {
    /*
      Both beforeExample and afterExample can either be a string of code, or a path to a file. Before should be the code
      before the model refactor you'd like to base later refactors on, and after should be the code after the changes
      have been made.
     */
    beforeExample: {
      // code: "",
      codeFilePath: path.resolve(examplesPath, Examples.BEFORE_EXAMPLE)
    },
    afterExample: {
      codeFilePath: path.resolve(examplesPath, Examples.AFTER_EXAMPLE)
    }
  },
  paths: {
    // The relative path of the file which was changed in the before and after
    examplePathRelativeToRoot: "pages/api/producer-firm/[producerFirmId]/production/[productionId]/reconciliation/credit-card-file-name.page.ts",
    // The absolute path of the root of the repository
    repositoryRootAbsolutePath: "/Users/charles/Documents/rc-sep-13/packages/app",
    // The relative path of the directory you want to apply the refactors over to the repository root
    refactorDirectoryPathRelativeToRoot: "/Users/charles/Documents/rc-sep-13/packages/app/pages"
  },
  fileToRefactorFilterFn: filePath => filePath.endsWith(".page.ts") && !filePath.endsWith(".test.ts"),
  // If true, will overwrite the file being refactored with the result of the refactor.
  overwriteFilesWithResult: true,
  writeLogsEnabled: true,
  // A list of absolute paths of files to ignore
  pathsToIgnoreForRefactoring: [],
  refactorDescription: [
    /*
      The delineated descriptions for the refactors involved only needs to be computed once for each before and after.
      This this property is here for if you are using the same before and after many times and want to hardcode the result 
      of this so you don't have to compute it every time.
     */
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

### Usage One File
```ts

aiRefactorOneFileOrCode({
  code: {
    /*
      All of beforeExample, afterExample and refactorCode can be a string of code, or a path to a file. Before should
      be the code before the model refactor you'd like to base later refactors on, and after should be the code after
      the changes have been made, refactorCode should be the code over which you'd like to apply the refactor that produced
      after from before. 
     */
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
    // Path to output the resulting refactored code
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