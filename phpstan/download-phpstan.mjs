/**
 * Download phpstan.phar into phpstan/phpstan.phar for yarn check:phpstan.
 *
 * Run from repo root:
 *   yarn download:phpstan
 *   yarn download:phpstan -- 2.3.2
 *
 * Version defaults to "latest" (GitHub latest release redirect).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const OUT_PATH = path.join(import.meta.dirname, 'phpstan.phar');
const OUT_REL = path.relative(REPO_ROOT, OUT_PATH);

/**
 * @param {readonly string[]} argv
 * @returns {string}
 */
function parseVersion(argv) {
  const positional = [];
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === '--') {
      i += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg.startsWith('-')) {
      throw new Error(`unknown option: ${arg}`);
    }
    positional.push(arg);
    i += 1;
  }
  if (positional.length > 1) {
    throw new Error('expected at most one version argument');
  }
  return positional[0] ?? 'latest';
}

function printUsage() {
  const script = path.relative(REPO_ROOT, import.meta.filename);
  console.error(`Usage:
  yarn download:phpstan
  yarn download:phpstan -- <version>

Download PHPStan phar to ${OUT_REL}.

Arguments:
  <version>   Release tag (e.g. 2.3.2), or "latest" (default)

Examples:
  yarn download:phpstan
  yarn download:phpstan -- 2.3.2
  node ${script} latest
`);
}

/**
 * @param {string} version
 * @returns {string}
 */
function downloadUrl(version) {
  if (version === 'latest') {
    return 'https://github.com/phpstan/phpstan/releases/latest/download/phpstan.phar';
  }
  return `https://github.com/phpstan/phpstan/releases/download/${version}/phpstan.phar`;
}

/**
 * @param {string} version
 * @returns {Promise<void>}
 */
async function downloadPhpstan(version) {
  const url = downloadUrl(version);
  console.error(`Downloading PHPStan ${version} from ${url}`);
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(
      `failed to download PHPStan ${version}: HTTP ${response.status} ${response.statusText}`,
    );
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error(`downloaded empty phpstan.phar for version ${version}`);
  }
  mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, buffer);
  console.error(`Wrote ${OUT_REL} (${buffer.length} bytes)`);
}

async function main() {
  let version;
  try {
    version = parseVersion(process.argv.slice(2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    printUsage();
    process.exit(1);
  }

  try {
    await downloadPhpstan(version);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    process.exit(1);
  }
}

await main();
