// One frozen body per world-book source. This module does not read the host,
// write world books, or keep a copy outside the current generation input.

function textOf(value) {
    return String(value ?? '').replace(/\u0000/g, '').replace(/\r\n?/g, '\n').trim();
}

function sourceIdentity(ref, ownerId, index) {
    const world = textOf(ref?.world);
    const uid = textOf(ref?.uid);
    if (world && uid) return { key: `world\u001f${world}\u001f${uid}`, world, uid, manual: false };
    const title = textOf(ref?.title) || `manual-${index}`;
    return { key: `manual\u001f${textOf(ownerId) || 'person'}\u001f${index}\u001f${title}`, world: world || 'manual', uid: uid || `${textOf(ownerId) || 'person'}:${index}`, manual: true };
}

function priorityOf(source) {
    if (source.relatedParticipantIds.length) return 0;
    if (source.selectedAsSetting) return 1;
    return 2;
}

function blockText(source) {
    const who = source.relatedParticipantIds.length ? ` participants=${source.relatedParticipantIds.join(',')}` : '';
    const role = source.relatedParticipantIds.length ? 'participant' : source.selectedAsSetting ? 'selected' : 'activated';
    return `[${source.world}/${source.uid} ${source.title} role=${role}${who}]\n${source.content}`;
}

function addSource(registry, spec) {
    const content = textOf(spec.content);
    if (!content) return 0;
    const existing = registry.get(spec.key);
    if (!existing) {
        registry.set(spec.key, {
            key: spec.key,
            world: spec.world,
            uid: spec.uid,
            title: textOf(spec.title) || spec.uid,
            content,
            relatedParticipantIds: spec.participantId ? [spec.participantId] : [],
            selectedAsSetting: spec.selectedAsSetting === true,
            activated: spec.activated === true,
            sourceOrder: spec.sourceOrder,
            manual: spec.manual === true,
            revision: spec.revision || '',
        });
        return 0;
    }
    if (spec.participantId && !existing.relatedParticipantIds.includes(spec.participantId)) existing.relatedParticipantIds.push(spec.participantId);
    if (spec.selectedAsSetting) existing.selectedAsSetting = true;
    if (spec.activated) existing.activated = true;
    if (existing.content !== content) {
        existing.revision = existing.revision || 'frozen-first';
        return content.length;
    }
    return content.length;
}

export function participantIndexPeople(snapshot) {
    const people = Array.isArray(snapshot?.people) ? snapshot.people : [];
    return people.map(person => ({
        id: textOf(person?.id),
        name: textOf(person?.name),
        identity: person?.identity === 'user' ? 'user' : 'character',
        summary: textOf((person?.sourceRefs || []).map(ref => textOf(ref?.title)).filter(Boolean).join('、')).slice(0, 240),
        sourceKeys: (person?.sourceRefs || []).map(ref => ({
            world: textOf(ref?.world),
            uid: textOf(ref?.uid),
            title: textOf(ref?.title),
        })).filter(ref => ref.world || ref.uid || ref.title),
    })).filter(person => person.id);
}

export function assembleControlledSources({ participantSnapshot = null, selectedEntries = [], activatedText = '', budgetChars = 16000 } = {}) {
    const registry = new Map();
    let order = 0;
    let deduplicatedChars = 0;
    const people = Array.isArray(participantSnapshot?.people) ? participantSnapshot.people : [];
    for (const person of people) {
        const refs = Array.isArray(person?.sourceRefs) ? person.sourceRefs : [];
        refs.forEach((ref, index) => {
            const identity = sourceIdentity(ref, person?.id, index);
            deduplicatedChars += addSource(registry, {
                ...identity,
                title: ref?.title,
                content: ref?.content,
                participantId: textOf(person?.id),
                selectedAsSetting: false,
                sourceOrder: order,
                revision: textOf(ref?.revision),
            });
            order += 1;
        });
    }
    for (const entry of selectedEntries) {
        const identity = sourceIdentity(entry, 'selected', order);
        deduplicatedChars += addSource(registry, {
            ...identity,
            title: entry?.title,
            content: entry?.content,
            participantId: '',
            selectedAsSetting: true,
            sourceOrder: order,
        });
        order += 1;
    }
    let activated = textOf(activatedText);
    for (const source of registry.values()) {
        if (source.content && activated.includes(source.content)) {
            deduplicatedChars += source.content.length * (activated.split(source.content).length - 1);
            activated = activated.split(source.content).join('');
        }
    }
    activated = activated.trim();
    if (activated) {
        deduplicatedChars += addSource(registry, {
            key: 'activated\u001fdry-run',
            world: 'activated',
            uid: 'dry-run',
            title: '补充世界书',
            content: activated,
            participantId: '',
            selectedAsSetting: false,
            activated: true,
            manual: true,
            sourceOrder: order,
        });
    }
    const ordered = [...registry.values()].sort((left, right) => priorityOf(left) - priorityOf(right) || left.sourceOrder - right.sourceOrder);
    const included = [];
    const excluded = [];
    let usedChars = 0;
    const budget = Math.max(0, Math.floor(Number(budgetChars) || 0));
    for (const source of ordered) {
        const block = blockText(source);
        const next = included.length ? usedChars + 2 + block.length : block.length;
        const reason = source.relatedParticipantIds.length ? 'participant' : source.selectedAsSetting ? 'selected' : 'activated';
        const row = { world: source.world, uid: source.uid, title: source.title, chars: source.content.length, reason };
        if (next > budget) {
            excluded.push({ ...row, reason: 'capacity' });
            continue;
        }
        included.push({ source, row });
        usedChars = next;
    }
    const selectedBlocks = included.filter(item => item.source.relatedParticipantIds.length || item.source.selectedAsSetting).map(item => blockText(item.source));
    const activatedBlocks = included.filter(item => !item.source.relatedParticipantIds.length && !item.source.selectedAsSetting).map(item => blockText(item.source));
    const worldText = `WORLD_INFO_SELECTED:\n${selectedBlocks.join('\n\n')}\nWORLD_INFO_ACTIVATED:\n${activatedBlocks.join('\n\n')}`;
    const total = ordered.length;
    const dropped = excluded.length;
    return {
        worldText,
        deduplicatedChars,
        used: included.length,
        total,
        dropped,
        complete: dropped === 0,
        included: included.map(item => item.row),
        excluded,
        note: dropped > 0 ? `已发送 ${included.length}/${total} 条来源，其余整条未送入` : '',
    };
}
