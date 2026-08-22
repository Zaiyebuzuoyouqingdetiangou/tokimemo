export const DYNAMIC_COMMITMENT_RULES = String.raw`
动态承诺兑现:
  enforcement_level: "guidance"
  core_concept: "若本轮展现形式或视觉构思承诺了动态、时间推进、连续变化或运动感，必须用实际可渲染的 HTML/CSS/SVG 效果兑现，不得只用静态文字宣称其存在"

  rule:
    - "动态、时间推进、连续变化或运动感必须通过可执行的视觉机制体现，而不是只写在标题、标签、说明或台词里"
    - "实现方式必须服从本轮媒介形态，可自然使用 animation、transition、transform、渐变位移、遮罩变化、SVG animate、marquee 或其他当前环境可渲染方式"
    - "Visual Scenery 必须有肉眼可见的持续动画；其他形式不适合时可不用，但不得以静态文字冒充"
    - "动态效果必须服务本轮展现形式，不得为了动而动，也不得退化为装饰性乱闪"
`;
