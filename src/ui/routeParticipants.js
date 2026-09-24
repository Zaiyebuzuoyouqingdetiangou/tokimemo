import * as choices from '../core/routeParticipants.js';
import * as contextApi from '../core/context.js';
import * as repository from '../archive/repository.js';
import * as people from '../core/participants.js';
import * as text from '../core/text.js';

export function routePeopleHtml(route, context = contextApi.getContext(), memory = repository.getImportedMemory(context)) {
    const roster = people.normalizeParticipantRoster(memory?.[people.PARTICIPANTS_KEY]);
    if (!roster?.people?.length) return '';
    const choice = choices.readRoutePeople(route, context, memory);
    return `<details class="rmt-route-people" data-rmt-people-route="${text.esc(route)}"><summary>本页人物</summary><label>选择方式<select data-rmt-people-strategy aria-label="${text.esc(route)}人物选择方式">${[['default','沿用档案人物'],['specified','指定人物'],['random','随机一人'],['ensemble','群像']].map(([value,label]) => `<option value="${value}" ${choice.strategy === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><fieldset ${choice.strategy === 'specified' ? '' : 'hidden'}><legend>参加这一页的人物</legend>${roster.people.filter(person => person.identity !== 'user').map(person => `<label><input type="checkbox" data-rmt-people-id="${text.esc(person.id)}" ${choice.selectedIds.includes(person.id) ? 'checked' : ''}>${text.esc(person.name)}</label>`).join('')}</fieldset></details>`;
}
export function handleRoutePeopleChange(event) {
    if (!event.target?.matches?.('[data-rmt-people-strategy],[data-rmt-people-id]')) return false;
    const root = event.target.closest('[data-rmt-people-route]');
    if (!root) return false;
    const context = contextApi.currentCharacterGuard(), memory = repository.getImportedMemory(context);
    const strategy = root.querySelector('[data-rmt-people-strategy]').value;
    choices.writeRoutePeople(root.dataset.rmtPeopleRoute, { strategy,
        selectedIds: [...root.querySelectorAll('[data-rmt-people-id]:checked')].map(node => node.dataset.rmtPeopleId) }, context, memory);
    root.querySelector('fieldset').hidden = strategy !== 'specified';
    return true;
}
