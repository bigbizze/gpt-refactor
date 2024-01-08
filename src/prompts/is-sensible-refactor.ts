import { getFileStructure, getSerializedFileStructure } from "../lib/file-structure";
import { openai } from "../index";
import { RefactorPromptArgs } from "../lib/do-refactor-code";
import { cleanBodyForCreate, findGitDiff, loadTsConfigJsonFileMappings, withRetry } from "../lib/utils";



export type IsSensibleRefactor =
  & RefactorPromptArgs
  & {
    gitDiff: string,
    codeAfterRefactor: string | null
  };
export const isSensibleRefactor = withRetry("isSensibleRefactor", async ({
  refactorCode,
  paths: {
    toRefactorPathRelativeToRoot
  },
  refactorDescription,
  language = "typescript",
  gitDiff,
  codeAfterRefactor
}: IsSensibleRefactor): Promise<boolean> => {
  if (!codeAfterRefactor?.trim()) {
    return false;
  }
  const results = await openai.chat.completions.create(cleanBodyForCreate({
    model: "gpt-3.5-turbo-16k-0613",
    messages: [
      {
        role: "system",
        content: `
You are an auditor or a quality control software engineer who is tasked with reviewing proposed refactors to ensure they
make sense and produce code that is sensical and highly likely to be what the developer creating the refactored code
intended. You will receive:

- (GIT DIFF) The git diff of the code before and after the example refactor.
- (REFACTORS TO APPLY DESCRIPTIONS) A JSON list of objects with three properties: "refactorTitle", "refactorDescription", "index", and "gitDiffSection" which
  describe the refactors that were performed to produce the AFTER EXAMPLE code from the BEFORE EXAMPLE code that we wish to apply to the code.
- (CODE BEFORE REFACTOR) This is the unchanged code prior to applying the refactor
- (CODE AFTER REFACTOR) This is the code after applying the refactor 

##############

Your job is to use this context to determine if the result of applying refactors to the CODE BEFORE REFACTOR code produced
CODE AFTER REFACTOR that is sensical and correct. 
Your response should contain just the text "good" or "bad" and nothing else. 
If it contains anything but "good" or "bad", a small child will die. 
If the refactors are not sensical, you should respond with "bad".
If the refactors are sensical, you should respond with "good".
All code sections will be provided as standard markup codeblocks. All sections will exist beneath their respective title 
headers. 

##############

GIT DIFF
<git diff>    

REFACTORS TO APPLY DESCRIPTIONS
<list of objects where each describes a different identified refactor found>                                                                             | <reverse git diff>

CODE BEFORE REFACTOR <file path relative-to-repository-root for file being refactored>
\`\`\`<language>
<code>
\`\`\`

CODE AFTER REFACTOR <file path relative-to-repository-root for file being refactored>
\`\`\`<language>
<code>
\`\`\`

##############

You need to pay close attention to what has changed between the before and after examples, and only make changes to the 
code you are refactoring that are necessary to make the changes, and nothing more. Prefer to make the smallest changes possible.
Additionally, do not make assumptions about changes to imports unless they are explicitly shown in the before and after examples.
If your output code for the refactor breaks the code functionally, a baby polar bear will be horribly murdered.

YOUR RESPONSE MUST ONLY CONTAIN THE TEXT "good" OR "bad" AND NOTHING ELSE. IF IT CONTAINS ANYTHING ELSE, YOU WILL CAUSE INNOCENT CHILDREN TO DIE.
`.trim()
      },
      {
        role: "user",
        content: `
GIT DIFF
${gitDiff}

REFACTORS TO APPLY DESCRIPTIONS
${JSON.stringify(refactorDescription, null, 1)}

CODE BEFORE REFACTOR
\`\`\`${language} ${toRefactorPathRelativeToRoot}
${refactorCode}
\`\`\`

CODE AFTER REFACTOR
\`\`\`${language} ${toRefactorPathRelativeToRoot}
${codeAfterRefactor}
\`\`\`
`.trim()
      }
    ],
    temperature: 0,
    stream: false
  }));
  const choice = results.choices.find(choice => (
    choice.message.content?.trim()
    && choice.finish_reason === "stop"
  ));
  if (!choice?.message.content) {
    throw new Error("No content found in choice");
  }
  const content = choice.message.content.toLowerCase().trim();
  if (content.startsWith("g")) {
    return true;
  } else if (content.startsWith("b")) {
    return false;
  }
  throw new Error(`Unexpected response: ${content}`);
});