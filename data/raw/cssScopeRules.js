export const CSS_SCOPE_RULES = String.raw`
CSS作用域隔离:
  enforcement_level: "mandatory"
  rule:
    - "优先使用 inline style。若使用 <style>、@keyframes 或 CSS class，所有选择器必须限定在 toto[data-rabbit-mirror=\"true\"] 内部，并使用兔子镜专属 class 与专属动画名。"
    - "禁止书写 body、html、p、div、span、.content、.message 等全局选择器，禁止污染宿主页面、聊天气泡、侧边栏或 SillyTavern UI。"
    - "<details> 与 <summary> 不得依赖浏览器默认外观；必须通过 inline style 或局部 scoped CSS 自行定义点击区域、盒模型、间距与视觉轮廓。"
`;
