// Post-build script to fix node:sqlite import in bundled server
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const files = ['dist/server/alpha-server.js', 'dist/server/alpha-infra-server.js'];

for (const file of files) {
  const fullPath = join(process.cwd(), file);
  let content = readFileSync(fullPath, 'utf-8');
  
  // Fix node: imports that got stripped
  content = content.replace(/from "sqlite"/g, 'from "node:sqlite"');
  content = content.replace(/from "fs"/g, 'from "node:fs"');
  content = content.replace(/from "path"/g, 'from "node:path"');
  content = content.replace(/from "url"/g, 'from "node:url"');
  content = content.replace(/from "os"/g, 'from "node:os"');
  content = content.replace(/from "child_process"/g, 'from "node:child_process"');
  content = content.replace(/from "crypto"/g, 'from "node:crypto"');
  content = content.replace(/from "http"/g, 'from "node:http"');
  content = content.replace(/from "https"/g, 'from "node:https"');
  content = content.replace(/from "net"/g, 'from "node:net"');
  content = content.replace(/from "stream"/g, 'from "node:stream"');
  content = content.replace(/from "util"/g, 'from "node:util"');
  content = content.replace(/from "events"/g, 'from "node:events"');
  content = content.replace(/from "buffer"/g, 'from "node:buffer"');
  content = content.replace(/from "assert"/g, 'from "node:assert"');
  content = content.replace(/from "querystring"/g, 'from "node:querystring"');
  content = content.replace(/from "worker_threads"/g, 'from "node:worker_threads"');
  
  writeFileSync(fullPath, content);
  console.log(`Fixed: ${file}`);
}

console.log('Done fixing node: imports');
