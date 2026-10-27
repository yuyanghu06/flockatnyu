import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const policy = JSON.parse(await readFile(new URL('../config/file-limits.json', import.meta.url)));
const exceptions = policy.exceptions;
const files = [
  ...new Set(
    execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
      encoding: 'utf8',
    }).split('\0'),
  ),
].filter((file) => /^(?:(?:src|server|tools|scripts|tests)\/.*|[^/]+)\.(?:js|mjs|css)$/.test(file));
const problems = [];
const seen = new Set();
let checked = 0;
for (const file of files) {
  let source;
  try {
    source = await readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  checked++;
  const count = source === '' ? 0 : source.split('\n').length - Number(source.endsWith('\n'));
  const limit = file.endsWith('.css') ? policy.css : policy.javascript;
  const exception = exceptions[file];
  if (exception) {
    seen.add(file);
    if (file.startsWith('src/')) problems.push(`${file}: src cannot have a legacy exception`);
    if (!exception.reason || !Number.isInteger(exception.maxLines) || exception.maxLines <= limit)
      problems.push(`${file}: invalid exception`);
    if (count <= limit)
      problems.push(`${file}: remove the obsolete exception (${count} <= ${limit})`);
  }
  const maximum = exception?.maxLines ?? limit;
  if (count > maximum)
    problems.push(`${file}: ${count} physical lines exceeds ${maximum}; split responsibilities`);
}
for (const file of Object.keys(exceptions))
  if (!seen.has(file)) problems.push(`${file}: remove the missing-file exception`);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    `File limits passed (${checked} modules; JS ${policy.javascript}, CSS ${policy.css}; ${seen.size} frozen legacy exceptions).`,
  );
