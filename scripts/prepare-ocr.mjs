import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve('public/ocr');
await mkdir(`${root}/core`, { recursive: true });
await mkdir(`${root}/lang`, { recursive: true });
await copyFile('node_modules/tesseract.js/dist/worker.min.js', `${root}/worker.min.js`);
await copyFile('node_modules/tesseract.js/dist/worker.min.js.LICENSE.txt', `${root}/worker.LICENSE.txt`);
for (const name of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js']) {
  await copyFile(`node_modules/tesseract.js-core/${name}`, `${root}/core/${name}`);
}
await copyFile('node_modules/tesseract.js-core/LICENSE', `${root}/core/LICENSE`);
for (const lang of ['chi_sim', 'eng']) {
  await copyFile(`node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`, `${root}/lang/${lang}.traineddata.gz`);
}
await writeFile(`${root}/NOTICE.txt`, 'OCR: Tesseract.js and Tesseract.js-core (Apache-2.0), language data from @tesseract.js-data/chi_sim and /eng (Apache-2.0). Models are served by this website; screenshots are processed on the visitor device.\n');
console.log('Local OCR worker, WASM cores and Chinese/English models prepared.');
