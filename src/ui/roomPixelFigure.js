// Pixel geometry and colours are code-owned. Profiles select existing tokens only.
const HAIR = Object.freeze({ dark:'#35313f',black:'#252532',brown:'#725044',light:'#d9b975',silver:'#b7c6d8',white:'#f0ece4',red:'#a65056',blue:'#4d7095',fantasy_cool:'#7783be',fantasy_warm:'#cc829c',unspecified:'#655b71' });
const CLOTH = Object.freeze({ historical:'#809ba9',academic:'#657598',artisan:'#b08969',combat:'#66817b',ceremonial:'#ac7297',technical:'#627d9a',fantasy:'#9b85b8',robe:'#8298b8',uniform:'#587293',formal:'#666080',casual:'#bd9eab',armor:'#8395a6',work:'#a18d65',unspecified:'#b3a0b2' });
// r84.75: 衣服颜色、瞳色和配饰也用代码自有色板；profile 只能选键名。
const TONE = Object.freeze({ black:'#3b3844', white:'#eeeae2', silver:'#c3ccd6', red:'#a8505a', pink:'#dc9fb2', gold:'#c9a24e', brown:'#8a6a52', blue:'#56739a', cyan:'#5f918b', green:'#6c8f5d', purple:'#7c669b', gray:'#8b8a93' });
const pick = (table, value) => typeof value === 'string' && Object.hasOwn(table, value) ? table[value] : table.unspecified;
const tone = value => typeof value === 'string' && Object.hasOwn(TONE, value) ? TONE[value] : '';
export function pixelFigureSvg(profile = {}) {
    const hair = pick(HAIR, profile.hairTone), coat = tone(profile.outfitTone) || pick(CLOTH, profile.outfit);
    const long = profile.hairShape === 'long', tied = profile.hairShape === 'tied';
    const robe = ['robe','historical','ceremonial','fantasy'].includes(profile.outfit);
    const armor = ['armor','combat'].includes(profile.outfit), collar = ['academic','uniform','formal','technical'].includes(profile.outfit);
    const broad = profile.build === 'broad', soft = profile.build === 'soft';
    const x = broad || soft ? 6 : 7, bodyWidth = broad || soft ? 16 : 14;
    const rect = (x, y, w, h, color) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}"/>`;
    const outline = '#443b52', skin = '#f3ccba', eye = tone(profile.eyeTone) || outline;
    const trim = profile.outfitTone === 'black' ? '#8d7a52' : '#e9d9b3';
    return `<g data-rmt-local-figure="pixel" transform="translate(-56 -100) scale(4)" shape-rendering="crispEdges">
      ${rect(5,43,20,2,'#00000020')}
      ${long ? rect(4,7,22,27,hair) + rect(6,33,18,3,hair) : ''}
      ${tied ? rect(23,9,5,20,hair) + rect(25,28,4,5,hair) + rect(24,10,4,2,'#cc879d') : ''}
      ${rect(8,36,6,7,outline)}${rect(17,36,6,7,outline)}${rect(7,42,7,2,'#33323e')}${rect(17,42,8,2,'#33323e')}
      ${rect(x,23,bodyWidth,14,outline)}${rect(x+1,23,bodyWidth-2,13,coat)}
      ${rect(x-3,25,3,10,coat)}${rect(x+bodyWidth,25,3,10,coat)}${rect(x-3,35,3,3,skin)}${rect(x+bodyWidth,35,3,3,skin)}
      ${robe ? rect(x-2,32,bodyWidth+4,7,coat) + rect(x-1,38,bodyWidth+2,2,outline) + rect(x,29,bodyWidth,2,trim) : ''}
      ${collar ? rect(10,24,3,3,'#e6e4e9') + rect(18,24,3,3,'#e6e4e9') + rect(15,26,2,7,outline) : ''}
      ${armor ? rect(x-3,25,5,4,'#b5c7d0') + rect(x+bodyWidth-2,25,5,4,'#b5c7d0') + rect(x+3,27,bodyWidth-6,6,'#a5b8c4') : ''}
      ${profile.outfit === 'artisan' || profile.outfit === 'work' ? rect(10,27,10,10,'#e2c9a7') + rect(13,30,4,3,coat) : ''}
      ${rect(6,4,18,3,hair)}${rect(3,7,24,13,hair)}${rect(5,19,20,4,hair)}
      ${rect(6,10,18,11,skin)}${rect(8,21,14,2,skin)}${rect(4,13,2,5,skin)}${rect(24,13,2,5,skin)}
      ${rect(8,15,2,3,eye)}${rect(19,15,2,3,eye)}${rect(8,15,1,1,'#fff9ed')}${rect(19,15,1,1,'#fff9ed')}
      ${rect(6,18,4,1,'#e59fa6')}${rect(20,18,3,1,'#e59fa6')}${rect(14,20,3,1,'#b4767f')}
      ${rect(5,8,20,3,hair)}${rect(6,10,5,3,hair)}${rect(11,10,4,2,hair)}${rect(22,10,3,5,hair)}
      ${profile.hairShape === 'curly' ? rect(2,9,3,5,hair) + rect(25,9,3,5,hair) + rect(4,19,3,5,hair) : ''}
      ${profile.hairShape === 'short' ? rect(6,5,7,1,'#ffffff25') : rect(7,6,8,1,'#ffffff30')}
      ${profile.hairShape === 'medium' ? rect(3,18,4,9,hair) + rect(23,18,4,9,hair) : ''}
      ${profile.hairShape === 'cropped' ? rect(5,19,20,4,skin) + rect(8,21,14,2,skin) + rect(6,18,4,1,'#e59fa6') + rect(20,18,3,1,'#e59fa6') + rect(14,20,3,1,'#b4767f') : ''}
      ${profile.hairShape === 'covered' ? rect(2,3,26,6,coat) + rect(2,8,4,16,coat) + rect(24,8,4,16,coat) : ''}
      ${detailSvg(profile.detail, { rect, hair, skin, coat, x, bodyWidth })}
    </g>`;
}

function detailSvg(detail, { rect, hair, skin, coat, x, bodyWidth }) {
    const frame = (left) => rect(left,14,5,1,'#3a3542') + rect(left,18,5,1,'#3a3542') + rect(left,14,1,5,'#3a3542') + rect(left+4,14,1,5,'#3a3542');
    switch (detail) {
    case 'glasses': return frame(7) + frame(18) + rect(12,15,6,1,'#3a3542');
    case 'animal_ears': return rect(4,0,6,6,hair) + rect(20,0,6,6,hair) + rect(6,2,2,3,'#e9a3b3') + rect(22,2,2,3,'#e9a3b3');
    case 'pointed_ears': return rect(1,12,3,2,skin) + rect(0,11,2,2,skin) + rect(26,12,3,2,skin) + rect(28,11,2,2,skin);
    case 'horns': return rect(7,0,3,5,'#e6d8bd') + rect(6,0,2,2,'#e6d8bd') + rect(20,0,3,5,'#e6d8bd') + rect(22,0,2,2,'#e6d8bd');
    case 'headwear': return rect(12,1,6,4,'#d4ad55') + rect(14,0,2,2,'#f1d88a');
    case 'visor': return rect(6,14,18,3,'#6fb3d6') + rect(6,14,18,1,'#bfe4f3');
    case 'headphones': return rect(5,3,20,2,'#4b4652') + rect(2,11,4,7,'#4b4652') + rect(24,11,4,7,'#4b4652');
    case 'scarf': return rect(x,22,bodyWidth,3,'#c96f7d') + rect(x+bodyWidth-4,24,3,6,'#c96f7d');
    default: return '';
    }
}
