#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { access, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFile = promisify(execFileCallback);
const phases = ['idea', 'spec', 'plan', 'build', 'ship'];
const labels = { idea: 'Idea', spec: 'Spec', plan: 'Plan', build: 'Build', ship: 'Ship' };
const usage = 'Usage: node init.mjs --destination DIR [--phase idea|spec|plan|build|ship] [--slug NAME]';

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') return { help: true };
    if (!token.startsWith('--')) throw new Error(usage);
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!key || !value || value.startsWith('--')) throw new Error(usage);
    args[key] = value;
    index += 1;
  }
  return args;
}

function safeSlug(value) {
  const slug = String(value || '').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return slug || 'workbook';
}

function pathsFor(destination, phase) {
  return {
    manifest: join(destination, `${phase}-manifest.json`),
    content: join(destination, `${phase}-content.html`),
    review: join(destination, `${phase}-review.json`),
    html: join(destination, 'idea.html'),
    context: join(destination, 'agent-context.json')
  };
}

function manifestFor(workbookId, phase) {
  const items = [`${phase}.goal`, `${phase}.next`];
  const version = `${phase}-v0.1`;
  const sourceVersion = `understanding-first-${phase}-v0.1`;
  const phaseName = phase.toUpperCase();
  return {
    schemaVersion: 1,
    workbookId,
    workbookVersion: version,
    sourceVersion,
    phase,
    phaseStatuses: { [phase]: 'awaiting-user-approval' },
    phaseAnchors: { [phase]: `${phase}-goal` },
    items,
    phaseItems: { [phase]: items },
    phaseMetadata: { [phase]: { workbookVersion: version, sourceVersion } },
    contentMarkers: { [phase]: { begin: `<!-- ${phaseName}-CONTENT-BEGIN -->`, end: `<!-- ${phaseName}-CONTENT-END -->` } }
  };
}

function reviewFor(manifest) {
  return {
    schemaVersion: 1,
    workbookId: manifest.workbookId,
    phase: manifest.phase,
    workbookVersion: manifest.workbookVersion,
    sourceVersion: manifest.sourceVersion,
    transport: 'manual-file-or-copy; no-agent-connection; open-only-review',
    comments: []
  };
}

function contextFor(manifest, paths) {
  const { workbookId, phase, workbookVersion, sourceVersion } = manifest;
  const reviewFile = basename(paths.review);
  return {
    schemaVersion: 1,
    workbookId,
    phase,
    workbookVersion,
    currentVersion: workbookVersion,
    sourceVersion,
    status: 'awaiting-user-approval',
    storageKey: `${workbookId}:reviews:v1`,
    databaseName: `${workbookId}:workbook`,
    phaseStatuses: { [phase]: 'awaiting-user-approval' },
    entrypoints: {
      workbook: 'idea.html#' + manifest.phaseAnchors[phase],
      context: 'agent-context.json',
      manifest: basename(paths.manifest),
      content: basename(paths.content),
      review: reviewFile,
      reviewSources: { [phase]: reviewFile }
    },
    reviewRound: { reviewFile, sourceReviewVersion: workbookVersion, currentReplyVersion: workbookVersion, comments: [] },
    approvals: {},
    constraints: [
      '此階段尚待聊天中的明確使用者批准；導覽、留言、Resolve 與 Agent 回覆都不代表批准。',
      'Review JSON 是 Agent 回填資料的唯一來源；完整歷史由同一個 sidecar 保留，TOON 只傳送目前 open 討論。',
      'Ship 只做唯讀 GO／NO-GO 評估，不代表部署；頁面保持離線，不自動連線 Agent。'
    ],
    nextStep: `先閱讀 ${reviewFile} 與 ${basename(paths.content)}；取得明確聊天批准後，才建立下一個 phase。`
  };
}

async function ensureAbsent(destination) {
  try {
    await lstat(destination);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  throw new Error(`destination already exists: ${destination}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage);
    return;
  }
  const destinationArg = args.destination || args.target;
  if (!destinationArg || Object.keys(args).some((key) => !['destination', 'target', 'phase', 'slug'].includes(key))) throw new Error(usage);
  const destination = resolve(destinationArg);
  const phase = args.phase || 'idea';
  if (!phases.includes(phase)) throw new Error(`unsupported phase: ${phase}`);
  await ensureAbsent(destination);

  const resourceDir = fileURLToPath(new URL('./resources/', import.meta.url));
  const resourceGenerator = join(resourceDir, 'workbook-generator.mjs');
  const resourceTemplate = join(resourceDir, 'workbook-template.html');
  const starter = await readFile(join(resourceDir, 'starter-content.html'), 'utf8');
  const slug = safeSlug(args.slug || basename(destination));
  const workbookId = `${slug}-${randomUUID()}`;
  const manifest = manifestFor(workbookId, phase);
  const paths = pathsFor(destination, phase);
  const content = starter
    .replaceAll('{{PHASE}}', phase)
    .replaceAll('{{PHASE_LABEL}}', labels[phase]);
  const review = reviewFor(manifest);
  const context = contextFor(manifest, paths);
  let staging;
  try {
    await mkdir(dirname(destination), { recursive: true });
    staging = await mkdtemp(join(dirname(destination), `.${basename(destination)}.tmp-`));
    const staged = pathsFor(staging, phase);
    await Promise.all([
      writeFile(staged.manifest, JSON.stringify(manifest, null, 2) + '\n'),
      writeFile(staged.content, content),
      writeFile(staged.review, JSON.stringify(review, null, 2) + '\n'),
      writeFile(staged.context, JSON.stringify(context, null, 2) + '\n')
    ]);
    await execFile(process.execPath, [
      resourceGenerator,
      '--template', resourceTemplate,
      '--manifest', staged.manifest,
      '--seed', staged.review,
      '--content', staged.content,
      '--output', staged.html
    ], { cwd: staging });
    await access(staged.html);
    await execFile(process.execPath, [
      resourceGenerator, '--data-only', '--existing', staged.html, '--review-json', staged.review
    ], { cwd: staging });
    await ensureAbsent(destination);
    await rename(staging, destination);
    staging = undefined;
    console.log(`initialized ${phase} workbook at ${destination}`);
    console.log(`workbookId: ${workbookId}`);
  } finally {
    if (staging) await rm(staging, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
