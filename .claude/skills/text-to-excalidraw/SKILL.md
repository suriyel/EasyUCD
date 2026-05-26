---
name: text-to-excalidraw
description: 把一段文字/需求描述生成 Excalidraw 线框图（.excalidraw 场景文件），用 EasyUCD 的 87 种控件词汇 + 坐标排布，可在 excalidraw.com 打开或导入 EasyUCD 继续转 HTML。用户说「用文本生成 excalidraw / 把这段描述画成线框 / 生成一个登录页(列表页/后台/表单)线框 / 文本转线框 / text to wireframe / 画个 xx 页面的线框图 / 生成 .excalidraw」时主动使用，即使没明说控件或坐标——你负责把自然语言拆成控件布局。
---

# 文本 → Excalidraw 线框图

你把**自然语言需求**转成一个**合法的 `.excalidraw` 场景文件**：用 EasyUCD 的控件词汇摆出页面结构，落盘成可在 excalidraw.com 打开、也能导入 EasyUCD 继续转 HTML 的文件。

**分工**：你负责创意布局（挑哪些控件、放在哪、写什么文案）；随附的零依赖脚本 `scripts/build-scene.mjs` 负责把你的布局物化成合法 Excalidraw 元素（补全全部样板字段、分组接线、文字摆放、控件语义标记）。**不要手写 Excalidraw 元素 JSON**——只产出紧凑布局规格，交给脚本。

## 何时触发

用户想「用文字生成线框图 / 画个某页面的线框 / 文本转 excalidraw / 生成 .excalidraw」等。输入是一段对页面或界面的文字描述，输出是一个 `.excalidraw` 文件。

## 工作流

1. **理解需求**：读懂用户描述的页面类型、要有哪些区块和控件、层级与排布意图。信息不足时用合理的常见布局补全（不必反复追问）。
2. **规划布局**：把需求拆成一串控件，每个挑一个**词汇表内**的 `type`，定 `x/y/w/h`（px，原点左上、y 向下）和 `text`。遵循下方**布局规则**。
3. **写紧凑布局规格**：写一个临时 JSON 文件，形如：
   ```json
   {
     "controls": [
       { "type": "Page",   "x": 0,  "y": 0,   "w": 400, "h": 700, "text": "登录" },
       { "type": "Input",  "x": 40, "y": 150, "w": 320, "h": 44,  "text": "用户名" },
       { "type": "Button", "x": 40, "y": 320, "w": 320, "h": 44,  "text": "登录" }
     ]
   }
   ```
   每项可选 `fontSize`、`align`（默认：原子控件文字居中、容器靠左上）。
4. **运行生成脚本**（在项目根目录执行；脚本在本 skill 目录下）：
   ```
   node .claude/skills/text-to-excalidraw/scripts/build-scene.mjs --in <规格.json> --out <输出.excalidraw>
   ```
   也可把规格从 stdin 喂入。脚本会打印「生成 N 个控件 / M 个元素」。
5. **报告产物**：告诉用户文件路径、控件数，并提示「可拖入 excalidraw.com 打开，或导入 EasyUCD 继续转 HTML」。

## 控件词汇表（87 种，建议尺寸来自 control-catalog.mjs）

优先用下表的 `type`，这样产物带 `controlType` 语义、能被 EasyUCD 识别。`w/h` 缺省时脚本按建议尺寸兜底，但**你应主动给坐标和尺寸**以排出合理布局。

<!-- generated:controls -->
| 分组 | type（建议 w×h） |
|------|------|
| 容器 | Page(400×600)、Section(360×200)、Card(240×160)、Modal(320×240)、Drawer(280×600)、Collapse(320×120)、Splitter(360×200) |
| 导航 | Header(400×60)、Footer(400×60)、Nav(400×44)、Tabs(320×40)、Breadcrumb(300×24)、Menu(200×240)、Sidebar(220×600)、Toolbar(360×44)、Pagination(240×32)、Steps(360×48)、Anchor(160×120)、Dropdown(160×40) |
| 输入 | Input(240×40)、Password(240×40)、IPInput(240×40)、Textarea(240×100)、Select(240×40)、Checkbox(160×24)、Radio(160×24)、Switch(56×28) |
| 表单进阶 | Slider(240×24)、NumberInput(120×40)、DatePicker(200×40)、TimePicker(160×40)、DateRange(280×40)、Upload(240×176)、Rate(160×28)、ColorPicker(160×40)、SearchBox(240×40)、Cascader(240×40)、AutoComplete(240×40)、TagInput(240×40)、Form(360×320)、FormItem(320×56) |
| 选择进阶 | TreeSelect(240×40)、TreeTable(320×180)、MultiSelect(240×40)、CheckboxGroup(240×96)、RadioGroup(240×96)、Transfer(320×180)、Segmented(240×36)、Mentions(240×80)、CheckableTag(72×26) |
| 展示 | Heading(240×36)、Text(240×24)、Image(200×140)、Icon(32×32)、Avatar(48×48)、Badge(44×22)、Tag(72×26)、Divider(320×16) |
| 反馈与状态 | Alert(320×48)、Toast(280×64)、Tooltip(120×32)、Popover(200×120)、Popconfirm(220×100)、Progress(240×12)、ProgressCircle(64×64)、Spinner(40×40)、Skeleton(240×80)、Empty(200×140)、Result(240×160) |
| 数据展示 | List(240×160)、Table(320×160)、PagedTable(320×208)、Grid(320×200)、Tree(240×180)、CheckTree(240×180)、Timeline(240×200)、Statistic(160×80)、Descriptions(320×160)、Calendar(280×240)、Carousel(320×180)、BarChart(240×160)、LineChart(240×160)、PieChart(160×160) |
| 动作 | Button(120×40)、Link(100×24)、ButtonGroup(240×40)、FAB(56×56) |
| 媒体 | Video(320×180)、Audio(280×40)、Map(320×200) |
<!-- /generated:controls -->

`text` 即按钮文案 / 标签 / 标题 / 占位符 / 列表项摘要等。

## 布局规则（把文字当结构蓝图）

- **坐标系**：px，原点左上、y 向下、x 向右。同一行的控件 `y` 接近（横排）；纵向表单/列表逐条增大 `y`（竖排）。
- **容器包住子元素**：容器（Page/Section/Card/Modal/Header/Footer/Nav）的矩形必须在坐标上**完整包住**其子控件——嵌套由坐标包含关系推断（与 EasyUCD 现有管线一致），所以子控件的 `x/y` 要落在父容器范围内、留出内边距（建议 16–40px）。
- **从外到内排**：先放最外层容器（如 Page 400×700），再在其内部按区块（Header/Section/Card…）划分，最后放原子控件。
- **间距**：原子控件之间留 12–24px 纵向间距；同组横排控件留 12–16px 横向间距。
- **不必像素级精确**，重点是结构正确、层级清晰、可继续编辑。

## 几何 / 装饰元素

词汇表外的东西用几何类型：`rectangle`、`ellipse`、`diamond`、`line`、`arrow`、`text`（纯文字标签）。脚本会按普通图形产出、不带 `controlType`，EasyUCD 视其为装饰/分隔/占位。
- 分隔线用 `line`（`w` 作长度、`h=0` 即水平线；`arrow` 类似且带箭头）。
- 不在词汇表、又不属于上述几何类型的 `type` 会被当作 `rectangle`，并打印告警。

## 产物约定

- 用户指定了输出路径就用它；否则在当前目录写 `./<语义名>.excalidraw`（如 `login.excalidraw`、`dashboard.excalidraw`）。
- 规格临时文件用完可删；最终交付的是 `.excalidraw` 文件。

## 自检

产出前确认：每个控件的 `type` 在词汇表内（否则有意退化为几何元素）；容器矩形在坐标上包住其子控件；同行控件 `y` 接近；脚本成功打印「生成 …」且无报错；产物是合法 JSON、可在 excalidraw.com 打开。
