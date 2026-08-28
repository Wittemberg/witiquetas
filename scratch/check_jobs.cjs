const https = require('https');

function fetchJobs() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: '/repos/Wittemberg/witiquetas/actions/runs/33092878691/jobs',
      headers: { 'User-Agent': 'NodeJS' }
    };
    https.get(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function check() {
  const data = await fetchJobs();
  if (data.jobs) {
    for (const job of data.jobs) {
      console.log(`Job: ${job.name} | Status: ${job.status} | Conclusion: ${job.conclusion}`);
    }
  }
}

check();
