import sharp from 'sharp';
import path from 'node:path';

const outDir = path.join(import.meta.dirname, 'out');

function wrap(text, maxChars) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > maxChars) {
      lines.push(line.trim());
      line = w;
    } else {
      line = (line + ' ' + w).trim();
    }
  }
  if (line) lines.push(line);
  return lines;
}

function tspans(lines, x, startY, lineHeight) {
  return lines
    .map((l, i) => `<tspan x="${x}" y="${startY + i * lineHeight}">${escapeXml(l)}</tspan>`)
    .join('\n');
}

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const FONT = 'Arial, Segoe UI, sans-serif';

// ---- Instagram-style mock ----
const igCaptionLines = wrap(
  'Bakırköy sahilde muhteşem bir kahve mekânı bulduk, kesinlikle gidilmeli! Fiyatlar da gayet uygun',
  46,
);
const igSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="700">
  <defs>
    <radialGradient id="g1" cx="30%" cy="20%" r="45%">
      <stop offset="0%" stop-color="#3a2a55"/>
      <stop offset="100%" stop-color="#0c0c10" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g2" cx="75%" cy="60%" r="50%">
      <stop offset="0%" stop-color="#1a3a4a"/>
      <stop offset="100%" stop-color="#0c0c10" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="900" height="700" fill="#0c0c10"/>
  <rect width="900" height="700" fill="url(#g1)"/>
  <rect width="900" height="700" fill="url(#g2)"/>
  <circle cx="44" cy="44" r="20" fill="#dd2a7b"/>
  <text x="76" y="52" font-family="${FONT}" font-size="20" font-weight="700" fill="white">kahvedunyasi</text>
  <text font-family="${FONT}" font-size="24" fill="white">
    ${tspans(igCaptionLines, 24, 500, 34)}
  </text>
  <text x="24" y="${500 + igCaptionLines.length * 34 + 30}" font-family="${FONT}" font-size="22" font-weight="600" fill="#cfd3ff">#istanbul #kahve #bakırköy</text>
</svg>
`;

// ---- TikTok-style mock ----
const ttCaptionLines = wrap(
  'Bu tarifi mutlaka denemelisiniz! Sarımsaklı makarna sadece 15 dakikada hazır. Malzemeler: makarna, sarımsak, tereyağı, kırmızı pul biber',
  42,
);
const ttSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="700">
  <defs>
    <radialGradient id="g1" cx="70%" cy="30%" r="50%">
      <stop offset="0%" stop-color="#402020"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="900" height="700" fill="#000"/>
  <rect width="900" height="700" fill="url(#g1)"/>
  <text x="28" y="480" font-family="${FONT}" font-size="26" font-weight="700" fill="white">@lezzetduragi</text>
  <text font-family="${FONT}" font-size="25" font-weight="500" fill="white">
    ${tspans(ttCaptionLines, 28, 520, 36)}
  </text>
  <text x="28" y="${520 + ttCaptionLines.length * 36 + 30}" font-family="${FONT}" font-size="19" fill="#ddd">♪ orijinal ses - lezzetduragi</text>
</svg>
`;

// ---- Notes-app style mock ----
const notesBodyLines = wrap(
  "Yarın saat 19:00'da Ayşe ile buluşacağız, Beşiktaş'taki yeni restoranda. Rezervasyon adı: Yunus Emir. Not: Doğum günü hediyesi almayı unutma!",
  40,
);
const notesSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="700">
  <rect width="900" height="700" fill="#fdfdf7"/>
  <text x="50" y="100" font-family="${FONT}" font-size="34" font-weight="700" fill="#1a1a1a">Yapılacaklar</text>
  <text x="50" y="140" font-family="${FONT}" font-size="18" fill="#999">4 Ağustos 2026</text>
  <text font-family="${FONT}" font-size="26" fill="#1a1a1a">
    ${tspans(notesBodyLines, 50, 200, 42)}
  </text>
</svg>
`;

const jobs = [
  ['instagram.png', igSvg],
  ['tiktok.png', ttSvg],
  ['notes.png', notesSvg],
];

for (const [name, svg] of jobs) {
  await sharp(Buffer.from(svg)).png().toFile(path.join(outDir, name));
  console.log('wrote', name);
}
