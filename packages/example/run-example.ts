#!/usr/bin/env tsx
/**
 * Example runner script
 * 
 * Usage: npm run example <filename>
 * Example: npm run example multi-agent
 */

import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { readdir } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const examplesDir = join(__dirname, 'examples');

const fileName = process.argv[2];

if (!fileName) {
  const files = await readdir(examplesDir);
  const examples = files.filter((f) => f.endsWith('.ts')).map((f) => f.replace('.ts', ''));
  
  console.log('Available examples:');
  examples.forEach((name) => console.log(`  - ${name}`));
  console.log('\nUsage: npm run example <filename>');
  console.log(`Example: npm run example ${examples[0] || 'example-name'}`);
  process.exit(1);
}

const examplePath = join(examplesDir, `${fileName}.ts`);
const exampleUrl = pathToFileURL(examplePath).href;

try {
  await import(exampleUrl);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND') {
    console.error(`Example not found: ${fileName}`);
    console.log('\nAvailable examples:');
    const files = await readdir(examplesDir);
    files
      .filter((f) => f.endsWith('.ts'))
      .forEach((f) => console.log(`  - ${f.replace('.ts', '')}`));
    process.exit(1);
  }
  throw error;
}
