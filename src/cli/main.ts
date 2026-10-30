#!/usr/bin/env node
import { basename } from 'node:path';
import process from 'node:process';
import { CliUsageError, formatHelp, parseCliArgs } from './args.ts';
import { formatCliError } from './formatError.ts';
import { readCliInput } from './input.ts';
import { runCli } from './run.ts';

const EXIT_OK = 0;
const EXIT_ERROR = 1;
const EXIT_USAGE = 2;

/** CLI entry for `yarn cli` / package `bin`. */
async function main(): Promise<number> {
  const binName = basename(process.argv[1] ?? 'php-generate-type-checker');
  // Drop node + script path; parseArgs gets user argv only.
  const userArgv = process.argv.slice(2);

  let args;
  try {
    args = parseCliArgs(userArgv);
  } catch (err) {
    if (err instanceof CliUsageError) {
      process.stderr.write(`${err.message}\n\n${formatHelp(binName)}`);
      return EXIT_USAGE;
    }
    throw err;
  }

  if (args.help) {
    process.stdout.write(formatHelp(binName));
    return EXIT_OK;
  }

  let source = '';
  try {
    source = await readCliInput({
      file: args.file,
      types: args.types,
    });
    if (source.trim() === '') {
      process.stderr.write('Error: input is empty\n');
      return EXIT_ERROR;
    }
    const output = runCli(source, args);
    process.stdout.write(output);
    if (!output.endsWith('\n')) {
      process.stdout.write('\n');
    }
    return EXIT_OK;
  } catch (err) {
    if (err instanceof CliUsageError) {
      process.stderr.write(`${err.message}\n\n${formatHelp(binName)}`);
      return EXIT_USAGE;
    }
    process.stderr.write(formatCliError(err, source));
    return EXIT_ERROR;
  }
}

const code = await main();
process.exit(code);
