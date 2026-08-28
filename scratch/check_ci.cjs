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
  if (data && data.workflow_runs) {
    data.workflow_runs.forEach(run => {
      console.log(`Run #${run.run_number} | Event: ${run.event} | Status: ${run.status} | Conclusion: ${run.conclusion} | Commit: ${run.head_sha.substring(0,7)}`);
    });
  } else {
    console.log('Could not fetch runs:', data);
  }
}

main();
