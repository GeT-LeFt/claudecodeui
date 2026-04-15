import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function getDirectorySize(dir) {
  const entries = [];
  if (!fs.existsSync(dir)) return { total: 0, entries };

  for (const file of fs.readdirSync(dir, { recursive: true })) {
    const fullPath = path.join(dir, file);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isFile()) {
        entries.push({
          path: path.relative(dir, fullPath),
          size: stat.size,
        });
      }
    } catch {
      // skip inaccessible files
    }
  }

  const total = entries.reduce((sum, e) => sum + e.size, 0);
  return { total, entries };
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(2)} ${units[i]}`;
}

function groupByExtension(entries) {
  const groups = {};
  for (const entry of entries) {
    const ext = path.extname(entry.path) || '(no ext)';
    if (!groups[ext]) groups[ext] = { count: 0, size: 0 };
    groups[ext].count++;
    groups[ext].size += entry.size;
  }
  return Object.entries(groups)
    .sort((a, b) => b[1].size - a[1].size)
    .map(([ext, data]) => ({ ext, count: data.count, size: formatBytes(data.size) }));
}

// Analyze
const clientResult = getDirectorySize(path.join(ROOT, 'dist'));
const serverResult = getDirectorySize(path.join(ROOT, 'dist-server'));

const report = {
  timestamp: new Date().toISOString(),
  client: {
    totalSize: formatBytes(clientResult.total),
    totalBytes: clientResult.total,
    fileCount: clientResult.entries.length,
    byExtension: groupByExtension(clientResult.entries),
    largestFiles: clientResult.entries
      .sort((a, b) => b.size - a.size)
      .slice(0, 10)
      .map((e) => ({ path: e.path, size: formatBytes(e.size) })),
  },
  server: {
    totalSize: formatBytes(serverResult.total),
    totalBytes: serverResult.total,
    fileCount: serverResult.entries.length,
    byExtension: groupByExtension(serverResult.entries),
  },
  combined: {
    totalSize: formatBytes(clientResult.total + serverResult.total),
    totalBytes: clientResult.total + serverResult.total,
  },
};

// Output
console.log('\n=== Build Size Report ===\n');
console.log(`Client (dist/):  ${report.client.totalSize}  (${report.client.fileCount} files)`);
console.log(`Server (dist-server/):  ${report.server.totalSize}  (${report.server.fileCount} files)`);
console.log(`Combined:  ${report.combined.totalSize}`);
console.log('\n--- Client: By Extension ---');
for (const g of report.client.byExtension) {
  console.log(`  ${g.ext.padEnd(10)} ${g.size.padStart(12)}  (${g.count} files)`);
}
console.log('\n--- Client: Top 10 Largest Files ---');
for (const f of report.client.largestFiles) {
  console.log(`  ${f.size.padStart(12)}  ${f.path}`);
}

// Write JSON for CI artifact
const reportPath = path.join(ROOT, 'build-size-report.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`\nJSON report written to: ${reportPath}`);
