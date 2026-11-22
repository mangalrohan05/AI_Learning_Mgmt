export interface StorageFile {
  originalName: string;
  storagePath: string;
  mimeType: string;
  size: number;
}

export interface StorageProvider {
  /**
   * Persists a file and returns its storage metadata.
   */
  save(file: Express.Multer.File): Promise<StorageFile>;

  /**
   * Deletes a file from storage. Must be idempotent and not throw if the file does not exist.
   */
  delete(storagePath: string): Promise<void>;

  /**
   * Returns a URL or relative path to access the file.
   */
  getUrl(storagePath: string): Promise<string>;

  /**
   * Reads the full file content into a Buffer.
   */
  read(storagePath: string): Promise<Buffer>;

  /**
   * Returns the absolute path on disk for this file.
   */
  getAbsolutePath(storagePath: string): string;
}
