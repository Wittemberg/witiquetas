import https from 'node:https';

function fetchJson(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'Node' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

async function main() {
  const runData = await fetchJson('https://api.github.com/repos/wittemberg/witiquetas/actions/runs/32731783462');
  console.log('Run Conclusion:', runData?.conclusion);
}

main();
