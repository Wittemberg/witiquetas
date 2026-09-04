import fs from 'node:fs';
import path from 'node:path';

const targetFilePath = process.argv[2] || 'dist/version.json';
const fullPath = path.resolve(process.cwd(), targetFilePath);

if (!fs.existsSync(fullPath)) {
  console.error(`[version-injector] Erro: Arquivo de metadados não encontrado em ${fullPath}`);
  process.exit(1);
}

const metadata = JSON.parse(fs.readFileSync(fullPath, 'utf8'));

const githubSha = process.env.GITHUB_SHA || process.argv[3];
const shortSha = process.env.SHORT_SHA || process.argv[4] || (githubSha && githubSha !== 'unknown' ? githubSha.slice(0, 7) : undefined);
const builtAt = process.env.BUILT_AT || process.argv[5] || new Date().toISOString();

// Preserva integralmente os campos semânticos canônicos:
// name, version, status, package, phase, governanceSha

if (githubSha && githubSha !== 'unknown') {
  metadata.commit = githubSha;
  metadata.candidateSha = githubSha;
  metadata.runningSha = githubSha;
}

if (shortSha && shortSha !== 'unknown') {
  metadata.shortCommit = shortSha;
  metadata.shortSha = shortSha;
}

if (builtAt && builtAt !== 'unknown') {
  metadata.builtAt = builtAt;
  metadata.timestamp = builtAt;
}

fs.writeFileSync(fullPath, JSON.stringify(metadata, null, 2) + '\n', 'utf8');

console.log(`[version-injector] Metadata de runtime atualizada com sucesso em ${fullPath}:`, {
  version: metadata.version,
  status: metadata.status,
  package: metadata.package,
  phase: metadata.phase,
  governanceSha: metadata.governanceSha,
  runningSha: metadata.runningSha,
  builtAt: metadata.builtAt,
});
