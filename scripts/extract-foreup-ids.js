import https from 'https';

const url = 'https://foreupsoftware.com/index.php/booking/20277/4169';

const fetch = (url) =>
  new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(data));
      })
      .on('error', reject);
  });

const main = async () => {
  const body = await fetch(url);
  console.log('body length', body.length);
  const substr = 'booking/20277/';
  console.log('substring present', body.includes(substr));
  let start = 0;
  while (true) {
    const idx = body.indexOf(substr, start);
    if (idx === -1) break;
    const idStart = idx + substr.length;
    const idEnd = body.indexOf('#', idStart);
    if (idEnd === -1) break;
    const id = body.slice(idStart, idEnd);
    console.log(id, body.slice(Math.max(0, idx - 80), idEnd + 120).replace(/\s+/g, ' '));
    start = idEnd + 1;
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});