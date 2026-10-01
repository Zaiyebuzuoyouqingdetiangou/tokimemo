import * as text from '../core/text.js';
import * as cast from '../extras/mvCast.js';
import * as direction from '../extras/mvDirection.js';

function esc(value) { return text.esc(value); }
function button(action, label, scope) {
    return `<button type="button" class="rmt-x-secondary" data-rmt-mv="${action}" data-rmt-mv-scope="${scope}">${label}</button>`;
}

export function directionControls(song, settings, scope = 'draft') {
    const recommendation = direction.recommendDirections(song)[0];
    const selected = direction.directionOf(settings?.storyType);
    return `<section class="rmt-x-card"><label class="rmt-mv-look"><b>分镜类型</b><select data-rmt-mv-story-type data-rmt-mv-scope="${scope}">
      ${direction.MV_DIRECTIONS.map(item => `<option value="${item.id}"${item.id === selected.id ? ' selected' : ''}>${item.name}${item.id === recommendation.id ? ' · 推荐' : ''}</option>`).join('')}</select></label>
      <p class="rmt-x-note">${esc(selected.desc)}</p><p class="rmt-x-note">参考推荐：${esc(recommendation.name)} · ${esc(recommendation.reasons.join('；'))}</p>
      ${selected.id !== recommendation.id ? button('use-recommended-type', '采用推荐', scope) : ''}
      ${scope === 'record' ? '<small class="rmt-x-note">用于之后生成，已有镜头和图片不变。</small>' : ''}</section>`;
}

export function castControls(value, settings, wardrobe = {}, scope = 'draft') {
    if (!value) return '';
    const people = cast.selectedMvPeople(value, settings);
    const rows = people.map(person => {
        const look = value.appearances?.find(row => row.participantId === person.id);
        const clothing = wardrobe.characters?.find(row => row.participantId === person.id)?.clothing || '';
        return `<div class="rmt-mv-cast-person"><b>${esc(person.name || '未命名人物')}</b>
          <small class="rmt-x-note">${esc(person.sourceRefs.map(ref => ref.title).filter(Boolean).join(' · ') || '手动人物')}</small>
          <label class="rmt-mv-look"><span>稳定外貌</span><textarea rows="2" data-rmt-mv-person-look="${esc(person.id)}" data-rmt-mv-scope="${scope}" placeholder="发色、眼睛、体型等；没有资料可留空">${esc(look?.tag || look?.nl || '')}</textarea></label>
          ${scope === 'record' ? `<label class="rmt-mv-look"><span>本曲衣着</span><input data-rmt-mv-person-outfit="${esc(person.id)}" value="${esc(clothing)}"></label>` : ''}</div>`;
    }).join('');
    return `<details class="rmt-x-card"><summary><b>本曲人物 · ${people.length} 人</b>${people.length ? ' · ' + esc(people.map(person => person.name || '未命名').join('、')) : ' · 空镜'}</summary>
      <div class="rmt-mv-actions">${button('edit-cast', '选人／世界书条目', scope)}${button('use-archive-cast', '沿用当前档案名单', scope)}
        ${value.people.some(person => person.identity === 'user') ? '' : button('add-cast-user', '加入我的人设', scope)}</div>
      <p class="rmt-x-note">只用于这首 MV，不改档案名单。缺少外貌也可继续。</p>${rows}</details>`;
}

export function shotCastControls(record, shot) {
    if (!record?.cast) return '';
    const label = cast.castLabel(record, shot) || '旧镜头 · 沿用原人物';
    const bindings = Array.isArray(shot.cast) ? shot.cast : [];
    const rows = record.cast.people.map(person => {
        const binding = bindings.find(row => row.participantId === person.id);
        return `<div class="rmt-mv-cast-person" data-rmt-mv-binding-person="${esc(person.id)}">
          <label><input type="checkbox" data-rmt-mv-binding="selected" ${binding ? 'checked' : ''}> ${esc(person.name || person.id)}</label>
          ${binding ? `<label class="rmt-mv-look"><span>位置</span><input data-rmt-mv-binding="position" value="${esc(binding.position)}" placeholder="左侧／右后方等"></label>
            <label class="rmt-mv-look"><span>动作与对象</span><input data-rmt-mv-binding="action" value="${esc(binding.action)}"></label>
            <label class="rmt-mv-look"><span>可见部分</span><select data-rmt-mv-binding="visible">${[['full', '按镜头构图'], ['face', '脸部'], ['hands', '只拍手'], ['back', '背影'], ['silhouette', '剪影']].map(([id, name]) => `<option value="${id}"${binding.visible === id ? ' selected' : ''}>${name}</option>`).join('')}</select></label>` : ''}</div>`;
    }).join('');
    return `<details class="rmt-mv-inspect" data-rmt-mv-binding-group="${esc(shot.id)}"><summary>出镜：${esc(label)}</summary>
      ${shot.castUnresolved ? '<p class="rmt-x-note">这镜的人物对应不明确，可在这里核对；原分镜已保留。</p>' : ''}${rows}
      <p class="rmt-x-note">修改只影响之后的绘制，不自动重画已有图片。</p></details>`;
}
