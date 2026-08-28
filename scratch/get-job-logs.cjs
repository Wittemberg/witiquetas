const https = require('https');

function fetchJson(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Node' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
  });
}

async function main() {
  const data = await fetchJson('https://api.github.com/repos/Wittemberg/witiquetas/actions/runs?per_page=3');
  if (!data || !data.workflow_runs) {
    console.log('API response:', data);
    return;
  }
  const runId = data.workflow_runs[0].id;
  console.log('Run ID:', runId, 'Commit:', data.workflow_runs[0].head_sha);
  const jobs = await fetchJson(`https://api.github.com/repos/Wittemberg/witiquetas/actions/runs/${runId}/jobs`);
  if (!jobs || !jobs.jobs) {
    console.log('Jobs response:', jobs);
    return;
  }
  jobs.jobs.forEach(job => {
    console.log(`Job: ${job.name} | Status: ${job.status} | Conclusion: ${job.conclusion}`);
    job.steps.forEach(step => {
      if (step.conclusion === 'failure') {
        console.log(`  -> Step FAILED: ${step.name}`);
      }
    });
  });
}

main();
