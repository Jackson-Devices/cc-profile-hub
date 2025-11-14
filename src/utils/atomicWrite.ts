import { writeFile, rename, stat } from 'fs/promises';

export interface AtomicWriteOptions {
  /**
   * File permissions in octal format (e.g., 0o600 for owner read/write only).
   * If provided, permissions will be verified after write.
   */
  mode?: number;
  /**
   * File encoding. Defaults to 'utf-8'.
   */
  encoding?: BufferEncoding;
}

/**
 * Atomically write content to a file using temp file + rename pattern.
 * This ensures that the file is never in a partially written state.
 *
 * @param filePath - The target file path
 * @param content - The content to write
 * @param options - Optional file permissions and encoding
 * @throws Error if permission verification fails (when mode is specified)
 */
export async function atomicWrite(
  filePath: string,
  content: string,
  options: AtomicWriteOptions = {}
): Promise<void> {
  const { mode, encoding = 'utf-8' } = options;
  const tempPath = `${filePath}.tmp`;

  // Write to temp file
  await writeFile(tempPath, content, {
    encoding,
    ...(mode !== undefined && { mode }),
  });

  // Atomic rename
  await rename(tempPath, filePath);

  // Verify permissions if mode was specified
  if (mode !== undefined) {
    const stats = await stat(filePath);
    const actualMode = stats.mode & 0o777;
    if (actualMode !== mode) {
      throw new Error(
        `File permissions verification failed: expected ${mode.toString(8).padStart(4, '0')}, got ${actualMode.toString(8).padStart(4, '0')}`
      );
    }
  }
}
