# 示例：登录页

## 输入

```json
{
  "elements": [
    {"id":"a","type":"Page","x":0,"y":0,"w":400,"h":600},
    {"id":"b","type":"Header","x":0,"y":0,"w":400,"h":60,"parent":"a"},
    {"id":"c","type":"Heading","x":20,"y":20,"w":120,"h":24,"text":"登录","parent":"b"},
    {"id":"d","type":"Form","x":20,"y":100,"w":360,"h":300,"parent":"a"},
    {"id":"e","type":"Input","x":40,"y":140,"w":320,"h":40,"text":"用户名","parent":"d"},
    {"id":"f","type":"Password","x":40,"y":200,"w":320,"h":40,"text":"密码","parent":"d"},
    {"id":"g","type":"Button","x":40,"y":260,"w":320,"h":40,"text":"登录","parent":"d"},
    {"id":"h","type":"Link","x":150,"y":320,"w":100,"h":20,"text":"注册账号","parent":"d"}
  ],
  "notes": "登录按钮在两个输入框非空时才可用"
}
```

## 期望输出

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>登录</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; margin: 0; }
    header { border-bottom: 1px solid #ccc; padding: 16px 20px; }
    h1 { font-size: 20px; margin: 0; }
    form { display: flex; flex-direction: column; gap: 12px; max-width: 360px; padding: 20px; }
    input, button { width: 100%; padding: 10px; font: inherit; border: 1px solid #999; }
    button { cursor: pointer; }
    .register { text-align: center; }
  </style>
</head>
<body>
  <header><h1>登录</h1></header>
  <!-- notes：登录按钮在两个输入框非空时才可用（静态稿默认置灰） -->
  <form>
    <input type="text" placeholder="用户名">
    <input type="password" placeholder="密码">
    <button type="submit" disabled>登录</button>
    <a class="register" href="#">注册账号</a>
  </form>
</body>
</html>
```

要点：`Form` 包裹输入项；按 notes 给按钮加 `disabled`；只用灰阶与布局样式，无彩色/动画。
