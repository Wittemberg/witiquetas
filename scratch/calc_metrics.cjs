const fs = require('fs');
const path = require('path');

const roadmap = JSON.parse(fs.readFileSync('docs/development-control/roadmap.json', 'utf8'));

let totalWeight = 0;
let implementedWeight = 0;
let homologatedWeight = 0;

let mvpTotalWeight = 0;
let mvpImplementedWeight = 0;
let mvpHomologatedWeight = 0;

const capabilities = roadmap.phases.flatMap(p => p.capabilities);

for (const cap of capabilities) {
  const weight = cap.weight || 1;
  totalWeight += weight;

  const isImplemented = ['HOMOLOGATED', 'FROZEN', 'VALIDATION', 'IMPLEMENTED'].includes(cap.status);
  const isHomologated = ['HOMOLOGATED', 'FROZEN'].includes(cap.status);

  if (isImplemented) implementedWeight += weight;
  if (isHomologated) homologatedWeight += weight;

  if (cap.mvp) {
    mvpTotalWeight += weight;
    if (isImplemented) mvpImplementedWeight += weight;
    if (isHomologated) mvpHomologatedWeight += weight;
  }
}

console.log("=== METRICAS ANTES ===");
console.log(JSON.stringify({
  totalCapabilities: capabilities.length,
  fullRoadmap: {
    totalWeight,
    implementedWeight,
    homologatedWeight,
    implementationPercent: Math.round((implementedWeight / totalWeight) * 100),
    readinessPercent: Math.round((homologatedWeight / totalWeight) * 100),
  },
  mvp: {
    mvpTotalWeight,
    mvpImplementedWeight,
    mvpHomologatedWeight,
    implementationPercent: Math.round((mvpImplementedWeight / mvpTotalWeight) * 100),
    readinessPercent: Math.round((mvpHomologatedWeight / mvpTotalWeight) * 100),
  }
}, null, 2));
