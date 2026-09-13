import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';

const usage = 'Usage: node workbook-generator.mjs --template FILE --manifest FILE --seed FILE [--seed-extra FILE] --content FILE --output FILE [--existing FILE] | node workbook-generator.mjs --data-only --existing FILE --review-json FILE [--output FILE] [--check]';
const parseArgs = (argv) => {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(usage);
    const equal = token.indexOf('=');
    const key = token.slice(2, equal < 0 ? undefined : equal);
    const inline = equal < 0 ? undefined : token.slice(equal + 1);
    if (!key) throw new Error(usage);
    if (inline !== undefined) parsed[key] = inline;
    else if (argv[index + 1] && !argv[index + 1].startsWith('--')) parsed[key] = argv[++index];
    else parsed[key] = true;
  }
  return parsed;
};
const args = parseArgs(process.argv.slice(2));
const phases = ['idea', 'spec', 'plan', 'build', 'ship'];
const labels = { idea: 'Idea', spec: 'Spec', plan: 'Plan', build: 'Build', ship: 'Ship' };
const SAFE_TOKEN = /^[\w.-]{1,240}$/;
const MAX_TEXT_LENGTH = 100000;
const readText = async (file) => readFile(file, 'utf8');
const readJson = async (file) => {
  if (typeof file !== 'string') throw new Error(`JSON file path is required: ${file}`);
  try {
    return JSON.parse(await readText(file));
  } catch (error) {
    throw new Error(`invalid JSON in ${file}: ${error.message}`);
  }
};
const safeJson = (value) => JSON.stringify(value)
  .replace(/</g, '\\u003c')
  .replace(/>/g, '\\u003e')
  .replace(/&/g, '\\u0026')
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029')
  .replace(/<\/script/gi, '\\u003c/script');
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const safeString = (value, name, { required = true, max = MAX_TEXT_LENGTH } = {}) => {
  if (value === undefined && !required) return;
  if (typeof value !== 'string' || value.length > max) throw new Error(`${name} must be a string`);
};
const safeId = (value, name) => {
  if (typeof value !== 'string' || !SAFE_TOKEN.test(value)) throw new Error(`${name} is invalid`);
};
const phaseItems = (manifest, phase) => Array.isArray(manifest.phaseItems?.[phase])
  ? manifest.phaseItems[phase]
  : phase === manifest.phase ? manifest.items : [];
const phaseMetadata = (manifest, phase) => manifest.phaseMetadata?.[phase]
  || (phase === manifest.phase ? { workbookVersion: manifest.workbookVersion, sourceVersion: manifest.sourceVersion } : null);
const mergeExistingManifest = (existing, incoming) => {
  const phase = incoming.phase;
  const phaseItemsByPhase = { ...(existing.phaseItems || {}), ...(incoming.phaseItems || {}) };
  if (!phaseItemsByPhase[phase]) phaseItemsByPhase[phase] = incoming.items;
  const phaseMetadataByPhase = { ...(existing.phaseMetadata || {}), ...(incoming.phaseMetadata || {}) };
  if (!phaseMetadataByPhase[phase]) phaseMetadataByPhase[phase] = { workbookVersion: incoming.workbookVersion, sourceVersion: incoming.sourceVersion };
  const phaseAnchors = { ...(existing.phaseAnchors || {}), ...(incoming.phaseAnchors || {}) };
  if (!phaseAnchors[phase]) phaseAnchors[phase] = phaseItemsByPhase[phase][0];
  return {
    ...existing,
    ...incoming,
    items: [...new Set([...(existing.items || []), ...(incoming.items || [])])],
    phaseStatuses: { ...(existing.phaseStatuses || {}), ...(incoming.phaseStatuses || {}) },
    phaseAnchors,
    phaseItems: phaseItemsByPhase,
    phaseMetadata: phaseMetadataByPhase,
    contentMarkers: { ...(existing.contentMarkers || {}), ...(incoming.contentMarkers || {}) }
  };
};
const validateManifest = (manifest) => {
  if (!isObject(manifest) || typeof manifest.workbookId !== 'string' || !SAFE_TOKEN.test(manifest.workbookId) || !Array.isArray(manifest.items) || !manifest.items.length) {
    throw new Error('manifest requires workbookId and non-empty items');
  }
  if (!phases.includes(manifest.phase)) throw new Error('manifest phase is unsupported');
  if (typeof manifest.workbookVersion !== 'string' || !SAFE_TOKEN.test(manifest.workbookVersion)) throw new Error('manifest workbookVersion is invalid');
  if (typeof manifest.sourceVersion !== 'string' || !SAFE_TOKEN.test(manifest.sourceVersion)) throw new Error('manifest sourceVersion is invalid');
  if (manifest.items.some((id) => typeof id !== 'string' || !SAFE_TOKEN.test(id)) || new Set(manifest.items).size !== manifest.items.length) throw new Error('manifest item IDs are invalid');
  for (const phase of Object.keys(manifest.phaseItems || {})) {
    if (!phases.includes(phase) || !Array.isArray(manifest.phaseItems[phase]) || new Set(manifest.phaseItems[phase]).size !== manifest.phaseItems[phase].length || manifest.phaseItems[phase].some((id) => !manifest.items.includes(id))) {
      throw new Error('manifest phase items are invalid');
    }
  }
  for (const [phase, metadata] of Object.entries(manifest.phaseMetadata || {})) {
    if (!phases.includes(phase) || !isObject(metadata) || typeof metadata.workbookVersion !== 'string' || !SAFE_TOKEN.test(metadata.workbookVersion) || typeof metadata.sourceVersion !== 'string' || !SAFE_TOKEN.test(metadata.sourceVersion)) {
      throw new Error('manifest phase metadata is invalid');
    }
  }
};
const validateRevision = (revision, name) => {
  if (!isObject(revision)) throw new Error(`${name} is invalid`);
  safeString(revision.text, `${name}.text`);
  safeString(revision.savedAt, `${name}.savedAt`, { required: false, max: 240 });
};
const validateReply = (reply, phase, commentId, replyIds) => {
  if (!isObject(reply)) throw new Error(`reply for ${commentId} is invalid`);
  safeId(reply.id, `reply for ${commentId}.id`);
  if (replyIds.has(reply.id)) throw new Error(`duplicate reply ID: ${reply.id}`);
  replyIds.add(reply.id);
  safeString(reply.author, `reply ${reply.id}.author`);
  safeString(reply.text, `reply ${reply.id}.text`);
  if (reply.revisions !== undefined) {
    if (!Array.isArray(reply.revisions)) throw new Error(`reply ${reply.id}.revisions is invalid`);
    reply.revisions.forEach((revision) => validateRevision(revision, `reply ${reply.id}.revision`));
  }
  if (reply.phase !== undefined && reply.phase !== phase) throw new Error(`reply ${reply.id}.phase is invalid`);
};
const validateComment = (comment, manifest, phase, commentIds, replyIds, name = 'comment') => {
  if (!isObject(comment)) throw new Error(`${name} is invalid`);
  for (const field of ['id', 'itemId']) safeId(comment[field], `${name}.${field}`);
  if (commentIds.has(comment.id)) throw new Error(`duplicate comment ID: ${comment.id}`);
  commentIds.add(comment.id);
  if (comment.workbookId !== manifest.workbookId) throw new Error(`${name}.workbookId does not match manifest`);
  const itemPhase = comment.itemId.split('.')[0];
  if (itemPhase !== phase || !phaseItems(manifest, phase).includes(comment.itemId)) throw new Error(`${name}.itemId is not in ${phase}`);
  if (comment.phase !== undefined && comment.phase !== phase) throw new Error(`${name}.phase does not match review`);
  for (const field of ['workbookVersion', 'sourceVersion', 'question', 'status']) safeString(comment[field], `${name}.${field}`);
  for (const field of ['quote', 'context', 'createdAt', 'updatedAt', 'deletedAt']) safeString(comment[field], `${name}.${field}`, { required: false, max: field.endsWith('At') ? 240 : MAX_TEXT_LENGTH });
  if (!Array.isArray(comment.replies)) throw new Error(`${name}.replies must be an array`);
  comment.replies.forEach((reply) => validateReply(reply, phase, comment.id, replyIds));
  for (const field of ['revisions', 'questionRevisions']) {
    if (comment[field] !== undefined) {
      if (!Array.isArray(comment[field])) throw new Error(`${name}.${field} is invalid`);
      comment[field].forEach((revision) => validateRevision(revision, `${name}.${field}`));
    }
  }
};
const validateReview = (review, manifest, phase, name = 'review JSON', { comments = true } = {}) => {
  if (!isObject(review) || review.schemaVersion !== 1) throw new Error(`${name} schemaVersion is invalid`);
  if (review.workbookId !== manifest.workbookId) throw new Error(`${name} workbookId does not match manifest`);
  if (review.phase !== phase) throw new Error(`${name} phase does not match target`);
  const metadata = phaseMetadata(manifest, phase);
  if (!metadata || review.workbookVersion !== metadata.workbookVersion || review.sourceVersion !== metadata.sourceVersion) {
    throw new Error(`${name} metadata does not match manifest phase metadata`);
  }
  if (!Array.isArray(review.comments)) throw new Error(`${name}.comments must be an array`);
  safeString(review.exportedAt, `${name}.exportedAt`, { required: false, max: 240 });
  safeString(review.transport, `${name}.transport`, { required: false });
  if (!comments) return review;
  const commentIds = new Set();
  const replyIds = new Set();
  review.comments.forEach((comment) => validateComment(comment, manifest, phase, commentIds, replyIds));
  if (review.originalReview !== undefined) {
    if (!isObject(review.originalReview) || review.originalReview.schemaVersion !== 1 || review.originalReview.workbookId !== manifest.workbookId || review.originalReview.phase !== phase || !Array.isArray(review.originalReview.comments)) {
      throw new Error(`${name}.originalReview is invalid`);
    }
    const historyCommentIds = new Set();
    const historyReplyIds = new Set();
    review.originalReview.comments.forEach((comment) => validateComment(comment, manifest, phase, historyCommentIds, historyReplyIds, `${name}.originalReview.comment`));
  }
  return review;
};
const containsJson = (values, value) => values.some((candidate) => JSON.stringify(candidate) === JSON.stringify(value));
const assertHistoryIncluded = (existingComments, sourceComments, name) => {
  const sourceById = new Map(sourceComments.map((comment) => [comment.id, comment]));
  for (const existing of existingComments) {
    const source = sourceById.get(existing.id);
    if (!source) throw new Error(`${name} is missing existing comment: ${existing.id}`);
    for (const reply of existing.replies) {
      const sourceReply = source.replies.find(({ id }) => id === reply.id);
      if (!sourceReply) throw new Error(`${name} is missing existing reply: ${reply.id}`);
      for (const revision of reply.revisions || []) {
        if (!containsJson(sourceReply.revisions || [], revision)) throw new Error(`${name} is missing existing reply revision: ${reply.id}`);
      }
    }
    for (const field of ['revisions', 'questionRevisions']) {
      for (const revision of existing[field] || []) {
        if (!containsJson(source[field] || [], revision)) throw new Error(`${name} is missing existing ${field}: ${existing.id}`);
      }
    }
  }
};
const assertSourceContainsExisting = (existingEnvelopes, source, phase) => {
  assertHistoryIncluded(existingEnvelopes.flatMap(({ comments }) => comments), source.comments, `${phase} review JSON`);
  const historicalEnvelopes = existingEnvelopes.filter(({ originalReview }) => originalReview);
  if (historicalEnvelopes.length && !source.originalReview) throw new Error(`${phase} review JSON is missing existing originalReview`);
  if (source.originalReview) {
    historicalEnvelopes.forEach(({ originalReview }) => assertHistoryIncluded(originalReview.comments, source.originalReview.comments, `${phase} review JSON originalReview`));
  }
};
const scriptPattern = (id, flags = 'i') => {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(<script\\b(?=[^>]*\\bid=["']${escaped}["'])[^>]*>)([\\s\\S]*?)(</script\\s*>)`, flags);
};
const scriptEntry = (html, id) => {
  const matches = [...html.matchAll(new RegExp(`<script\\b[^>]*\\bid=["']${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`, 'gi'))];
  if (matches.length !== 1) throw new Error(`HTML must contain exactly one ${id} marker`);
  const match = scriptPattern(id).exec(html);
  if (!match) throw new Error(`HTML is missing ${id} marker`);
  try {
    return { id, value: JSON.parse(match[2].trim()) };
  } catch (error) {
    throw new Error(`HTML ${id} contains malformed JSON: ${error.message}`);
  }
};
const replaceScriptJson = (html, id, value) => {
  const pattern = scriptPattern(id);
  let replaced = false;
  const output = html.replace(pattern, (whole, opening, body, closing) => {
    replaced = true;
    const leading = body.match(/^\s*/)?.[0] || '\n';
    const trailing = body.match(/\s*$/)?.[0] || '\n';
    return opening + leading + safeJson(value) + trailing + closing;
  });
  if (!replaced) throw new Error(`HTML is missing ${id} marker`);
  return output;
};
const seedScriptIds = (html, phase, manifest) => {
  const preferred = phase === 'idea' ? ['review-seed', 'review-seed-extra'] : [`${phase}-review-seed`];
  if (html.match(scriptPattern(preferred[0]))) {
    if (phase === 'idea' && !html.match(scriptPattern(preferred[1]))) throw new Error('HTML is missing review-seed-extra marker');
    return preferred.filter((id) => html.match(scriptPattern(id)));
  }
  if (phase === manifest.phase && html.match(scriptPattern('review-seed'))) {
    const generic = scriptEntry(html, 'review-seed').value;
    if (generic.phase !== phase) throw new Error(`HTML is missing ${phase} review seed marker`);
    if (phase === 'idea' && !html.match(scriptPattern('review-seed-extra'))) throw new Error('HTML is missing review-seed-extra marker');
    return ['review-seed', ...(html.match(scriptPattern('review-seed-extra')) ? ['review-seed-extra'] : [])];
  }
  throw new Error(`HTML is missing ${phase} review seed marker`);
};
const insertPhaseSeed = (html, manifest, phase) => {
  const id = `${phase}-review-seed`;
  if (html.match(scriptPattern(id))) return html;
  const metadata = phaseMetadata(manifest, phase) || { workbookVersion: manifest.workbookVersion, sourceVersion: manifest.sourceVersion };
  const seed = {
    schemaVersion: 1,
    workbookId: manifest.workbookId,
    phase,
    workbookVersion: metadata.workbookVersion,
    sourceVersion: metadata.sourceVersion,
    comments: []
  };
  const marker = /\n  <script id="workbook-manifest"[^>]*>/i.exec(html);
  if (!marker) throw new Error('HTML is missing workbook manifest marker');
  const script = `\n  <script id="${id}" type="application/json">\n${safeJson(seed)}\n  </script>`;
  return html.slice(0, marker.index) + script + html.slice(marker.index);
};
const validateExistingSeed = (entry, manifest, phase, name) => {
  validateReview(entry.value, manifest, phase, name);
  return entry.value;
};
const syncPhaseSeeds = (html, manifest, review, { allowInsert = false } = {}) => {
  let output = html;
  if (allowInsert && review.phase !== 'idea' && !output.match(scriptPattern(`${review.phase}-review-seed`))) {
    output = insertPhaseSeed(output, manifest, review.phase);
  }
  const ids = seedScriptIds(output, review.phase, manifest);
  const entries = ids.map((id) => scriptEntry(output, id));
  const existingEnvelopes = entries.map((entry) => validateExistingSeed(entry, manifest, review.phase, `${entry.id} seed`));
  const existingComments = existingEnvelopes.flatMap(({ comments }) => comments);
  const existingIds = new Set();
  const existingReplyIds = new Set();
  existingComments.forEach((comment) => {
    if (existingIds.has(comment.id)) throw new Error(`duplicate comment ID in existing seeds: ${comment.id}`);
    existingIds.add(comment.id);
    comment.replies.forEach((reply) => {
      if (existingReplyIds.has(reply.id)) throw new Error(`duplicate reply ID in existing seeds: ${reply.id}`);
      existingReplyIds.add(reply.id);
    });
  });
  assertSourceContainsExisting(existingEnvelopes, review, review.phase);
  const splitComments = ids.length > 1
    ? (() => {
      const slotIds = existingEnvelopes.map(({ comments }) => new Set(comments.map(({ id }) => id)));
      for (let left = 0; left < slotIds.length; left += 1) {
        for (let right = left + 1; right < slotIds.length; right += 1) {
          if ([...slotIds[left]].some((id) => slotIds[right].has(id))) throw new Error(`duplicate comment ID across ${review.phase} seed slots`);
        }
      }
      return slotIds.map((idsInSlot, index) => review.comments.filter((comment) => idsInSlot.has(comment.id) || (!slotIds.some((other) => other.has(comment.id)) && index === 0)));
    })()
    : [review.comments];
  ids.forEach((id, index) => {
    const value = { ...review, comments: splitComments[index] };
    if (ids.length > 1 && index > 0 && existingEnvelopes[index].originalReview === undefined) delete value.originalReview;
    output = replaceScriptJson(output, id, value);
  });
  return { output, comments: review.comments };
};
const combineSeeds = (seed, seedExtra, manifest) => {
  // Normal generation has historically accepted a minimally shaped seed (the sample
  // fixture intentionally exercises safe serialization), while data-only is strict.
  validateReview(seed, manifest, manifest.phase, 'seed', { comments: false });
  validateReview(seedExtra, manifest, manifest.phase, 'seed-extra', { comments: false });
  const ids = new Set();
  [...seed.comments, ...seedExtra.comments].forEach((comment) => {
    if (comment?.id !== undefined) {
      if (ids.has(comment.id)) throw new Error(`duplicate comment ID across seed files: ${comment.id}`);
      ids.add(comment.id);
    }
  });
  return { ...seed, comments: [...seed.comments, ...seedExtra.comments] };
};
const atomicWrite = async (file, value) => {
  const temporary = `${file}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporary, value, 'utf8');
    await rename(temporary, file);
  } finally {
    await unlink(temporary).catch(() => {});
  }
};
const embeddedManifest = (html) => scriptEntry(html, 'workbook-manifest').value;
const replacePhaseContent = (html, phase, content, begin, end) => {
  const main = /<main\b[^>]*\bid=["']main["'][^>]*>/i.exec(html);
  const mainOpenEnd = main ? main.index + main[0].length : -1;
  const mainClose = mainOpenEnd >= 0 ? html.indexOf('</main>', mainOpenEnd) : -1;
  const start = html.indexOf(begin);
  const finish = start >= 0 ? html.indexOf(end, start + begin.length) : -1;
  if (mainOpenEnd < 0 || mainClose < 0) throw new Error(`--existing file lacks ${phase} content markers or main container`);
  const section = `\n    <section class="phase-content ${phase}-content" data-phase="${phase}" hidden>\n${content}\n    </section>\n    `;
  if (start < 0 || finish <= start) {
    if (start >= 0 || finish >= 0) throw new Error(`--existing file lacks ${phase} content markers or main container`);
    const status = html.indexOf('<div class="status-bar"', mainOpenEnd);
    const insertion = status >= mainOpenEnd && status < mainClose
      ? html.lastIndexOf('\n', status) + 1
      : mainClose;
    return html.slice(0, insertion) + `    ${begin}${section}${end}\n` + html.slice(insertion);
  }
  if (start >= mainOpenEnd && finish < mainClose) {
    return html.slice(0, start + begin.length) + section + html.slice(finish);
  }
  // Repair legacy output where a phase marker was appended after </main>; keep it
  // beside the phase cards, before the shared status/export controls.
  const lineStart = html.lastIndexOf('\n', start) + 1;
  const afterEnd = finish + end.length;
  const lineEnd = html.indexOf('\n', afterEnd);
  const blockEnd = lineEnd < 0 ? afterEnd : lineEnd + 1;
  const withoutBlock = html.slice(0, lineStart) + html.slice(blockEnd);
  const withoutMain = /<main\b[^>]*\bid=["']main["'][^>]*>/i.exec(withoutBlock);
  const withoutMainOpenEnd = withoutMain.index + withoutMain[0].length;
  const withoutMainClose = withoutBlock.indexOf('</main>', withoutMainOpenEnd);
  const status = withoutBlock.indexOf('<div class="status-bar"', withoutMainOpenEnd);
  const insertion = status >= withoutMainOpenEnd && status < withoutMainClose
    ? withoutBlock.lastIndexOf('\n', status) + 1
    : withoutMainClose;
  const replacement = `    ${begin}${section}${end}\n`;
  return withoutBlock.slice(0, insertion) + replacement + withoutBlock.slice(insertion);
};

const runDataOnly = async () => {
  if (!args.existing || typeof args.existing !== 'string') throw new Error(usage);
  const reviewFile = args['review-json'] || args.review || args.seed;
  if (!reviewFile || typeof reviewFile !== 'string') throw new Error(usage);
  const outputFile = args.output || args.existing;
  if (typeof outputFile !== 'string') throw new Error(usage);
  const existing = await readText(args.existing);
  const manifest = embeddedManifest(existing);
  validateManifest(manifest);
  const reviewInput = await readJson(reviewFile);
  let review = validateReview(reviewInput, manifest, reviewInput?.phase);
  if (args['seed-extra']) {
    const extra = validateReview(await readJson(args['seed-extra']), manifest, review.phase, 'seed-extra');
    const ids = new Set(review.comments.map(({ id }) => id));
    extra.comments.forEach((comment) => {
      if (ids.has(comment.id)) throw new Error(`duplicate comment ID across review files: ${comment.id}`);
      ids.add(comment.id);
    });
    review = { ...review, comments: [...review.comments, ...extra.comments] };
  }
  const synced = syncPhaseSeeds(existing, manifest, review);
  if (args.check) {
    if (synced.output !== existing) throw new Error(`data-only check failed: ${review.phase} seed drift`);
    console.log(`data-only check passed ${review.phase} (${synced.comments.length} threads)`);
    return;
  }
  await atomicWrite(outputFile, synced.output);
  console.log(`data-only synced ${review.phase} (${synced.comments.length} threads)`);
};

const runGenerate = async () => {
  if (args['check']) throw new Error('--check requires --data-only');
  if (!args.template || !args.manifest || !args.seed || !args.content || typeof args.output !== 'string') throw new Error(usage);
  const manifest = await readJson(args.manifest);
  const seed = await readJson(args.seed);
  const seedExtra = args['seed-extra'] ? await readJson(args['seed-extra']) : {
    schemaVersion: 1,
    workbookId: manifest.workbookId,
    phase: manifest.phase,
    workbookVersion: manifest.workbookVersion,
    sourceVersion: manifest.sourceVersion,
    comments: []
  };
  validateManifest(manifest);
  const combinedSeed = combineSeeds(seed, seedExtra, manifest);
  const content = await readText(args.content);
  if (/<\/?script\b|\bon\w+\s*=|javascript\s*:/i.test(content)) throw new Error('content contains forbidden executable markup');
  const contentIds = [...content.matchAll(/data-item-id="([^"]+)"/g)].map((match) => match[1]);
  if (new Set(contentIds).size !== contentIds.length || contentIds.some((id) => !manifest.items.includes(id))) throw new Error('content item IDs must be unique and listed in manifest');
  const toonCodec = await readText(new URL('./vendor/toon-4.1.1.inline.js', import.meta.url));
  const phaseItemsForNav = (phase) => Array.isArray(manifest.phaseItems?.[phase]) ? manifest.phaseItems[phase] : phase === manifest.phase ? manifest.items : [];
  const phaseNav = phases.map((phase, index) => {
    const state = manifest.phaseStatuses?.[phase] || (phase === manifest.phase ? 'awaiting-user-approval' : 'not-started');
    const status = { approved: '已核准', 'awaiting-user-approval': '待使用者核准', 'in-progress': '進行中', 'not-started': '尚未開始' }[state] || '尚未開始';
    const firstItem = phaseItemsForNav(phase)[0];
    const anchor = manifest.phaseAnchors?.[phase] || firstItem;
    return firstItem
      ? `        <a class="phase${phase === manifest.phase ? ' current' : ''}" data-phase-link="${escapeHtml(phase)}" href="#${escapeHtml(anchor)}"${phase === manifest.phase ? ' aria-current="page"' : ''}><strong>0${index + 1} ${labels[phase]}</strong><small>${status}</small></a>`
      : `        <span class="phase ${state === 'approved' ? 'approved' : 'disabled'}" aria-disabled="true"><strong>0${index + 1} ${labels[phase]}</strong><small>${status}</small></span>`;
  }).join('\n');
  const phaseName = String(manifest.phase).toUpperCase();
  const configuredMarkers = manifest.contentMarkers?.[manifest.phase];
  const begin = configuredMarkers?.begin || `<!-- ${phaseName}-CONTENT-BEGIN -->`;
  const end = configuredMarkers?.end || `<!-- ${phaseName}-CONTENT-END -->`;
  const generatedContent = `\n    ${begin}\n    <section class="phase-content ${manifest.phase}-content" data-phase="${manifest.phase}">\n${content}\n    </section>\n    ${end}\n`;
  const values = {
    CONTENT: generatedContent,
    MANIFEST: safeJson(manifest),
    SEED: safeJson(seed),
    REVIEW_JSON: safeJson(seed),
    SEED_EXTRA: safeJson(seedExtra),
    PHASE_LABEL: escapeHtml(labels[manifest.phase]),
    VERSION_LABEL: escapeHtml(`${manifest.workbookId} · ${manifest.workbookVersion}`),
    TITLE: escapeHtml(`${manifest.workbookId}｜${labels[manifest.phase]}`),
    PHASE_NAV: phaseNav,
    TOON_CODEC: toonCodec
  };
  const template = await readText(args.template);
  const required = ['CONTENT', 'MANIFEST', 'SEED_EXTRA', 'PHASE_LABEL', 'VERSION_LABEL', 'TITLE', 'PHASE_NAV', 'TOON_CODEC'];
  const allowed = new Set([...required, 'SEED', 'REVIEW_JSON']);
  const tokens = [...template.matchAll(/\{\{([A-Z_]+)\}\}/g)].map((match) => match[1]);
  for (const slot of required) if (!tokens.includes(slot)) throw new Error(`template missing {{${slot}}}`);
  if (!tokens.includes('SEED') && !tokens.includes('REVIEW_JSON')) throw new Error('template missing {{SEED}} or {{REVIEW_JSON}}');
  const unknown = [...new Set(tokens.filter((slot) => !allowed.has(slot)))];
  if (unknown.length) throw new Error(`template has unknown slots: ${unknown.join(', ')}`);
  let output = template.replace(/\{\{([A-Z_]+)\}\}/g, (_, slot) => values[slot]);
  if (args.existing) {
    const existing = await readText(args.existing);
    const canonicalManifest = mergeExistingManifest(embeddedManifest(existing), manifest);
    validateManifest(canonicalManifest);
    const phaseName = String(manifest.phase).toUpperCase();
    const configuredMarkers = manifest.contentMarkers?.[manifest.phase];
    const begin = configuredMarkers?.begin || `<!-- ${phaseName}-CONTENT-BEGIN -->`;
    const end = configuredMarkers?.end || `<!-- ${phaseName}-CONTENT-END -->`;
    // --existing is the canonical workbook: update only this phase's content and review seed;
    // preserve every other phase, runtime, and seed slot. The replacement also repairs
    // legacy phase markers that were emitted outside the single reading-width main.
    output = replacePhaseContent(existing, manifest.phase, content, begin, end);
    output = replaceScriptJson(output, 'workbook-manifest', canonicalManifest);
    output = output.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(`${canonicalManifest.workbookId}｜${labels[canonicalManifest.phase]}`)}</title>`);
    const canonicalPhaseNav = phases.map((phase, index) => {
      const state = canonicalManifest.phaseStatuses?.[phase] || (phase === canonicalManifest.phase ? 'awaiting-user-approval' : 'not-started');
      const status = { approved: '已核准', 'awaiting-user-approval': '待使用者核准', 'in-progress': '進行中', 'not-started': '尚未開始' }[state] || '尚未開始';
      const firstItem = phaseItems(canonicalManifest, phase)[0];
      const anchor = canonicalManifest.phaseAnchors?.[phase] || firstItem;
      return firstItem
        ? `        <a class="phase${phase === canonicalManifest.phase ? ' current' : ''}" data-phase-link="${escapeHtml(phase)}" href="#${escapeHtml(anchor)}"${phase === canonicalManifest.phase ? ' aria-current="page"' : ''}><strong>0${index + 1} ${labels[phase]}</strong><small>${status}</small></a>`
        : `        <span class="phase ${state === 'approved' ? 'approved' : 'disabled'}" aria-disabled="true"><strong>0${index + 1} ${labels[phase]}</strong><small>${status}</small></span>`;
    }).join('\n');
    output = output.replace(/(<nav class="phase-nav"[^>]*>)[\s\S]*?(<\/nav>)/, `$1\n${canonicalPhaseNav}\n      $2`);
    output = output.replace(/\/\* TOON_CODEC_BEGIN \*\/[\s\S]*?\/\* TOON_CODEC_END \*\//, (_, offset) => '/* TOON_CODEC_BEGIN */\n' + toonCodec + '\n/* TOON_CODEC_END */');
    validateReview(combinedSeed, canonicalManifest, manifest.phase);
    output = syncPhaseSeeds(output, canonicalManifest, combinedSeed, { allowInsert: true }).output;
  }
  await atomicWrite(args.output, output);
  console.log(`generated ${basename(args.output)} for ${manifest.workbookId}`);
};

if (args['data-only']) await runDataOnly();
else await runGenerate();
