import * as process from 'process';

const args = process.argv.slice(2);
let cwd = process.cwd();

const cwdIndex = args.indexOf('--cwd');
if (cwdIndex !== -1 && cwdIndex + 1 < args.length) {
  cwd = args[cwdIndex + 1];
}

process.chdir(cwd);

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { _open } from './util/open';
import { urlencoded, json } from 'express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { WsAdapter } from '@nestjs/platform-ws';
import './logger';
import * as path from 'path';
import * as fsExtra from 'fs-extra';

export const version_number = `4.5.17`; // 端口读取移动至 bootstrap，确保先加载 .env

/**
 * 确保模板文件存在
 * 如果 assets/templates/WebGAL_Template 下没有 index.html，则从 node_modules/webgal-engine/dist 复制所需文件
 */
async function ensureTemplateFiles() {
  const cwd = process.cwd();
  const templateDir = path.join(cwd, 'assets', 'templates', 'WebGAL_Template');
  const indexPath = path.join(templateDir, 'index.html');

  // 检查 index.html 是否存在
  const indexExists = await fsExtra.pathExists(indexPath);
  if (!indexExists) {
    console.log('模板文件未找到，正在从 node_modules 复制...');
    try {
      // 源文件路径
      const sourceAssetsDir = path.join(
        cwd,
        'node_modules',
        'webgal-engine',
        'dist',
        'assets',
      );
      const sourceIndex = path.join(
        cwd,
        'node_modules',
        'webgal-engine',
        'dist',
        'index.html',
      );
      const sourceServiceWorker = path.join(
        cwd,
        'node_modules',
        'webgal-engine',
        'dist',
        'webgal-serviceworker.js',
      );

      // 目标文件路径
      const targetAssetsDir = path.join(templateDir, 'assets');
      const targetIndex = path.join(templateDir, 'index.html');
      const targetServiceWorker = path.join(
        templateDir,
        'webgal-serviceworker.js',
      );

      // 确保目标目录存在
      await fsExtra.ensureDir(templateDir);

      // 复制文件
      await Promise.all([
        fsExtra.copy(sourceAssetsDir, targetAssetsDir),
        fsExtra.copy(sourceIndex, targetIndex),
        fsExtra.copy(sourceServiceWorker, targetServiceWorker),
      ]);

      console.log('模板文件复制成功。');
    } catch (error) {
      console.error('复制模板文件时出错:', error);
    }
  }
}

// 轻量 .env 加载器：优先读取 .env 与 .env.local，若进程环境未设置则赋值
async function loadEnvFiles() {
  const cwd = process.cwd();
  const files = ['.env', '.env.local'];
  for (const file of files) {
    const full = path.join(cwd, file);
    try {
      if (await fsExtra.pathExists(full)) {
        const content = await fsExtra.readFile(full, 'utf-8');
        for (const rawLine of content.split(/\r?\n/)) {
          const line = rawLine.trim();
          if (!line || line.startsWith('#')) continue;
          const idx = line.indexOf('=');
          if (idx <= 0) continue;
          const key = line.slice(0, idx).trim();
          let value = line.slice(idx + 1).trim();
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }
          if (process.env[key] === undefined) {
            process.env[key] = value;
          }
        }
      }
    } catch (e) {
      console.warn(`[env] Failed to load ${full}:`, e);
    }
  }
}

async function bootstrap() {
  // 在启动应用前确保模板文件存在
  await ensureTemplateFiles();

  // 尝试加载 .env 与 .env.local（不覆盖已存在的进程变量）
  await loadEnvFiles();
  const port = Number.parseInt(process.env.WEBGAL_PORT || '3000', 10);

  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: '*', // Allow all headers
    exposedHeaders: '*', // Expose all headers
  });

  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));
  const config = new DocumentBuilder()
    .setTitle('WebGAL Terre API')
    .setDescription('API Refrence of WebGAL Terre Editor')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);
  app.useWebSocketAdapter(new WsAdapter(app));

  await app.listen(port + 1, '127.0.0.1');
  console.log(`WebGAL Terre ${version_number} starting at ${process.cwd()}`);
  console.log(`[Terre] Listening on http://127.0.0.1:${port + 1}`);
  if (
    (process?.env?.NODE_ENV ?? '') !== 'development' &&
    !global['isElectron']
  ) {
    _open(`http://localhost:${port + 1}`);
  }
}

bootstrap().catch((err) => {
  console.error('Bootstrap failed:', err);
});
