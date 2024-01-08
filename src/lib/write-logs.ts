import fs from "fs";
import { path as appRootPath } from "app-root-path";
import path from "path";

const logsPath = path.resolve(appRootPath, "logs");

export type LogWriter = (args: {
  title: string,
  body?: any
}) => void;
export const makeLogWriter = (
  enabled: boolean,
  fileName: string
): LogWriter => {
  if (!enabled) {
    return () => {};
  }
  const filePath = path.resolve(logsPath, `${Date.now()}_${path.basename(fileName)}.log`);
  if (!fs.existsSync(logsPath)) {
    fs.mkdirSync(logsPath);
  }
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "", "utf-8");
  }
  return ({
    title,
    body
  }) => {
    let _body: string;
    if (typeof body === "string") {
      _body = body;
    } else if (body != null) {
      _body = JSON.stringify(body, null, 2);
    } else {
      _body = "";
    }
    const logMessage1 = `
${new Date().toISOString()} :: ${title}
${_body}
`.trim();
    const logMessage = `
${logMessage1}
#################
`.trim();
    fs.appendFileSync(filePath, logMessage + "\n\n");
  };
};


