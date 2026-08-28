import https from 'node:https';

https.get('https://api.github.com/repos/wittemberg/witiquetas/actions/runs?per_page=3', {
  headers: { 'User-Agent': 'Node' }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    if (json.workflow_runs) {
      json.workflow_runs.forEach(r => {
        console.log(`Run #${r.run_number}: ${r.name} | Status: ${r.status} | Conclusion: ${r.conclusion} | Commit: ${r.head_sha}`);
      });
    }
  });
});
