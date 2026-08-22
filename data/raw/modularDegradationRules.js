export const MODULAR_DEGRADATION_RULES = String.raw`
信息页降级兜底:
  enforcement_level: "mandatory"
  rule:
    - "禁止把本轮展现形式降级为通用信息展示页、说明页、解析页、点评页或内容承载页。"
    - "禁止用多个同构区块顺次承载主要文字来替代媒介本体。"
    - "若展现形式只存在于标题、栏目名或说明文字中，而 DOM/CSS 本身仍是通用内容页，则判定失败，必须重写。"
`;
