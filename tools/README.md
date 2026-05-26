# EasyUCD 打包工具（Go）

把 EasyUCD 打成一个 Windows「双击即用」的自解压安装包，内置便携 Node，目标机无需安装 Node、无需联网。

## 用法

在仓库根目录执行：

```bash
npm run package
```

等价于 `go -C tools run ./packager`。完成后产物在 `dist/EasyUCD-Setup.exe`。

## 组成

| 目录 | 产物 | 说明 |
|------|------|------|
| `launcher/` | `EasyUCD.exe` | 包内启动器：用内置 `runtime\node.exe` 起 Fastify 服务（`PORT=5273`），就绪后开浏览器；Job Object 绑定子进程，关闭控制台窗口即停服。 |
| `sfx/` | `EasyUCD-Setup.exe` | 自解压器：`//go:embed payload.zip` 内嵌全部文件，双击解压到「自身目录\EasyUCD\」并用资源管理器选中 `EasyUCD.exe`。 |
| `packager/` | — | 打包脚本：编排 npm 构建、暂存、装运行依赖、内置 node、构建上述两者、生成 payload 与安装包。 |

## 打包产物结构（解压后）

```
EasyUCD/
├─ EasyUCD.exe            # 启动器（双击它启动）
├─ runtime/node.exe       # 内置便携 Node
├─ bin/、packages/、assets/、node_modules/、package.json
```

## 分发与运行须知

- **体积**：内置 `node.exe`(~85MB)+运行依赖，`EasyUCD-Setup.exe` 约 100–150MB。
- **未代码签名**：Windows SmartScreen 可能提示"未知发布者"，需点「更多信息 → 仍要运行」。
- **解压目录需可写**：放 Downloads/桌面即可；Program Files 等受保护目录需管理员权限。
- **生成 HTML 仍需 CLI**：实际生成依赖目标机安装 Claude Code / OpenCode CLI（或走 mock 模式）；
  本启动器只负责起服务，不打包这些第三方 CLI。

## 注意

- `tools/sfx/payload.zip` 是打包脚本生成的中间产物（已 `.gitignore`）。因此**单独**执行
  `go build ./sfx` 会因缺少 `payload.zip` 而失败——它只应由 `packager` 在生成 payload 后构建。
- 本工具面向 Windows；在 Windows 上用本机 Go 工具链直接构建（无需交叉编译）。
