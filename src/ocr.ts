export type OcrProgress = { message: string; percent: number };

async function prepareImage(file: File): Promise<File> {
  if (typeof createImageBitmap === 'undefined') return file;
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 40000000) throw new Error('Image too large');
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(3, 3000 / longest, Math.max(1, 2000 / longest));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d'); if (!ctx) return file;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.filter = 'grayscale(1) contrast(1.12)'; ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    return blob ? new File([blob], 'prepared.png', { type: 'image/png' }) : file;
  } finally { bitmap.close(); }
}

export function recognizeScreenshot(file: File, onProgress: (progress: OcrProgress) => void) {
  let canceled = false;
  let worker: { recognize: (image: File) => Promise<{ data: { text: string } }>; terminate: () => Promise<unknown> } | undefined;
  let rejectAbort: (reason: Error) => void = () => {};
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const checkCanceled = () => { if (canceled) throw new DOMException('Canceled', 'AbortError'); };
  const task = (async () => {
    const { createWorker } = await import('tesseract.js');
    checkCanceled();
    const image = await prepareImage(file);
    checkCanceled();
    onProgress({ message: 'Загружаем языковые модели. Первый запуск может занять время…', percent: 8 });
    worker = await createWorker('chi_sim+eng', 1, {
      workerPath: `${window.location.origin}/ocr/worker.min.js`,
      corePath: `${window.location.origin}/ocr/core`,
      langPath: `${window.location.origin}/ocr/lang`,
      workerBlobURL: false,
      logger: (message: { status: string; progress: number }) => {
        if (canceled) return;
        if (message.status === 'recognizing text') onProgress({ message: 'Распознаём китайский текст…', percent: 35 + Math.round(message.progress * 65) });
      },
      errorHandler: (error: unknown) => rejectAbort(error instanceof Error ? error : new Error(String(error))),
    });
    checkCanceled();
    try { const result = await worker.recognize(image); checkCanceled(); return result.data.text.trim(); }
    finally { await worker.terminate(); worker = undefined; }
  })();
  const timeout = window.setTimeout(() => { canceled = true; void worker?.terminate(); rejectAbort(new Error('OCR timeout')); }, 120000);
  const result = Promise.race([task, aborted]).finally(() => window.clearTimeout(timeout));
  // A canceled worker may finish initialization later; clean it up in that case too.
  void task.catch(() => { if (worker) { void worker.terminate(); worker = undefined; } });
  return { result, cancel: () => { canceled = true; void worker?.terminate(); rejectAbort(new DOMException('Canceled', 'AbortError')); } };
}
