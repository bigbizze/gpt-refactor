import fs from "fs";
import path from "path";
import ignore, { Ignore } from "ignore";

const parseGitignore = async (dirPath: string): Promise<Ignore> => {
  const gitignoreDir = path.resolve(dirPath, ".gitignore");
  const ig = ignore();
  if (fs.existsSync(gitignoreDir)) {
    const gitignoreContent = await fs.promises.readFile(gitignoreDir, "utf8");
    ig.add(gitignoreContent);
  }
  return ig;
};

interface FileNode {
  name: string,
  type: "file" | "directory",
  children?: FileNode[],
  fullPath: string
}

const _getFileStructure = async (
  dirPath: string,
  pathsToIgnore: string[],
  baseDir: string,
  ig: Ignore
): Promise<FileNode | null> => {
  const relativePath = path.relative(baseDir, dirPath);
  const fullPath = path.join(baseDir, relativePath);
  const isRoot = dirPath === baseDir;
  if (
    !isRoot
    && (
      ig.ignores(relativePath)
      || pathsToIgnore.includes(relativePath)
      || pathsToIgnore.includes(fullPath)
    )
  ) {
    return null;
  }

  const stats = await fs.promises.lstat(dirPath);

  if (stats.isDirectory()) {
    const children = (await Promise.all((await fs.promises.readdir(dirPath))
      .map(child => _getFileStructure(path.join(dirPath, child), pathsToIgnore, baseDir, ig))))
      .filter((node): node is FileNode => node !== null);

    return {
      type: "directory",
      name: path.basename(dirPath),
      fullPath: dirPath,
      children: children
    };
  } else {
    return {
      type: "file",
      name: path.basename(dirPath),
      fullPath: dirPath
    };
  }
};

// const serializeFileStructure2 = (node: FileNode | null): string => {
//   if (!node) {
//     return "";
//   }
//   let result = node.name;
//
//   if (node.type === "directory") {
//     result += "/";
//     if (node.children && node.children.length > 0) {
//       result += node.children.map(child => serializeFileStructure2(child)).join(",");
//     }
//   }
//
//   return result;
// };

const serializeFileStructure = (node: FileNode, depth: number = 0): string => {
  let result = "";
  const indent = " ".repeat(depth);

  if (node.type === "directory") {
    // Check if the directory contains only one file
    if (node.children && node.children.length === 1 && node.children[0].type === "file") {
      result += `${indent}/${node.name} ${node.children[0].name}`;
    } else {
      result += `${indent}/${node.name}`;
      if (node.children) {
        for (const child of node.children) {
          result += "\n" + serializeFileStructure(child, depth + 1);
        }
      }
    }
  } else {
    result += `${indent}${node.name}`;
  }

  return result;
};

export const getFileStructure = async (
  dirPath: string,
  pathsToIgnore: string[]
): Promise<FileNode | null> => {
  const ig = await parseGitignore(dirPath);
  const fileNodes = await _getFileStructure(dirPath, pathsToIgnore, dirPath, ig);
  if (!fileNodes) {
    return null;
  }
  return fileNodes;
};

export const getSerializedFileStructure = async (
  dirPath: string,
  pathsToIgnore: string[] = []
): Promise<string> => {
  const fileNodes = await getFileStructure(dirPath, pathsToIgnore);
  if (!fileNodes) {
    return "";
  }
  return serializeFileStructure(fileNodes);
};

export const flattenFileStructureToPaths = (fileStructure: FileNode): string[] => {
  const paths: string[] = [];
  const traverse = (node: FileNode, currentPath: string) => {
    if (node.type === "file") {
      paths.push(currentPath);
    } else {
      if (node.children) {
        for (const child of node.children) {
          traverse(child, child.fullPath);
        }
      }
    }
  };
  traverse(fileStructure, fileStructure.fullPath);
  return paths;
};

export const getFlattenedFileStructurePaths = async (
  dirPath: string,
  pathsToIgnore: string[]
): Promise<string[]> => {
  const fileStructure = await getFileStructure(dirPath, pathsToIgnore);
  if (!fileStructure) {
    return [];
  }
  return flattenFileStructureToPaths(fileStructure);
};