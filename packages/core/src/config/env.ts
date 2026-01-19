import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { existsSync } from 'fs';

/**
 * 动态查找并加载项目根目录的 .env 文件
 * 从当前文件位置向上遍历目录树，找到第一个 .env 文件后加载
 */
function loadEnvFile(): void {
  try {
    const __filename = fileURLToPath(import.meta.url);
    let currentDir = dirname(__filename);

    // 向上遍历目录树，查找包含 .env 文件的目录
    // 最多向上查找 10 层，避免无限循环
    const maxDepth = 10;
    let depth = 0;

    while (depth < maxDepth) {
      const envPath = join(currentDir, '.env');

      // 如果找到 .env 文件，加载它
      if (existsSync(envPath)) {
        dotenv.config({ path: envPath });
        return;
      }

      // 检查是否已经到达文件系统根目录
      const parentDir = resolve(currentDir, '..');
      if (parentDir === currentDir) {
        // 已经到达根目录，停止查找
        break;
      }

      currentDir = parentDir;
      depth++;
    }

    // 如果向上遍历没有找到 .env，尝试当前工作目录（fallback）
    const cwdEnvPath = join(process.cwd(), '.env');
    if (existsSync(cwdEnvPath)) {
      dotenv.config({ path: cwdEnvPath });
    }
  } catch {
    // 静默失败，允许环境变量通过其他方式设置
  }
}

// 在模块加载时立即执行
loadEnvFile();
