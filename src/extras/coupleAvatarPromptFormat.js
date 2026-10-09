// Locally authored tag recipes. These are a second rendering of the existing
// choices, not a prose-to-tag translator. User text and identity references are
// kept intact; no model request, parsing of prose, or preset lookup occurs here.
import * as subject_details from './coupleAvatarSubjectDetails.js';
const STYLE_TAGS = Object.freeze({
    'chibi-dumpling': 'chibi, two-head-tall proportions, oversized head, tiny torso, stubby arms and feet, rounded dumpling shapes, simple facial features, minimal facial shading',
    'chibi-three-head': 'chibi, three-head-tall proportions, small clothed body, expressive little gestures, recognizable clothing details, balanced miniature proportions',
    'chibi-headshot': 'chibi portrait, oversized rounded face, small nose and mouth, enlarged expressive eyes, distinctive hair silhouette, small visible shoulders',
    'chibi-doodle': 'hand-drawn doodle, dot eyes, uneven pen-stroke mouth and hair, simplified silhouette, small flat color patches, loose lively outlines',
    'chibi-animal': 'animal-only chibi illustration, rounded animal skulls, species-specific muzzles or beaks, compact animal bodies, miniature animal limbs, individual markings and accessories',
    'chibi-meme': 'chibi reaction illustration, squashed miniature bodies, exaggerated mouth and eyebrows, distinct reactions, simple outlines, flat fills',
    'anime-clean': 'Japanese anime illustration, thin clean facial contours, separate hair locks, light flat colors, small clean shadows, crisp delicate linework',
    'anime-cel': 'cel-shaded anime keyframe, crisp linework, hard-edged facial and clothing shadows, flat local colors, small highlight shapes',
    'anime-shojo': 'romantic shoujo manga, fine expressive ink contours, facial and clothing screentones, delicate eyelashes, affectionate eyes, generous white areas',
    'anime-retro90': '1990s anime, analog ink contours, flat painted cels, two-step face shadows, distinct hair shapes, restrained film grain',
    'anime-korean': 'airy Korean portrait illustration, thin colored outlines, translucent skin tones, soft sparse shadows, clear airy eyes, economical hair detail',
    'anime-storybook': 'fairytale picture-book illustration, simple facial shapes, tactile brush marks, irregular hand-drawn contours, quiet broad color areas, narrative charm',
    'art-gongbi': 'Chinese gongbi painting, hair-fine continuous ink contours, fine hair strands, fine garment folds, layered restrained color washes, slender ink edges',
    'art-ink': 'Chinese ink-and-light-color painting, wet and dry ink strokes, brush-shaped hair and clothes, broken brush edges, quiet paper areas, fine facial strokes, sparse color washes',
    'art-watercolor': 'transparent watercolor portrait, overlapping translucent washes, wet-on-wet transitions, pigment blooms, controlled facial strokes, soft hair and clothing edges, subtle paper grain',
    'art-pencil': 'colored-pencil drawing, directional pencil strokes on face and hair and fabric, layered crosshatching, visible paper tooth, uncolored paper highlights',
    'art-oil': 'oil portrait painting, directional facial brushstrokes, solid paint planes, impasto edges, individually painted hair masses, coherent soft lighting, rich color relationships',
    'art-sketch': 'monochrome graphite portrait sketch, pencil-built face planes, crosshatched hair and clothing, varied pencil pressure, erased highlights, white paper, identity colors as tonal differences',
    'craft-plush': 'soft plush dolls, fabric-seamed faces and bodies, short fuzzy pile, embroidered eyes and mouths, stuffed rounded limbs, fabric hair tufts, tactile stitching',
    'craft-clay': 'handcrafted clay figurines, sculpted rounded faces, chunky clay hair locks, small modeled limbs, matte handmade surfaces, physical cast shadows',
    'craft-crochet': 'crocheted amigurumi dolls, crochet-loop faces and bodies, visible yarn stitches, yarn-strand hair, tiny crocheted clothes, stitched eyes',
    'craft-felt': 'needle-felted wool dolls, fiber-built cheeks and hair and limbs, fine soft fibers, uneven fuzzy edges, soft wool volume, handmade contours',
    'craft-vinyl': 'designer vinyl toys, large simple molded shapes, satin vinyl faces, printed facial features, sculpted hair masses, small mold seams, collectible toy proportions',
    'craft-paper': 'layered cut-paper collage portraits, cut-paper faces and hair and clothes, sharp and torn paper edges, tiny inter-layer shadows, tactile colored paper',
    'graphic-pixel': '16-bit pixel art bust portraits, consistent visible pixel grid, carefully shaped pixel clusters, clear facial color separation, distinct pixel hair and clothing, crisp stepped edges, nuanced retro game palette',
    'graphic-line': 'minimal line-art portraits, economical continuous facial and hair contours, open unshaded interiors, distinctive silhouettes, expressive linework',
    'graphic-silhouette': 'two-color silhouette portraits, flat color shapes, distinctive profiles and hair and accessory contours, negative-space facial shapes, identity colors as contrasting shapes',
    'graphic-print': 'vintage relief-print portraits, carved facial and hair and fabric hatching, limited ink overprints, uneven ink edges, flat printed shapes',
    'graphic-sticker': 'die-cut character sticker illustrations, bold simplified silhouettes, readable expressions, clean flat and cel colors, subject-following white contour outlines',
    'graphic-geometric': 'geometric portrait illustration, geometric cheeks and eyes and hair and clothing, balanced flat color blocks, crisp color boundaries, distinctive silhouettes',
    'photo-film': 'natural portrait photography, candid faces, natural facial asymmetry, coherent lens depth, fine film grain, restrained analog color response',
    'photo-daylight': 'candid daylight portrait photography, natural facial planes, clear skin texture, relaxed posture, soft natural light, soft background defocus',
    'photo-studio': 'vintage studio portrait photography, shared studio backdrop, controlled key light, soft facial shadows, restrained vintage photographic color',
    'photo-night': 'cinematic nighttime portrait photography, natural facial structure, shared colored night lighting, natural shadow falloff, background bokeh, readable eyes',
    'photo-backlight': 'backlit portrait photography, natural facial structure, fine rim-lit hair, gentle optical bloom, shallow depth of field, readable eyes',
    'photo-mono': 'black-and-white portrait photography, photographic tonal gradients, natural skin texture, coherent lens perspective, expressive faces, identity colors as tonal differences',
    'chibi-mochi': 'mochi-like chibi, near-spherical head-and-body silhouette, tiny feet, miniature limbs, dot facial features, soft squashy shapes, small signature accessories',
    'chibi-sleepy': 'sleepy miniature chibi, oversized sleepy head, half-closed eyes, stubby small body, soft rounded loose outlines, distinct sleepy reactions',
    'chibi-crayon': 'childlike crayon chibi illustration, wax-stroke faces and hair and bodies, naive rounded proportions, simple expressions, layered wax fills, small paper-grain flecks',
    'anime-flat': 'flat-color anime illustration, clear economical facial and clothing contours, flat local colors, minimal shadows, clean silhouettes, restrained palette',
    'anime-manga': 'black-and-white manga portrait, expressive black ink contours, solid black areas, white paper, patterned screentones, ink-shaped expressions, identity colors as tonal differences',
    'anime-pastel': 'pastel animation drawing, soft colored outlines, round animated faces, pale flat cel shadows, pastel character colors, airy candy-colored palette',
    'anime-webtoon': 'modern webtoon portrait illustration, economical facial contours, one or two facial shadow shapes, broad clean hair masses, flat skin colors, selective cel shading',
    'art-gouache': 'opaque gouache painting, overlapping chalky facial and hair brushstrokes, matte broad color planes, visible bristle marks, irregular painted edges',
    'art-pastel': 'oil-pastel portrait drawing, thick wax strokes on face and hair and fabric, broken color, visible paper tooth, smudged layered edges',
    'art-charcoal': 'monochrome charcoal portrait drawing, resolved charcoal face planes, energetic hair strokes, controlled rubbed midtones, lifted paper highlights, gestural contours, velvety paper texture, identity colors as tonal differences',
    'art-risograph': 'risograph portrait print, limited spot-color layers, fine visible ink grain, subtle broad-edge registration shifts, aligned facial contours, distinct individual features',
    'craft-porcelain': 'glazed porcelain dolls, small sculpted ceramic faces, painted-on facial features and hair, rounded porcelain bodies, translucent glaze reflections',
    'craft-wood': 'hand-carved wooden dolls, faceted carved faces and hair and bodies, visible wood grain, tiny painted facial features, solid wooden silhouettes',
    'craft-origami': 'origami character figures, folded-paper heads and faces and clothing, geometric paper planes, sharp creases, visible paper thickness, small cast shadows',
    'craft-bead': 'fused-bead portraits, individual cylindrical plastic beads, regular square grid, bead-built facial features and hair, visible bead holes, flat craft object photography',
    'graphic-8bit': '8-bit pixel art bust portraits, consistent square pixel grid, small limited palette, readable pixel facial features, distinctive pixel hair and clothing, crisp stepped edges',
    'graphic-pop': 'pop-art portraits, bold graphic facial outlines, large halftone dots on subjects, contrasting flat spot colors, graphic hair and clothes',
    'graphic-comic': 'vintage comic-book portraits, heavy expressive ink contours, crosshatched facial shadows, textured printed halftone colors, simplified readable hair masses',
    'graphic-lino': 'two-color linocut stamp portraits, broad carved negative spaces, clear printed faces and hair and clothing, controlled ink-transfer texture, coherent facial marks, clean cut silhouettes',
    'photo-instant': 'instant-film candid portrait photography, natural faces, soft direct flash, mild analog color shifts, shallow lens depth, informal snapshot, edge-to-edge scenery',
    'photo-rain': 'rainy-window portrait photography, natural facial planes, realistic skin texture, soft window sidelight, optical glass reflections, defocused background raindrops',
    'animal-cat': 'small cats, feline skulls, round feline faces, triangular ears, short muzzles, whiskers, paws, curved tails, individual fur markings, animal-only illustration',
    'animal-dog': 'small dogs, canine muzzles and noses, soft dog ears, paws, wagging tails, individual fur markings, distinct animal expressions, animal-only illustration',
    'animal-fox': 'little foxes, long fox muzzles, pointed ears, fluffy cheek fur, four animal limbs, bushy tails, individual fur markings, animal-only storybook illustration',
    'animal-rabbit': 'little lop-eared rabbits, rabbit noses, round cheeks, long floppy ears, small forepaws, rounded hindquarters, round tails, animal-only illustration',
    'animal-bear': 'small bears, short bear muzzles, round ears, compact thick animal bodies, broad soft paws, individual posture and accessories, animal-only illustration',
    'animal-bird': 'round little birds, visible beaks, feathered bodies, tiny wings, bird feet, individual feather markings, distinct bird expressions, animal-only illustration',
    'animal-seal': 'plump baby seals, short seal muzzles, whiskers, smooth rounded animal bodies, flippers, individual markings and accessories, distinct seal expressions, animal-only illustration',
    'fantasy-glass': 'stained-glass portraits, colored-glass cheeks and eyes and hair and clothing, lead seams, translucent glass shapes, faceted transmitted light',
    'fantasy-enamel': 'hard-enamel portrait pins, raised polished metal outlines, glossy solid enamel faces and hair and clothes, physical pin edges and thickness, collectible objects',
    'fantasy-embroidery': 'embroidered portraits on fabric, directional thread-stitch faces and hair, stitched clothing, visible satin stitches, tactile thread relief',
    'fantasy-mosaic': 'ceramic portrait mosaics, tessera-built facial features and hair and clothes, tiny colored ceramic tiles, visible grout, glazed reflections',
    'fantasy-blueprint': 'cyanotype portrait print, Prussian blue and paper white only, photographic contact-print silhouettes, uneven print tone, botanical shadows, identity colors as tonal differences',
    'fantasy-shadow': 'Chinese shadow-puppet figures, translucent colored leather faces and bodies, cutout facial ornament, articulated puppet limbs, intricate carved patterns, backlit color',
    'fantasy-luminous': 'illuminated layered-paper portrait diorama, cut-paper faces and bodies, physical paper layers and edges, visible edge depth, gentle light between layers',
    'fantasy-fresco': 'mineral-pigment fresco portraits, matte mineral facial planes, flowing mural hair contours, broad restrained colors, fine plaster texture, selective surface wear, clear facial features',
});

// Each entry is [shared scene, left action, right action]. The role recipes
// deliberately differ, so switching formats cannot turn an exchange into two
// mirrored poses or lose which subject offers and which subject receives.
const INTERACTION_TAGS = Object.freeze({
    '半颗爱心': ['complementary heart halves, complete heart at center', 'holding left heart half toward right, affectionate expression', 'holding right heart half toward left, answering smile'],
    '隔空对望': ['mutual gaze, affectionate connection', 'turned slightly right, looking at partner', 'turned slightly left, returning gaze, soft smile'],
    '左右眨眼': ['complementary playful winks, distinct head tilts', 'confident playful wink, tilted head', 'bashful wink, opposite head tilt'],
    '一根红线': ['red thread connecting both subjects, continuous thread across center', 'lifting red thread end toward right', 'gently holding other red thread end toward left, attentive gaze'],
    '隔空击掌': ['high five at center, connected reaching limbs', 'raised inner limb toward right, playful anticipation', 'inner limb reaching left, answering high five'],
    '悄悄牵住衣角': ['gentle clothing or accessory tug, shy reaction', 'gently catching partner clothing edge or accessory', 'glancing back at clothing tug, shy expression'],
    '递出一朵花': ['flower exchange at center', 'offering flower toward right', 'reaching left, receiving flower'],
    '碰一碰鼻尖': ['gentle nose touch, inward-facing faces', 'leaning right, gentle forward head tilt', 'leaning left, answering head tilt, noses touching'],
    '替你理围巾': ['scarf adjustment, caring gesture', 'reaching inward, straightening partner scarf', 'still posture, soft smile, scarf being adjusted'],
    '藏在背后的小花': ['hidden flower surprise', 'small flower hidden behind back, expectant expression', 'peeking inward, curious gaze toward hidden flower'],
    '一边闹一边笑': ['playful teasing, responsive laughter', 'animated teasing gesture, mischievous expression', 'laughing in response, relaxed different posture'],
    '假装生气': ['mock annoyance, affectionate amusement', 'puffed cheeks, mock annoyed expression', 'suppressed amused smile, sidelong gaze'],
    '偷偷模仿你': ['playful pose imitation, contrasting expressions', 'serious confident pose', 'imitating partner pose, mischievous expression'],
    '一边偷看一边躲': ['shy glances, small hiding prop', 'peeking inward from behind small prop', 'bashfully turning slightly away, noticing partner glance'],
    '互相做鬼脸': ['exchanged silly faces, distinct expressions', 'silly face toward right, puffed cheeks', 'different silly face toward left, tongue out'],
    '一边困一边闹': ['sleepy and energetic contrast', 'drowsy expression, half-closed eyes, relaxed posture', 'energetic inward lean, playful attention-seeking gesture'],
    '偷偷戴上同款': ['matching small accessories, shared secret', 'showing matching accessory, knowing smile', 'wearing matching accessory, feigned innocent expression'],
    '被发现的偷笑': ['caught laughing, knowing glance', 'suppressing laugh, caught expression', 'knowing sidelong look toward left'],
    '举杯碰杯': ['shared toast, cups meeting at center', 'raising cup toward right inner edge', 'tilting cup toward left, answering toast'],
    '一人一只小动物': ['one small companion pet per subject, affectionate pet interaction', 'gently cuddling small pet, inward gaze', 'another small pet leaning close, inward answering gaze'],
    '耳机分你一只': ['shared earphone cable, one earphone per subject', 'offering earphone cable inward, pleased expression, one earphone', 'listening through one earphone, soft answering expression'],
    '同款不同色': ['coordinated clothing or accessories, complementary colors', 'first coordinated color version, open pose', 'complementary color version, relaxed different pose'],
    '一起看烟花': ['shared fireworks, matching reflected light, distinct delighted expressions', 'pointing toward fireworks, delighted surprise', 'watching same fireworks, quiet smile, reflected fireworks light'],
    '并肩吹泡泡': ['blowing bubbles together, bubbles drifting across scene', 'blowing bubble toward right', 'watching incoming bubble, bubble wand ready, answering smile'],
    '共用一条围巾': ['one long shared scarf across center', 'holding scarf end near chest', 'nestled in other scarf end, answering head tilt'],
    '分享一把伞': ['one shared umbrella, offered shelter', 'holding umbrella tilted inward toward partner', 'leaning into shared shelter, grateful expression'],
    '一起读一本书': ['shared open book at lower center', 'pointing at book passage, attentive expression', 'following indicated passage, amused reaction'],
    '举起同款相机': ['matching small cameras, shared photography moment', 'camera raised, taking picture toward right', 'matching camera held lower, smiling for picture'],
    '一人一半饼干': ['two halves of same cookie', 'offering cookie half inward', 'holding complementary cookie half, pleased answering expression'],
    '递来最后一口': ['last snack bite offered at center', 'offering last snack bite toward right', 'leaning toward offered bite, pleasantly surprised eyes'],
    '草莓分给你': ['shared strawberry snack', 'holding out strawberry toward right', 'eager lean toward strawberry, answering expression'],
    '两杯不同口味': ['two drink flavors, matching cups in different colors', 'holding first drink flavor, curious glance', 'holding other drink flavor, pleased answering expression'],
    '偷吃被发现': ['snack crumbs, caught snacking', 'crumbs near mouth, caught expression', 'looking at partner crumbs, amused surprise'],
    '一串糖葫芦': ['shared candied-fruit skewer', 'offering candied-fruit skewer toward right', 'leaning inward, preparing to bite offered fruit'],
    '交换便当': ['two small lunch boxes, lunch box exchange', 'offering first lunch box inward, warm smile', 'receiving first lunch box, offering second lunch box back'],
    '融化的冰淇淋': ['melting ice cream, offered napkin', 'holding melting ice cream, worried expression', 'offering napkin toward left, reassuring smile'],
    '接住一片落叶': ['drifting autumn leaf across center', 'releasing leaf toward right', 'reaching inward, catching drifting leaf'],
    '一起捧雪花': ['snowflakes near faces, distinct delighted reactions', 'cupping snowflake, surprised expression', 'watching another snowflake, soft delighted expression'],
    '围巾里躲风': ['shared warmth, wind shelter', 'nestled low in scarf, braced against wind', 'leaning inward for warmth, gentle expression'],
    '花瓣落在头顶': ['flower petal on head, affectionate discovery', 'unnoticed flower petal on head', 'pointing out partner head petal, warm smile'],
    '夏夜捕萤': ['summer-night fireflies, warm connecting light trails', 'following nearby firefly, attentive gaze', 'gently reaching toward another firefly, curious expression'],
    '雨后踩水花': ['small puddle splash after rain', 'playfully splashing puddle toward right', 'reacting to incoming splash, amused surprise'],
    '同一阵风': ['shared breeze, same-direction hair or fur or accessory movement', 'facing breeze, lifted gaze', 'lightly braced against same breeze, different head angle'],
    '日与月的呼应': ['sun and moon motifs, complementary warm and cool light', 'sun motif, warm light, open pose', 'moon motif, cool light, different quiet pose'],
    '星星递给你': ['small glowing star exchange', 'offering glowing star toward right', 'reaching inward toward offered star'],
    '拼成一朵花': ['complementary flower halves, completed flower at center', 'holding first flower half at inner edge', 'holding complementary flower half, completing flower, answering expression'],
    '纸飞机传话': ['paper airplane across center', 'releasing paper airplane toward right', 'ready to catch incoming paper airplane from left'],
    '两边同一片海': ['shared sea horizon, sea breeze, different seashells', 'showing first seashell, inward gaze', 'showing different seashell, answering gaze toward left'],
});

// Exact local randomCoupleIdeas templates have known actions, unlike arbitrary
// user prose. Each moment is [literal wording, shared tags, left tags, right tags].
const IDEA_TAG_MOMENTS = Object.freeze([
    ['左边递出一朵小花，右边伸手接住', 'small flower exchange at center', 'offering small flower toward right', 'reaching left, receiving small flower'],
    ['左边偷藏一颗糖，右边假装没发现', 'secretly hidden candy, affectionate shared secret', 'secretly hiding piece of candy', 'feigned ignorance of hidden candy'],
    ['左边举起一半爱心，右边拿着另一半回应', 'complementary heart halves, complete heart at center', 'raising first heart half toward right', 'holding complementary heart half toward left, answering gesture'],
    ['左边轻轻拉住围巾一端，右边靠过来', 'gentle scarf tug, shared closeness', 'gently tugging one scarf end', 'leaning left in response to scarf tug'],
    ['左边捧着小星星，右边试着触碰它的光', 'small glowing star, shared starlight', 'holding small glowing star toward right', 'reaching left, touching offered starlight'],
    ['左边吹出一个泡泡，右边追着泡泡看', 'drifting bubble across center', 'blowing bubble toward right', 'eyes following drifting bubble from left'],
    ['左边把小纸船推过来，右边在另一侧接住', 'little paper boat exchange', 'pushing little paper boat toward right', 'catching paper boat from left'],
    ['左边藏在叶子后偷看，右边歪头找它', 'playful hiding behind leaf', 'peeking from behind leaf', 'head tilt, looking left for hidden partner'],
    ['左边递来热饮，右边把小饼干分过去', 'warm drink and small cookie exchange', 'offering warm drink toward right', 'offering small cookie toward left in return'],
    ['左边举着小相机，右边故意做个鬼脸', 'small camera, playful portrait moment', 'raising small camera toward right', 'playful silly face for partner camera'],
    ['左边把花瓣放到头顶，右边学着戴上另一片', 'flower petals on heads, playful imitation', 'placing flower petal on own head', 'imitating gesture, wearing another flower petal'],
    ['左边送出纸飞机，右边伸手迎接', 'paper airplane across center', 'sending paper airplane toward right', 'reaching left, catching incoming paper airplane'],
    ['左边指着远处的烟花，右边偷偷看左边', 'distant fireworks, secret affectionate glance', 'pointing toward distant fireworks', 'secretly glancing left at partner'],
    ['左边捧着一团雪，右边围着围巾笑', 'small snowball, cozy scarf', 'cupping little snowball', 'smiling, nestled in scarf'],
    ['左边戴着歪歪的小帽子，右边伸手扶正', 'small tilted hat, caring adjustment', 'wearing small tilted hat', 'reaching left, straightening partner tilted hat'],
    ['左边递出一枚贝壳，右边回赠一颗小石子', 'seashell and pebble exchange', 'offering seashell toward right', 'giving small pebble toward left in return'],
]);
const IDEA_TAG_MOODS = Object.freeze([
    ['一个认真、一个忍不住笑', 'serious expression', 'amused smile'],
    ['一个害羞、一个温柔回应', 'shy expression', 'gentle warm response'],
    ['一个得意、一个假装嫌弃', 'proud playful expression', 'playfully unimpressed reaction'],
    ['一个好奇、一个耐心陪伴', 'curious expression', 'patient caring expression'],
    ['一个困困的、一个很有精神', 'sleepy expression', 'energetic expression'],
    ['一个有点惊讶、一个偷偷开心', 'slightly surprised expression', 'quietly delighted expression'],
]);
const IDEA_TAG_SCENES = Object.freeze([
    ['纯色背景铺满画面，重点放在动作和表情', 'quiet solid-color background, edge-to-edge color, prominent gestures and expressions'],
    ['同一束柔光落在两边', 'shared soft light on both subjects'],
    ['两边用相呼应的淡色背景', 'coordinated pale colors, continuous background'],
    ['共享一个小小的窗边场景', 'shared small window-side scene'],
    ['点缀几片花瓣，不遮住脸', 'few drifting petals around subjects, unobscured faces'],
    // The legacy quiet-ground wording still describes a continuous full image.
    ['背景留白，重点放在动作和表情', 'quiet solid-color background, edge-to-edge color, prominent gestures and expressions'],
]);

function tags(parts) {
    return parts.filter(value => typeof value === 'string' && value.length > 0).join(', ');
}

function builtInIdeaTags(raw) {
    if (typeof raw !== 'string' || !raw) return null;
    for (const moment of IDEA_TAG_MOMENTS) {
        for (const mood of IDEA_TAG_MOODS) {
            for (const scene of IDEA_TAG_SCENES) {
                const exact = `${moment[0]}；${mood[0]}。${scene[0]}`;
                // Match whole known templates only, with the same optional
                // final full stop as coupleInteraction. Edited text stays raw.
                if (raw === exact || raw === `${exact}。`) return [
                    tags([moment[1], scene[1]]),
                    tags([moment[2], mood[1]]),
                    tags([moment[3], mood[2]]),
                ];
            }
        }
    }
    return null;
}

function interactionTags(settings, chosen, animal) {
    // Only exact catalog labels select a recipe; arbitrary saved user strings
    // such as "constructor" remain literal text, including in both role blocks.
    const preset = Object.prototype.hasOwnProperty.call(INTERACTION_TAGS, settings.interaction)
        ? INTERACTION_TAGS[settings.interaction] : null;
    if (animal && settings.interaction === '碰一碰鼻尖') {
        if (chosen?.id === 'animal-bird') return ['gentle beak touch, inward-facing bird faces', 'leaning right, gentle forward head tilt', 'leaning left, answering head tilt, beaks touching'];
        if (chosen?.id === 'chibi-animal') return ['gentle muzzle or beak touch, inward-facing animal faces', 'leaning right, gentle forward head tilt', 'leaning left, answering head tilt, muzzles or beaks touching'];
    }
    if (animal && settings.interaction === '同一阵风') return [
        chosen?.id === 'animal-bird' ? 'shared breeze, same-direction feather or accessory movement'
            : chosen?.id === 'chibi-animal' ? 'shared breeze, same-direction fur or feather or accessory movement'
                : 'shared breeze, same-direction fur or accessory movement',
        preset[1], preset[2],
    ];
    if (preset) return preset;
    const raw = settings.interaction === '自定义互动' ? settings.interactionDetail : settings.interaction;
    const idea = builtInIdeaTags(raw);
    if (idea) return idea;
    if (raw && raw !== '交给灵感') return [raw, tags(['left role in custom interaction', raw]), tags(['right role in custom interaction', raw])];
    return ['affectionate interaction, complementary expressions, spontaneous gestures', 'playful individual gesture, attentive expression', 'responsive individual gesture, warm expression'];
}

function animalGestureTags(chosen) {
    if (chosen?.id === 'animal-bird') return 'wing gestures, beak interaction, bird feet';
    if (chosen?.id === 'animal-seal') return 'flipper gestures, seal muzzle interaction';
    if (chosen?.id === 'chibi-animal') return 'species-appropriate paws or wings or flippers, animal gestures';
    return 'forepaw gestures, animal muzzle interaction';
}

export function coupleAvatarTagParts({ settings, chosen, animal, object, subject, fullFigure, appearances, negative,
    covered = [false, false], clothing = { people: ['', ''] }, interactionDirection = null }) {
    const [interaction, leftAction, rightAction] = interactionTags(settings, chosen, animal);
    const originalRendering = chosen ? STYLE_TAGS[chosen.id] || chosen.prompt : settings.customStyle;
    const anyCovered = covered.some(Boolean);
    const rendering = subject_details.coupleVisibleRecipe(originalRendering, anyCovered && !!chosen);
    const ownedInteraction = Object.prototype.hasOwnProperty.call(INTERACTION_TAGS, settings.interaction);
    const framing = !chosen ? '' : fullFigure
        ? 'full body, complete stylized figures, selected body proportions, readable faces, connected limbs, large subjects within each half'
        : 'head-and-shoulders or upper-body portraits, large readable faces, visible shoulders and clothing, connected gesture limbs';
    const form = animal
        ? tags(['complete animal bodies, species-appropriate animal anatomy, individual eyes and markings and small accessories', animalGestureTags(chosen)])
        : object ? 'material-built faces and bodies and hair and clothing, physical material texture, crafted limbs'
            : 'consistent medium across faces and hair and bodies and clothing';
    const scene = tags([
        rendering || 'illustration', form, framing,
        `two distinct ${subject}s, side by side, horizontal paired portrait, first subject at left quarter, second subject at right quarter, balanced subject scale`,
        'continuous edge-to-edge background, continuous center and corners, clear subject separation, quiet background detail, readable individual features, gestures within own half',
        subject_details.coupleVisibleRecipe(interaction, anyCovered && ownedInteraction),
        interactionDirection?.tags?.scene,
        settings.pairType === 'echo' ? 'complementary individual gestures, coordinated colors and light' : 'shared motif connecting subjects across center',
        animal && settings.clothing ? 'small wearable accents, animal-adapted clothing' : '',
        settings.clothing, settings.background, settings.direction,
    ]);
    const characters = settings.people.map((person, index) => ({
        name: `${index ? '右边' : '左边'} · ${person.name || (index ? '人物二' : '人物一')}`,
        tag: tags([
            index ? 'right side, centered at right quarter' : 'left side, centered at left quarter',
            appearances[index], subject_details.coupleVisibleRecipe(originalRendering, covered[index] && !!chosen) || subject,
            subject_details.coupleVisibleRecipe(index ? rightAction : leftAction, covered[index] && ownedInteraction),
            interactionDirection?.tags?.roles[index],
            subject_details.coupleCoveredEyeGuidance(covered[index], true),
            clothing.people[index],
            animal ? animalGestureTags(chosen) : '',
        ]),
        ...(typeof person.presetNegative === 'string' && person.presetNegative.length ? { negative: person.presetNegative } : {}),
    }));
    return {
        scene,
        // Flat providers retain two explicit positional identity blocks. Names
        // are metadata only, never token prefixes inside a character tag list.
        prompt: [`LEFT: ${characters[0].tag}`, `RIGHT: ${characters[1].tag}`, scene].join('\n'),
        negative,
        nai: { prompt: scene, nl: '', characters: characters.map(character => ({ ...character, nl: '' })) },
        characters,
        promptFormat: 'nai45-tags',
    };
}
