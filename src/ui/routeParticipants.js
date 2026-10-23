import * as choices from '../core/routeParticipants.js';
import * as contextApi from '../core/context.js';
import * as repository from '../archive/repository.js';
import * as people from '../core/participants.js';
import * as text from '../core/text.js';

const STRATEGY_LABELS = [['default', '沿用档案人物'], ['archive', '按档案剧情出场'], ['specified', '指定人物'], ['random', '随机一人'], ['ensemble', '群像']];
function strategyHint(strategy, roster, memory) {
    const named = ids => ids.map(id => roster.people.find(person => person.id === id)?.name).filter(Boolean).join('、');
    if (strategy === 'archive') {
        const ids = choices.archiveCastIds(roster, memory);
        return ids.length
            ? `只写档案记忆里已经出场的人物，档案更新后自动跟着变。现在找到：${named(ids)}。`
            : '只写档案记忆里已经出场的人物。现在档案里还没找到名单里的人物，生成时会提示你换一种方式。';
    }
    if (strategy === 'specified') return '只写下面勾选的人物。';
    if (strategy === 'random') return '每次生成从名单里随机抽一个人。';
    if (strategy === 'ensemble') return '名单里的人物全部一起出场，包括剧情里还没登场的。';
    const picked = named(roster.selectedIds);
    return `用建档时勾选的人物${picked ? `（${picked}）` : ''}，剧情里还没登场的人也会算进去。只想要已经出场的人，选「按档案剧情出场」。`;
}
export function routePeopleHtml(route, context = contextApi.getContext(), memory = repository.getImportedMemory(context)) {
    const roster = people.normalizeParticipantRoster(memory?.[people.PARTICIPANTS_KEY]);
    if (!roster?.people?.length) return '';
    const choice = choices.readRoutePeople(route, context, memory);
    return `<details class="rmt-route-people" data-rmt-people-route="${text.esc(route)}"><summary>本页人物</summary><label>选择方式<select data-rmt-people-strategy aria-label="${text.esc(route)}人物选择方式">${STRATEGY_LABELS.map(([value,label]) => `<option value="${value}" ${choice.strategy === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><small class="rmt-route-people-hint" data-rmt-people-hint>${text.esc(strategyHint(choice.strategy, roster, memory))}</small><fieldset ${choice.strategy === 'specified' ? '' : 'hidden'}><legend>参加这一页的人物</legend>${roster.people.filter(person => person.identity !== 'user').map(person => `<label><input type="checkbox" data-rmt-people-id="${text.esc(person.id)}" ${choice.selectedIds.includes(person.id) ? 'checked' : ''}>${text.esc(person.name)}</label>`).join('')}</fieldset></details>`;
}
export function handleRoutePeopleChange(event) {
    if (!event.target?.matches?.('[data-rmt-people-strategy],[data-rmt-people-id]')) return false;
    const root = event.target.closest('[data-rmt-people-route]');
    if (!root) return false;
    const context = contextApi.currentCharacterGuard(), memory = repository.getImportedMemory(context);
    const strategy = root.querySelector('[data-rmt-people-strategy]').value;
    const saved = choices.writeRoutePeople(root.dataset.rmtPeopleRoute, { strategy,
        selectedIds: [...root.querySelectorAll('[data-rmt-people-id]:checked')].map(node => node.dataset.rmtPeopleId) }, context, memory);
    if (!saved) globalThis.toastr?.warning?.('人物选择暂未保存，刷新后需重新选择。', '心迹回廊');
    root.querySelector('fieldset').hidden = strategy !== 'specified';
    const hint = root.querySelector('[data-rmt-people-hint]');
    const roster = people.normalizeParticipantRoster(memory?.[people.PARTICIPANTS_KEY]);
    if (hint && roster) hint.textContent = strategyHint(strategy, roster, memory);
    return true;
}
