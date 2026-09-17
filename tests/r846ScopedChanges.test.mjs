import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const src = new URL('../src/', import.meta.url);
const heart = await import(new URL('modes/heart.js', src));
const relationship = await import(new URL('core/relationshipSafety.js', src));

const memory = {
  chatId:'chat-a', archiveRevision:'rev-a', characterName:'方祁洛', userName:'纪时卿',
  archiveSummary:'', memories:[],
};

test('HEART shell and variable-count language remain usable; required structure stays strict', () => {
  const shell = heart.normalizeHeart({
    relationshipState:'关系仍在发展', relationshipSummary:'', greetings:{},
    voiceDramas:[], scenarioDramas:[], dailyStrips:[], fireflyVoices:[],
    generationParts:{dialogues:false,seasons:false,strips:false,fireflies:false},
  }, memory);
  assert.equal(shell.kind, 'heart');
  assert.equal(shell.generationParts.dialogues, false);
  assert.doesNotThrow(() => heart.normalizeHeartCore({
    relationshipSummary:'按人设生成', greetings:{ morning:['a'], noon:['a','b'], evening:['a','b'], night:['a','b'], weekend:['a','b'],
      birthday:['a'], userBirthday:['a'], holiday:['a'], absenceWorry:['a'], absenceSulky:['a'] }
  }, memory));
});

test('explicit controlled spouse setting permits spouse address but archive-only still rejects it', () => {
  const prose='亲爱的妻子，晚安。';
  assert.equal(relationship.presentRelationshipAllows(prose, memory), false);
  assert.equal(relationship.presentRelationshipAllows(prose, memory, {
    controlledEvidence:'角色卡：方祁洛与纪时卿是夫妻，已婚。'
  }), true);
  assert.equal(relationship.presentRelationshipAllows(prose, memory, {
    controlledEvidence:'假如方祁洛与纪时卿是夫妻，这只是梦里设想。'
  }), false);
});

test('scoped source contracts preserve historical gates and add only requested inference paths', () => {
  const read = rel => fs.readFileSync(new URL(rel, src), 'utf8');
  const calendar = read('modes/calendar.js');
  const room = read('modes/room.js');
  const travel = read('modes/travel.js');
  const phone = read('modes/phone.js');
  const prompts = read('generation/prompts.js');
  assert.match(calendar, /persona-expression/);
  assert.match(calendar, /narrativeClaimsSharedHistory/);
  assert.match(room, /basis=推演/);
  assert.match(room, /人设推演物件不能冒充两人已经发生的共同往事/);
  assert.doesNotMatch(travel, /if \(sourceMemoryIds && basis !== '记忆'\) return null/);
  assert.match(travel, /推演地点/);
  assert.match(phone, /settingContactAllowed/);
  assert.match(prompts, /只有明确声称“过去共同发生过某件事”时才使用 evidence-excerpt/);
});

test('manual model list uses bounded in-panel select, not native datalist', () => {
  const settings = fs.readFileSync(new URL('ui/settingsPanel.js', src), 'utf8');
  const styles = fs.readFileSync(new URL('ui/styles.js', src), 'utf8');
  assert.doesNotMatch(settings, /<datalist/);
  assert.match(settings, /data-rmt-manual-api-models hidden/);
  assert.match(settings, /选择已拉取模型/);
  assert.match(styles, /rmt-manual-model-picker/);
});
