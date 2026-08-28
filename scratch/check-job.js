import https from 'node:https';

https.get('https://api.github.com/repos/wittemberg/witiquetas/actions/runs/32498243769/jobs', {
  headers: { 'User-Agent': 'Node' }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    // get jobs for latest run
    https.get('https://api.github.com/repos/wittemberg/witiquetas/actions/runs?per_page=1', {
      headers: { 'User-Agent': 'Node' }
    }, (res2) => {
      let data2 = '';
      res2.on('data', chunk => data2 += chunk);
      res2.on('end', () => {
        const r = JSON.parse(data2).workflow_runs[0];
        https.get(`https://api.github.com/repos/wittemberg/witiquetas/actions/runs/${r.id}/jobs`, {
          headers: { 'User-Agent': 'Node' }
        }, (res3) => {
          let data3 = '';
          res3.on('data', chunk => data3 += chunk);
          res3.on('end', () => {
            const jobs = JSON.parse(data3).jobs;
            console.log(`Run #${r.run_number} (${r.head_sha}): ${r.status}`);
            jobs.forEach(j => {
              console.log(` Job: ${j.name} - ${j.status} / ${j.conclusion}`);
              j.steps.forEach(s => {
                if (s.status === 'in_progress' || s.conclusion === 'failure') {
                  console.log(`   Step: ${s.name} - ${s.status} / ${s.conclusion}`);
                }
              });
            });
          });
        });
      });
    });
  });
});
