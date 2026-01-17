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

// Check if file exists first
const files = await readdir(examplesDir);
const fileExists = files.includes(`${fileName}.ts`);

if (!fileExists) {
  console.error(`Example not found: ${fileName}`);
  console.log('\nAvailable examples:');
  files
    .filter((f) => f.endsWith('.ts'))
    .forEach((f) => console.log(`  - ${f.replace('.ts', '')}`));
  process.exit(1);
}

// Use relative path from current script location (works better with tsx/bun)
const relativePath = `./examples/${fileName}.ts`;
const examplePath = join(examplesDir, `${fileName}.ts`);

try {
  // Try using relative path first (works better with tsx/bun)
  await import(relativePath);
} catch (error) {
  const err = error as NodeJS.ErrnoException;
  
  // If relative path doesn't work, try absolute path
  if (err.code === 'ERR_MODULE_NOT_FOUND' || err.message?.includes('Cannot find module')) {
    try {
      const exampleUrl = pathToFileURL(examplePath).href;
      await import(exampleUrl);
    } catch (absError) {
      const absErr = absError as NodeJS.ErrnoException;
      console.error(`Error running example "${fileName}":`, absErr.message);
      console.error(`\nTried relative path: ${relativePath}`);
      console.error(`Tried absolute path: ${examplePath}`);
      console.log('\nAvailable examples:');
      files
        .filter((f) => f.endsWith('.ts'))
        .forEach((f) => console.log(`  - ${f.replace('.ts', '')}`));
      process.exit(1);
    }
  } else {
    // Re-throw other errors (e.g., syntax errors, import errors)
    throw error;
  }
}
