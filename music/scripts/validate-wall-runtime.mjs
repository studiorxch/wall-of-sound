import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const musicRoot = path.resolve(scriptDir, "..");
const repositoryRoot = path.resolve(musicRoot, "..");
const wallSourceRoot = path.join(repositoryRoot, "wall");
const distRoot = path.join(musicRoot, "dist");
const wallDistRoot = path.join(distRoot, "wall-app");

function listFiles(root) {
  if (!fs.existsSync(root)) return [];
  const result = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) result.push(absolute);
    }
  };
  visit(root);
  return result.sort();
}

function localHtmlReferences(html) {
  return [...html.matchAll(/(?:src|href)=["'`]([^"'`]+)["'`]/g)]
    .map((match) => match[1])
    .filter((reference) => !/^(?:[a-z]+:|#|\/\/|data:)/i.test(reference));
}

function hasExactPathCase(file) {
  const parsed = path.parse(path.resolve(file));
  const segments = path.resolve(file).slice(parsed.root.length).split(path.sep).filter(Boolean);
  let current = parsed.root;
  for (const segment of segments) {
    if (!fs.existsSync(current)) return false;
    const exactEntry = fs.readdirSync(current).find((entry) => entry === segment);
    if (!exactEntry) return false;
    current = path.join(current, exactEntry);
  }
  return true;
}

function assertFile(file, description, failures) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    failures.push(`${description}: ${path.relative(distRoot, file)}`);
  } else if (!hasExactPathCase(file)) {
    failures.push(`${description} has incorrect path casing: ${path.relative(distRoot, file)}`);
  }
}

function assertGeneratedMapboxToken(file, failures) {
  assertFile(file, "missing generated Wall Mapbox environment", failures);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return;

  const source = fs.readFileSync(file, "utf8");
  const assignment = source.match(/\bvar token = ("(?:[^"\\]|\\.)*");/);
  let token = "";
  try {
    token = assignment ? JSON.parse(assignment[1]) : "";
  } catch {
    token = "";
  }
  if (!token.trim()) {
    failures.push("generated Wall Mapbox runtime token is empty");
  }
}

export function validateWallRuntimeBundle() {
  const failures = [];
  const sourceFiles = listFiles(wallSourceRoot);
  if (sourceFiles.length === 0) {
    failures.push(`canonical Wall source tree is empty: ${wallSourceRoot}`);
  }

  // The production payload is an authoritative mirror of wall/. This
  // catches indirect fetches, workers, data files, models, and assets loaded
  // by classic scripts without trying to guess every runtime string pattern.
  for (const sourceFile of sourceFiles) {
    const relative = path.relative(wallSourceRoot, sourceFile);
    assertFile(path.join(wallDistRoot, relative), "missing mirrored Wall file", failures);
  }

  const wallIndex = path.join(wallDistRoot, "index.html");
  assertFile(wallIndex, "missing Wall entry document", failures);
  if (fs.existsSync(wallIndex)) {
    const html = fs.readFileSync(wallIndex, "utf8");
    for (const reference of localHtmlReferences(html)) {
      const cleanReference = reference.split(/[?#]/, 1)[0];
      const resolved = path.resolve(path.dirname(wallIndex), cleanReference);
      if (!resolved.startsWith(`${distRoot}${path.sep}`)) {
        failures.push(`Wall HTML reference escapes production dist: ${reference}`);
        continue;
      }
      assertFile(resolved, `missing local Wall HTML dependency (${reference})`, failures);
    }
  }

  // This sibling dependency is deliberately outside wall/, matching the
  // unchanged ../shared/data/wosPalette.js URL in wall/index.html.
  assertFile(
    path.join(distRoot, "shared/data/wosPalette.js"),
    "missing shared Wall palette dependency",
    failures,
  );
  assertGeneratedMapboxToken(path.join(wallDistRoot, "mapbox-env.js"), failures);

  if (failures.length > 0) {
    throw new Error(`[wall-runtime] production bundle is incomplete:\n- ${failures.join("\n- ")}`);
  }

  return {
    mirroredWallFiles: sourceFiles.length,
    localIndexReferences: localHtmlReferences(fs.readFileSync(wallIndex, "utf8")).length,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = validateWallRuntimeBundle();
  console.log(
    `[wall-runtime] validated ${result.mirroredWallFiles} mirrored Wall files and `
      + `${result.localIndexReferences} local index references`,
  );
}
