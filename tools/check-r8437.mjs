import * as sources from '../src/core/controlledSources.js';
import * as ledger from '../src/core/inputLedger.js';
import * as participants from '../src/core/participants.js';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

const snapshot = {
    version: 1,
    people: [
        {
            id: 'p1',
            name: '甲',
            sourceRefs: [
                { world: 'book', uid: '1', title: '甲的设定', content: '甲的完整正文。' },
                { world: 'book', uid: '2', title: '共同设定', content: '共同正文。' },
            ],
        },
        {
            id: 'p2',
            name: '乙',
            sourceRefs: [{ world: 'book', uid: '2', title: '共同设定', content: '共同正文。' }],
        },
    ],
};

const assembled = sources.assembleControlledSources({
    participantSnapshot: snapshot,
    selectedEntries: [
        { world: 'book', uid: '2', title: '共同设定', content: '共同正文。' },
        { world: 'book', uid: '9', title: '手选', content: '手选正文。' },
    ],
    activatedText: '共同正文。\n补充正文。',
    budgetChars: 16000,
});
const joined = assembled.worldText;
assert(joined.split('甲的完整正文。').length === 2, 'participant body appears once');
assert(joined.split('共同正文。').length === 2, 'shared body appears once');
assert(joined.includes('手选正文。'), 'hand-picked body is sent');
assert(joined.includes('补充正文。'), 'dry-run remainder is sent');
assert(!joined.includes('未选'), 'fixture has no unselected name');
assert(assembled.deduplicatedChars > 0, 'duplicate chars are counted');

const tight = sources.assembleControlledSources({
    participantSnapshot: snapshot,
    selectedEntries: [{ world: 'book', uid: '9', title: '手选', content: '手选正文。' }],
    budgetChars: 80,
});
assert(tight.excluded.some(item => item.reason === 'capacity'), 'overflow is excluded whole');
const rank = { participant: 0, selected: 1, activated: 2 };
let previousRank = -1;
for (const item of tight.included) {
    assert(rank[item.reason] >= previousRank, 'packing keeps priority order');
    previousRank = rank[item.reason];
}
assert(tight.included.some(item => item.reason === 'participant'), 'a fitting participant source is sent before lower priorities fill the bag');

const changed = sources.assembleControlledSources({
    participantSnapshot: snapshot,
    selectedEntries: [{ world: 'book', uid: '1', title: '甲的设定', content: '另一版正文。' }],
    budgetChars: 16000,
});
assert(changed.worldText.includes('甲的完整正文。'), 'first frozen body wins');
assert(!changed.worldText.includes('另一版正文。'), 'changed body is not mixed in');

const payload = participants.participantIndexPayload(snapshot);
assert(payload.people.length === 2, 'index keeps selected people');
assert(!JSON.stringify(payload).includes('甲的完整正文'), 'index payload omits source body');
assert(payload.people[0].sourceKeys.some(key => key.uid === '1'), 'index keeps source keys');

const prompt = `【心迹回廊受控人设/世界观上下文】\nCHARACTER_CARD_JSON:\n{"name":"卡"}\nUSER_PERSONA_JSON:\n{"name":"你"}\nWORLD_INFO_TEXT:\n${assembled.worldText}\n【上下文结束】\n任务说明\nUNTRUSTED_SELECTED_PARTICIPANTS_JSON:\n{"people":[]}\nCONTROLLED_WORLD_PRESENTATION_JSON:\n{"worldStyle":"neutral"}\nUNTRUSTED_ROOM_ARCHIVE_JSON:\n{"memories":[]}`;
const account = ledger.accountFinalPrompt(prompt, assembled);
const sum = account.sections.reduce((total, section) => total + section.chars, 0);
assert(sum === prompt.length, `ledger ${sum} !== prompt ${prompt.length}`);
assert(account.sections.find(section => section.name === 'selectedSettings').chars > 0, 'selected section is counted');
assert(account.deduplicatedChars === assembled.deduplicatedChars, 'deduped chars are kept');

console.log('r84.37 pure checks passed');
