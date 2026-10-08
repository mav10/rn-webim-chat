import type { AttachFileResult, SendFilesOptions } from './types';

export interface WebimAttachmentTransport {
  uploadFile(file: AttachFileResult): Promise<string>;
  sendUploadedFiles(handles: string[]): Promise<{ id: string }>;
  deleteUploadedFile(handle: string): Promise<void>;
}

let sequence = 0;

function attachmentError(errorCode: string, message: string) {
  return { errorCode, message, errorType: 'common' as const };
}

export function validateAttachmentLimit(maxFiles = 10): number {
  if (!Number.isInteger(maxFiles) || maxFiles < 1 || maxFiles > 10) {
    throw attachmentError(
      'INVALID_FILES_LIMIT',
      'maxFiles must be between 1 and 10'
    );
  }
  return maxFiles;
}

export async function sendAttachmentGroup(
  transport: WebimAttachmentTransport,
  files: AttachFileResult[],
  options: SendFilesOptions = {}
): Promise<{ id: string }> {
  const limit = validateAttachmentLimit(options.maxFiles);
  if (!Array.isArray(files) || files.length === 0 || files.length > limit) {
    throw attachmentError(
      'INVALID_FILES_COUNT',
      `Select between 1 and ${limit} files`
    );
  }
  const selected = files.map((file) => ({ ...file }));
  if (
    selected.some(
      (file) =>
        !file.uri ||
        !file.name ||
        !file.mime ||
        typeof file.extension !== 'string'
    )
  ) {
    throw attachmentError(
      'INVALID_ATTACHMENT',
      'Each file needs uri, name, mime and extension'
    );
  }
  const operationId = `webim-files-${Date.now()}-${++sequence}`;
  const handles: string[] = [];
  let committed = false;
  let commitStarted = false;
  const checkCancelled = () => {
    if (options.signal?.aborted) {
      throw attachmentError(
        'ATTACHMENT_CANCELLED',
        'Attachment operation cancelled'
      );
    }
  };
  const progress = (
    phase: 'uploading' | 'committing' | 'sent',
    fileIndex: number
  ) => {
    try {
      options.onProgress?.({
        operationId,
        fileIndex,
        completedFiles: handles.length,
        totalFiles: selected.length,
        phase,
      });
    } catch {
      return;
    }
  };
  try {
    for (const [index, file] of selected.entries()) {
      checkCancelled();
      progress('uploading', index);
      checkCancelled();
      handles.push(await transport.uploadFile(file));
      checkCancelled();
    }
    progress('committing', selected.length - 1);
    checkCancelled();
    commitStarted = true;
    const result = await transport.sendUploadedFiles(handles);
    committed = true;
    progress('sent', selected.length - 1);
    return result;
  } finally {
    if (!committed && !commitStarted) {
      for (const handle of handles) {
        try {
          await transport.deleteUploadedFile(handle);
        } catch {
          continue;
        }
      }
    }
  }
}
