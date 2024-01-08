import { cleanBodyForCreate, loadTsConfigJsonFileMappings, withRetry } from "../lib/utils";
import { openai } from "../index";
import * as Yup from "yup";

const refactorDescribedItemSchema = Yup.object().shape({
  refactorTitle: Yup.string().required(),
  refactorDescription: Yup.string().required(),
  gitDiffSection: Yup.string().required()
});

export interface RefactorDescribedItem extends Yup.InferType<typeof refactorDescribedItemSchema> {
  index: number
}

const refactorDescribedSchema = Yup.object().shape({
  refactors: Yup.array().of(refactorDescribedItemSchema).required()
});

const refactorSchema = {
  "title": "DescribeRefactors",
  "type": "object",
  "properties": {
    "refactors": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "refactorTitle": {
            "type": "string",
            "description": "A title for what the suggested refactor to apply is"
          },
          "refactorDescription": {
            "type": "string",
            "description": "Your reasoning or assessment for why the suggested refactor should be applied"
          },
          gitDiffSection: {
            type: "string",
            description: `
The lines of the git diff given by GIT DIFF that are relevant to this refactor.
Lines included here do not have to be sequential, but should be full lines. 
Include all relevant lines.
If you miss any, a small native american boy will be eaten by a bear.
Do not overly differentiate between refactors because of the git diff, and maintain a high level of abstraction for
producing the refactors.
            `.trim()
          }
        },
        "required": [
          "refactorTitle",
          "refactorDescription",
          "gitDiffSection",
          "reverseGitDiffSection"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "refactors"
  ],
  "additionalProperties": false
};

interface DescribeRefactor {
  beforeExampleCode: string,
  afterExampleCode: string,
  paths: {
    repositoryRootAbsolutePath: string,
    examplePathRelativeToRoot: string
  },
  language: string,
  gitDiff: string,
  serializedFileStructure: string
}
export const describeRefactor = withRetry("describeRefactor", async ({
  beforeExampleCode,
  afterExampleCode,
  paths: {
    repositoryRootAbsolutePath,
    examplePathRelativeToRoot
  },
  language = "typescript",
  gitDiff,
  serializedFileStructure
}: DescribeRefactor): Promise<RefactorDescribedItem[]> => {
  const tsconfigFileMappings = loadTsConfigJsonFileMappings(repositoryRootAbsolutePath);
  const results = await openai.chat.completions.create(cleanBodyForCreate({
    model: "gpt-4-1106-preview",
    tools: [
      {
        type: "function",
        function: {
          name: "DescribeRefactors",
          description: "Creates a description of the refactors that occured in code",
          parameters: refactorSchema
        }
      }
    ],
    messages: [
      {
        role: "system",
        content: `
You are an expert consultant in the ${language} language tasked with describing the refactors that occured to produce the
AFTER EXAMPLE code from the BEFORE EXAMPLE code, as described in the GIT DIFF section. You will receive:

- (FILE STRUCTURE) A file structure, which will show you the directory structure of the repository you are working in.
- (TSCONFIG FILE MAPPINGS) The compilerOptions.paths option from the project's tsconfig.json file, which will show you
  the mappings from the tsconfig file in the repository
- (BEFORE EXAMPLE) The code before the example refactor.
- (AFTER EXAMPLE) The code after the example refactor.
- (GIT DIFF) The git diff of the code before and after the example refactor.
- (REVERSE GIT DIFF) The reversed git diff showing the lines that were removed by the refactor.

##############

Your job is to use this context to create a list of JSON objects, where each object gives a title and description of 
a discrete refactor, as well as to identify the portion of the git diff that is pertinent to the refactor.
This is the format of the content in the prompt you will receive:

All code sections will be provided as standard markup codeblocks. All sections will exist beneat their respective title 
headers. 

##############

FILE STRUCTURE
<file structure>

TSCONFIG FILE MAPPINGS (tsconfig.json > compilerOptions.paths)
<tsconfig file mappings>

BEFORE EXAMPLE <file path relative-to-repository-root for example file>
\`\`\`<language>
<code>
\`\`\`

AFTER EXAMPLE <file path relative-to-repository-root for example file>
\`\`\`<language>
<code>
\`\`\`

GIT DIFF
<git diff>                                                                                 | <reverse git diff>

##############

The descriptions you provide should not be too specific to the example code, but should distill the essence of the refactor
in a way that would accurately describe another similar file having similar changes, rearrangements of code, deletions, style
changes and so on.
`.trim()
      },
      {
        role: "user",
        content: `
FILE STRUCTURE
${serializedFileStructure}

TSCONFIG FILE MAPPINGS (tsconfig.json > compilerOptions.paths)
${tsconfigFileMappings ?? "{}"}

BEFORE EXAMPLE
\`\`\`${language} ${examplePathRelativeToRoot}
${beforeExampleCode}
\`\`\`

AFTER EXAMPLE
\`\`\`${language} ${examplePathRelativeToRoot}
${afterExampleCode}
\`\`\`

GIT DIFF
${gitDiff}
`.trim()
      }
    ],
    temperature: 0,
    stream: false
  }));
  const toolCalls = results.choices
    .flatMap(choice => (choice.message.tool_calls ?? [])
      .map(toolCall => toolCall?.function?.arguments != null ? JSON.parse(toolCall?.function?.arguments) : null)
    )
    .filter(toolCall => toolCall != null);
  if (!toolCalls?.length) {
    throw new Error("No tool calls found");
  }
  const jsonResult = toolCalls[0];
  const validatedResults = await refactorDescribedSchema.validate(jsonResult);
  return validatedResults.refactors.map((refactor, index) => ({
    ...refactor,
    index: index + 1
  }));
});