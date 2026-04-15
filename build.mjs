import { build } from 'esbuild'
import chokidar from 'chokidar'
import fg from 'fast-glob'
import fs from 'fs-extra'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import crypto from 'crypto'

const sh = promisify(exec)

const ROOT = process.cwd()
const WORKERS_DIR = path.join(ROOT, 'workers')
const DIST_DIR = path.join(ROOT, 'dist/workers')

const WATCH = process.argv.includes('--watch')

/**
 * 构建完成 Hook
 * 可自定义：
 * - wrangler deploy
 * - zip打包
 * - manifest生成
 * - 通知其他服务
 */
async function runPostBuild(worker) {
  console.log(`[hook] ${worker.name}`)

  // 示例：
  // await sh(`echo built ${workerName}`)

  // 示例：自动部署某 worker
  // if (workerName === 'base-worker') {
  //   await sh(`wrangler deploy --config ${outDir}/wrangler.toml`)
  // }
  await fillVersionHash(worker)
}


async function fillVersionHash(worker) {
  const manifestPath = path.join(worker.outDir, 'manifest.json')

  const files = await collectFiles(worker.outDir)

  const hash = crypto.createHash('sha256')

  for (const file of files.sort()) {
    const rel = path.relative(worker.outDir, file)

    // 避免 manifest 自身参与 hash
    if (rel === 'manifest.json') continue

    const content = await fs.readFile(file)

    hash.update(rel)
    hash.update('\0')
    hash.update(content)
    hash.update('\0')
  }

  const versionHash = hash.digest('hex')

  let manifest = {}

  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  } catch {
    // manifest 不存在则自动创建
  }

  manifest.version_hash = versionHash

  await fs.writeFile(
    manifestPath,
    JSON.stringify(manifest, null, 2) + '\n'
  )
}

/**
 * 递归收集目录下所有文件
 */
async function collectFiles(dir) {
  const result = []

  const entries = await fs.readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      result.push(...await collectFiles(fullPath))
    } else {
      result.push(fullPath)
    }
  }

  return result
}

/**
 * 获取所有 worker
 */
async function getWorkers() {
  const entries = await fg('workers/*/index.js')

  return entries.map(entry => {
    const workerName = path.basename(path.dirname(entry))

    return {
      name: workerName,
      srcDir: path.join(WORKERS_DIR, workerName),
      entry: path.resolve(entry),
      outDir: path.join(DIST_DIR, workerName),
    }
  })
}

/**
 * 拷贝静态资源
 */
async function copyAssets(worker) {
  await fs.ensureDir(worker.outDir)

  const files = await fs.readdir(worker.srcDir)

  await Promise.all(
    files
      .filter(f => !f.endsWith('.js'))
      .map(file =>
        fs.copy(
          path.join(worker.srcDir, file),
          path.join(worker.outDir, file)
        )
      )
  )
}

/**
 * 构建单个 worker
 */
async function buildWorker(worker) {
  console.log(`[build] ${worker.name}`)

  await fs.ensureDir(worker.outDir)

  await build({
    entryPoints: [worker.entry],
    outfile: path.join(worker.outDir, 'index.js'),
    bundle: true,
    format: 'esm',
    minify: false, // To make the output code clearer
    // sourcemap: true,
    platform: 'browser',
    target: 'es2022',
  })

  await copyAssets(worker)

  await runPostBuild(worker)

  console.log(`[done] ${worker.name}`)
}

/**
 * 全量构建
 */
async function fullBuild() {
  const workers = await getWorkers()

  await Promise.all(workers.map(buildWorker))
}

/**
 * Watch 模式
 */
async function watchMode() {
  await fullBuild()

  const watcher = chokidar.watch(WORKERS_DIR, {
    ignoreInitial: true,
  })

  watcher.on('all', async (_, changedPath) => {
    const rel = path.relative(ROOT, changedPath)
    const parts = rel.split(path.sep)

    if (parts[0] !== 'workers' || parts.length < 2) return

    const workerName = parts[1]

    const worker = {
      name: workerName,
      srcDir: path.join(WORKERS_DIR, workerName),
      entry: path.join(WORKERS_DIR, workerName, 'index.js'),
      outDir: path.join(DIST_DIR, workerName),
    }

    try {
      await buildWorker(worker)
    } catch (err) {
      console.error(`[error] ${workerName}`, err.message)
    }
  })

  console.log('[watching]')
}

/**
 * 主流程
 */
async function main() {
  await fs.emptyDir(DIST_DIR)

  if (WATCH) {
    await watchMode()
  } else {
    await fullBuild()
  }
}

main()