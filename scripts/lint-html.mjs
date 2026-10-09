import { globSync } from 'node:fs';
import { HtmlValidate } from 'html-validate';

const files = globSync('**/*.html', {
  exclude: ['backend/dist/**', 'coverage/**', 'node_modules/**', 'storybook-static/**'],
});

if (files.length === 0) {
  process.exit(0);
}

const htmlvalidate = new HtmlValidate();
const report = await htmlvalidate.validateMultipleFiles(files);

if (!report.valid) {
  for (const result of report.results) {
    for (const message of result.messages) {
      console.error(`${result.filePath}:${message.line}:${message.column} ${message.message}`);
    }
  }

  process.exit(1);
}
