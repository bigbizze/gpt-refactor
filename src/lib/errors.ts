export class NonsensicalRefactorError extends Error {
  name = "NonsensicalRefactorError";
  static is = (err: Error): err is NonsensicalRefactorError => err.name === "NonsensicalRefactorError";
}

export class NoApplicableRefactors extends Error {
  name = "NoApplicableRefactors";
  static is = (err: Error): err is NoApplicableRefactors => err.name === "NoApplicableRefactors";
}