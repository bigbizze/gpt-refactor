import {
  cleanBodyForCreate,
  findGitDiff,
  loadTsConfigJsonFileMappings,
  withRetry
} from "../lib/utils";
import { getFileStructure, getSerializedFileStructure } from "../lib/file-structure";
import { openai } from "../index";
import { RefactorPromptArgs } from "../lib/do-refactor-code";
import { RefactorDescribedItem } from "./describe-refactor";
import * as Yup from "yup";

const makeRefactorSchema = (refactorDescription: RefactorDescribedItem[]) => ({
  "title": "FindRelevantRefactorsToApplySchema",
  "type": "object",
  "properties": {
    "indicesOfRefactorsToApply": {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: {
            type: "integer",
            minimum: 1,
            maximum: refactorDescription.length
          },
          reasoning: {
            type: "string"
          },
          isApplicable: {
            type: "boolean"
          }
        },
        required: [
          "index",
          "reasoning",
          "isApplicable"
        ],
        additionalProperties: false
      }
    }
  },
  "required": [
    "indicesOfRefactorsToApply"
  ],
  "additionalProperties": false
});

const applyRefactorItemSchema = Yup.object().shape({
  index: Yup.number().min(1).max(100).required(),
  reasoning: Yup.string().required(),
  isApplicable: Yup.boolean().required()
});

export interface ApplyRefactorItem extends Yup.InferType<typeof applyRefactorItemSchema> {}
const applyRefactorSchema = Yup.object().shape({
  indicesOfRefactorsToApply: Yup.array().of(applyRefactorItemSchema).required()
});

export const determineApplicableRefactors = withRetry("determineApplicableRefactors", async ({
  refactorCode,
  beforeExampleCode,
  afterExampleCode,
  paths: {
    repositoryRootAbsolutePath,
    toRefactorPathRelativeToRoot,
    examplePathRelativeToRoot
  },
  gitDiff,
  refactorDescription,
  language = "typescript"
}: RefactorPromptArgs & { gitDiff: string }): Promise<ApplyRefactorItem[]> => {


  const tsconfigFileMappings = loadTsConfigJsonFileMappings(repositoryRootAbsolutePath);
  const results = await openai.chat.completions.create(cleanBodyForCreate({
    model: "gpt-4-1106-preview",
    tools: [
      {
        type: "function",
        function: {
          name: "FindRelevantRefactorsToApply",
          description: "Finds refactors to apply to code",
          parameters: makeRefactorSchema(refactorDescription)
        }
      }
    ],
    messages: [
      {
        role: "system",
        content: `
You are an expert consultant in the ${language} language tasked with determining if it makes sense to perform a similar refactor
to the code in the SHOULD WE APPLY THE REFACTOR TO THIS CODE section, as is represented by the refactor performed to produce
the AFTER EXAMPLE code from the BEFORE EXAMPLE code, as described in the GIT DIFF section. You will receive:

- (REFACTOR DESCRIPTION) A JSON list of objects with three properties: "refactorTitle", "refactorDescription", and "gitDiffSection" which
  describe refactors that were performed to produce the AFTER EXAMPLE code from the BEFORE EXAMPLE code.
- (BEFORE EXAMPLE) The code before the example refactor.
- (AFTER EXAMPLE) The code after the example refactor.
- (GIT DIFF) The git diff of the code before and after the example refactor.
- (SHOULD WE APPLY THE REFACTOR TO THIS CODE) The code you need to refactor.

##############

Your job is to use this context to then determine if it makes sense to perform any aspects of this refactor on the SHOULD WE APPLY THE REFACTOR TO THIS CODE
code or not.
All code sections will be provided as standard markup codeblocks. All sections will exist beneat their respective title 
headers.

##############

REFACTOR DESCRIPTION
<list of objects where each describes a different identified refactor found>

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

SHOULD WE APPLY THE REFACTOR TO THIS CODE <file path relative-to-repository-root for file being refactored>
\`\`\`<language>
<code>
\`\`\`

##############

For the following paragraphs, treat all references to "code" or "the code" as references to the code given in the SHOULD WE APPLY THE REFACTOR TO THIS CODE section.
In your response you should determine which of the refactors given in REFACTOR ITEMS would make sense to perform
on the code. 

Your response should return a JSON object with a single property, "indicesOfRefactorsToApply", which is an array of
objects, with two properties: "index" where each number must correspond to an index of a refactor description as provided in the REFACTOR ITEMS json
section, and "reasoning", which must contain the reasoning or explanation for why you think this refactor makes sense to apply, and "isApplicable", which is 
a boolean which will be true if you think the refactor is applicable and false if you don't think it is. All items in your response are to be considered 
refactors that will be applied. If you ever return an index that is not valid, a baby seal will be clubbed to death. 

To determine whether isApplicable should be true for a given refactor in the REFACTOR ITEMS list, consider how the code might apply the refactor in an abstract sense.
Applying the refactor item against the code to produce the new code will be performed by a large language model with similar context as you have. As a result, your goal
should be just determining whether the refactor is not applicable at all to the code, for e.g. if the refactor was created on code that shares little structure or common features
that are relevant to the given refactor.

Don't consider whether or not the refactor might be helpful for the code for future situations when things change to make it relevant. It must be relevant now.

View the comparison between the changes in a given refactor and the code in an abstract way. For e.g. the refactor placing all object properties on newlines instead of inline
should not consider that all the said objects only have property names that are animal names when determining whether or not it makes sense to apply the refactor to the code when the code has
no object's whose properties are animal names. It's irrelevant, the important aspect of the refactor is the abstract concept that it places all object properties on newlines instead of inline. 
Setting isApplicable to true will only ever not be a mistake if applying a given refactor to the code will produce changes in the code that a human would immediately identify as being a part of a valid
refactor of the code.

If you incorrectly categorize a refactor, a child will die because of you.
`.trim()
      },
      {
        role: "user",
        content: `
REFACTOR ITEMS
${JSON.stringify(refactorDescription, null, 1)}

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

SHOULD WE APPLY THE REFACTOR TO THIS CODE
\`\`\`${language} ${toRefactorPathRelativeToRoot}
${refactorCode}
\`\`\`
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
  // console.log(toolCalls);
  const jsonResult = toolCalls[0];
  const validatedResult = await applyRefactorSchema.validate(jsonResult);
  return validatedResult.indicesOfRefactorsToApply;
});