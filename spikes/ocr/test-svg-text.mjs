import sharp from 'sharp';

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="200">
  <rect width="900" height="200" fill="#0c0c10"/>
  <text x="30" y="90" font-family="Arial, Segoe UI, sans-serif" font-size="32" fill="white">
    Bakırköy sahilde muhteşem bir kahve mekânı
  </text>
  <text x="30" y="140" font-family="Arial, Segoe UI, sans-serif" font-size="32" fill="white">
    Çiçek Üşenmez öğrenci İstanbul şeker
  </text>
</svg>
`;

await sharp(Buffer.from(svg)).png().toFile('spikes/ocr/out/svg-test.png');
console.log('done');
