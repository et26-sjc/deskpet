import fs from 'node:fs';

export function transferPackagedDirectory(source, destination, {
  verbatimSymlinks = false,
  fileSystem = fs
} = {}) {
  if (!fileSystem.existsSync(source)) throw new Error(`Packaged source directory is missing: ${source}`);
  if (!fileSystem.statSync(source).isDirectory()) throw new Error(`Packaged source is not a directory: ${source}`);
  if (fileSystem.existsSync(destination)) throw new Error(`Release destination already exists: ${destination}`);

  try {
    fileSystem.renameSync(source, destination);
    return { method: 'rename' };
  } catch (error) {
    if (error?.code !== 'EXDEV') throw error;
  }

  try {
    fileSystem.cpSync(source, destination, {
      recursive: true,
      errorOnExist: true,
      verbatimSymlinks
    });
    return { method: 'copy' };
  } catch (error) {
    try {
      if (fileSystem.existsSync(destination)) {
        fileSystem.rmSync(destination, { recursive: true, force: true });
      }
    } catch {
      // Preserve the original transfer error; the build already fails closed.
    }
    throw error;
  }
}
