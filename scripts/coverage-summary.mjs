import { existsSync, readFileSync } from 'node:fs';

const marker = '<!-- coverage-report -->';
const file = process.argv[2] ?? 'coverage/coverage-summary.json';

if (!existsSync(file)) {
  console.log(
    `${marker}\n### Coverage\n\nNo coverage summary found at \`${file}\`. The tests may have failed before coverage was collected.`,
  );
  process.exit(0);
}

const { total } = JSON.parse(readFileSync(file, 'utf8'));
const metrics = [
  ['Lines', total.lines],
  ['Statements', total.statements],
  ['Functions', total.functions],
  ['Branches', total.branches],
];
const rows = metrics.map(
  ([name, metric]) =>
    `| ${name} | ${metric.pct}% | ${metric.covered}/${metric.total} | ${
      metric.pct === 100 ? 'pass' : 'FAIL (100% required)'
    } |`,
);

console.log(
  [
    marker,
    '### Coverage',
    '',
    '| Metric | Coverage | Covered | Status |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n'),
);
