import https from 'node:https';

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    }).on('error', err => resolve({ statusCode: 500, body: err.message }));
  });
}

async function main() {
  console.log('Checking production endpoints on https://witiquetas.wrtec.com.br ...');
  
  const versionJson = await fetchUrl('https://witiquetas.wrtec.com.br/version.json');
  console.log('version.json:', versionJson.body.trim());

  const apiVersion = await fetchUrl('https://witiquetas.wrtec.com.br/api/version');
  console.log('/api/version:', apiVersion.body.trim());

  const apiHealth = await fetchUrl('https://witiquetas.wrtec.com.br/api/health');
  console.log('/api/health:', apiHealth.body.trim());
}

main();
