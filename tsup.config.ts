import { defineConfig } from 'tsup';

export default defineConfig({
  // 入口文件
  entry: ['src/cli/index.ts'],
  
  // 输出格式 (ESM)
  format: ['esm'],
  
  // 生成类型声明文件
  dts: true,
  
  // 生成 sourcemap
  sourcemap: true,
  
  // 清理输出目录
  clean: true,
  
  // 目标环境
  target: 'node18',
  
  // 输出目录
  outDir: 'dist',
  
  // 不打包这些依赖（保持为 external）
  external: [
    '@langchain/core',
    '@langchain/openai',
    'langchain',
    'chalk',
    'commander',
    'dotenv',
    'uuid',
    'zod',
  ],
  
  // 添加 shebang
  banner: {
    js: '#!/usr/bin/env node',
  },
});
