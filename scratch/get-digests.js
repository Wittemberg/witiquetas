const https = require('https');

function fetchHeader(url) {
  return new Promise((resolve) => {
    const req = https.request(url, { method: 'HEAD' }, (res) => {
      resolve(res.headers);
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

async function main() {
  console.log('Checking GHCR image metadata...');
  const h1 = await fetchHeader('https://ghcr.io/v2/wittemberg/witiquetas-frontend/manifests/stable');
  console.log('GHCR frontend :stable headers:', h1);
}

main();
