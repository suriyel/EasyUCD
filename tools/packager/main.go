// EasyUCD 打包脚本（Go）。从仓库根运行：`npm run package`（= `go -C tools run ./packager`）。
//
// 流程：npm 构建前端 → 暂存运行文件 → 写精简 package.json 并装运行依赖 →
// 内置 node.exe → 构建启动器 EasyUCD.exe → 打 payload.zip →
// 构建自解压器 dist/EasyUCD-Setup.exe。
package main

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
)

func main() {
	repoRoot, err := findRepoRoot()
	must(err, "定位仓库根目录")

	toolsDir := filepath.Join(repoRoot, "tools")
	buildDir := filepath.Join(repoRoot, "build")
	stage := filepath.Join(buildDir, "stage", "EasyUCD")
	distDir := filepath.Join(repoRoot, "dist")
	payloadZip := filepath.Join(toolsDir, "sfx", "payload.zip")

	fmt.Println("仓库根：", repoRoot)

	step("1/8 构建前端与控件库（npm run build）")
	must(runCmd(repoRoot, "cmd", "/c", "npm", "run", "build"), "npm run build")

	step("2/8 准备暂存目录并拷贝运行文件")
	must(os.RemoveAll(buildDir), "清理 build/")
	must(os.MkdirAll(stage, 0o755), "创建 stage 目录")
	must(copyTree(filepath.Join(repoRoot, "bin"), filepath.Join(stage, "bin")), "拷贝 bin/")
	must(copyTree(filepath.Join(repoRoot, "packages", "web", "dist"), filepath.Join(stage, "packages", "web", "dist")), "拷贝 web/dist")
	must(copyTree(filepath.Join(repoRoot, "packages", "server", "src"), filepath.Join(stage, "packages", "server", "src")), "拷贝 server/src")
	must(copyFile(filepath.Join(repoRoot, "packages", "server", "package.json"), filepath.Join(stage, "packages", "server", "package.json")), "拷贝 server/package.json")
	must(copyTree(filepath.Join(repoRoot, "assets"), filepath.Join(stage, "assets")), "拷贝 assets/")

	step("3/8 写入精简 package.json 并安装运行依赖")
	must(writeStagePackageJSON(repoRoot, stage), "写 stage package.json")
	must(runCmd(stage, "cmd", "/c", "npm", "install", "--omit=dev", "--no-audit", "--no-fund", "--prefer-offline"), "npm install（stage 运行依赖）")

	step("4/8 内置 Node 运行时（复制本机 node.exe）")
	must(copyNode(stage), "复制 node.exe")

	step("5/8 构建启动器 EasyUCD.exe")
	launcherOut := filepath.Join(stage, "EasyUCD.exe")
	must(runCmd(toolsDir, "go", "build", "-o", launcherOut, "./launcher"), "go build ./launcher")

	step("6/8 打包 payload.zip")
	must(os.MkdirAll(filepath.Dir(payloadZip), 0o755), "创建 sfx 目录")
	must(zipDir(stage, payloadZip), "压缩 stage → payload.zip")

	step("7/8 构建自解压器 dist/EasyUCD-Setup.exe")
	must(os.MkdirAll(distDir, 0o755), "创建 dist 目录")
	setupOut := filepath.Join(distDir, "EasyUCD-Setup.exe")
	must(runCmd(toolsDir, "go", "build", "-o", setupOut, "./sfx"), "go build ./sfx")

	step("8/8 完成")
	_ = os.Remove(payloadZip) // 清理中间产物
	if fi, err := os.Stat(setupOut); err == nil {
		fmt.Printf("✓ 产物：%s（%.1f MB）\n", setupOut, float64(fi.Size())/(1024*1024))
	}
}

// findRepoRoot 从当前工作目录向上查找含 name=wireframe-to-html 的 package.json。
func findRepoRoot() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for {
		if b, err := os.ReadFile(filepath.Join(dir, "package.json")); err == nil {
			var m struct {
				Name string `json:"name"`
			}
			if json.Unmarshal(b, &m) == nil && m.Name == "wireframe-to-html" {
				return dir, nil
			}
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("未找到仓库根（含 name=wireframe-to-html 的 package.json）")
		}
		dir = parent
	}
}

// writeStagePackageJSON 复用 packages/server 的 dependencies（含 fastify/@fastify-* 与 tsx），
// 写一个无 workspaces 的精简根 package.json，供 npm install 装最小运行依赖。
func writeStagePackageJSON(repoRoot, stage string) error {
	raw, err := os.ReadFile(filepath.Join(repoRoot, "packages", "server", "package.json"))
	if err != nil {
		return err
	}
	var sp struct {
		Dependencies map[string]string `json:"dependencies"`
	}
	if err := json.Unmarshal(raw, &sp); err != nil {
		return err
	}
	pkg := map[string]any{
		"name":         "easyucd-runtime",
		"private":      true,
		"version":      "0.0.0",
		"type":         "module",
		"dependencies": sp.Dependencies,
	}
	b, err := json.MarshalIndent(pkg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(stage, "package.json"), b, 0o644)
}

// copyNode 复制本机 node.exe 到 stage/runtime/node.exe（Windows 上 node.exe 为单文件，可独立运行 JS）。
func copyNode(stage string) error {
	p, err := exec.LookPath("node")
	if err != nil {
		return fmt.Errorf("未在 PATH 中找到 node：%w", err)
	}
	return copyFile(p, filepath.Join(stage, "runtime", "node.exe"))
}

func runCmd(dir, name string, args ...string) error {
	c := exec.Command(name, args...)
	c.Dir = dir
	c.Stdout = os.Stdout
	c.Stderr = os.Stderr
	c.Stdin = os.Stdin
	return c.Run()
}

func copyTree(src, dst string) error {
	return filepath.WalkDir(src, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, rel)
		if d.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		return copyFile(path, target)
	})
}

func copyFile(src, dst string) error {
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return out.Close()
}

// zipDir 把 root 下所有文件压成 zip，条目名相对 root（正斜杠）。
func zipDir(root, outPath string) error {
	out, err := os.Create(outPath)
	if err != nil {
		return err
	}
	defer out.Close()
	zw := zip.NewWriter(out)
	defer zw.Close()
	return filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		w, err := zw.CreateHeader(&zip.FileHeader{Name: filepath.ToSlash(rel), Method: zip.Deflate})
		if err != nil {
			return err
		}
		f, err := os.Open(path)
		if err != nil {
			return err
		}
		defer f.Close()
		_, err = io.Copy(w, f)
		return err
	})
}

func step(s string) { fmt.Println("==> " + s) }

func must(err error, what string) {
	if err != nil {
		fmt.Printf("✗ %s 失败：%v\n", what, err)
		os.Exit(1)
	}
}
