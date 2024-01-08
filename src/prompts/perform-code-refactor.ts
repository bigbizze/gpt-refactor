import { getFileStructure, getSerializedFileStructure } from "../lib/file-structure";
import { openai } from "../index";
import { RefactorPromptArgs } from "../lib/do-refactor-code";
import {
  cleanBodyForCreate,
  findGitDiff,
  loadTsConfigJsonFileMappings,
  removeCodeBlock,
  withRetry
} from "../lib/utils";

export const performCodeRefactor = withRetry("performCodeRefactor", async ({
  refactorCode,
  paths: {
    repositoryRootAbsolutePath,
    toRefactorPathRelativeToRoot
  },
  refactorDescription,
  language = "typescript",
  gitDiff,
  serializedFileStructure
}: RefactorPromptArgs & { gitDiff: string }): Promise<string | null> => {
  const tsconfigFileMappings = loadTsConfigJsonFileMappings(repositoryRootAbsolutePath);
  const results = await openai.chat.completions.create(cleanBodyForCreate({
    model: "gpt-4-1106-preview",
    messages: [
      {
        role: "system",
        content: `
You are a ${language} developer tasked with refactoring code. You will receive:

- (FILE STRUCTURE) A file structure, which will show you the directory structure of the repository you are working in.
- (TSCONFIG FILE MAPPINGS) The compilerOptions.paths option from the project's tsconfig.json file, which will show you
  the mappings from the tsconfig file in the repository
- (GIT DIFF) The git diff of the code before and after the example refactor.
- (REFACTORS TO APPLY DESCRIPTIONS) A JSON list of objects with three properties: "refactorTitle", "refactorDescription", "index", and "gitDiffSection" which
  describe the refactors that were performed to produce the AFTER EXAMPLE code from the BEFORE EXAMPLE code that we wish to apply to the code.
- (REFACTOR THIS CODE) The code you need to refactor.

##############

Your job is to use this context to then intelligently update the code given to you in the REFACTOR THIS CODE block.
You should only apply the refactors that are found in the REFACTORS TO APPLY DESCRIPTIONS section, as we have already
intelligently determined that these refactors are applicable to the code you need to refactor. 
All code sections will be provided as standard markup codeblocks. All sections will exist beneat their respective title 
headers. 

##############

FILE STRUCTURE
<file structure>

TSCONFIG FILE MAPPINGS (tsconfig.json > compilerOptions.paths)
<tsconfig file mappings>

REFACTORS TO APPLY DESCRIPTIONS
<list of objects where each describes a different identified refactor found>

GIT DIFF
<git diff>                                                                                 | <reverse git diff>

REFACTOR THIS CODE <file path relative-to-repository-root for file being refactored>
\`\`\`<language>
<code>
\`\`\`

##############

You need to pay close attention to what has changed between the before and after examples, and only make changes to the 
code you are refactoring that are necessary to make the changes, and nothing more. Prefer to make the smallest changes possible.
Additionally, do not make assumptions about changes to imports unless they are explicitly shown in the before and after examples.
If your output code for the refactor breaks the code functionally, a baby polar bear will be horribly murdered.

##############

You will respond with nothing except exactly one code block similar to the following:
\`\`\`
<code>
\`\`\` 
containing the refactored code from the "REFACTOR THIS CODE" block.
If you respond with anything except a single codeblock of the refactored code, a small child will die.
`.trim()
      },
      {
        role: "user",
        content: `
FILE STRUCTURE
${serializedFileStructure}

TSCONFIG FILE MAPPINGS (tsconfig.json > compilerOptions.paths)
${tsconfigFileMappings ?? "{}"}

REFACTORS TO APPLY DESCRIPTIONS
${JSON.stringify(refactorDescription, null, 1)}

GIT DIFF
${gitDiff}

REFACTOR THIS CODE
\`\`\`${language} ${toRefactorPathRelativeToRoot}
${refactorCode}
\`\`\`
`.trim()
      }
    ],
    temperature: 0,
    stream: false
  }));
  const choice = results.choices.find(choice => (
    choice.message.content?.trim()?.startsWith("```")
    && choice.finish_reason === "stop"
  ));
  if (!choice?.message?.content?.trim()) {
    return null;
  }
  const withoutCodeBlock = removeCodeBlock(choice.message.content);
  if (!withoutCodeBlock?.trim()) {
    return null;
  }
  return withoutCodeBlock;
});