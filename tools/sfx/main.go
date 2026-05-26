// EasyUCD-Setup.exe —— 自解压安装包（Windows）。
//
// 内嵌 payload.zip（由 tools/packager 生成），双击运行后把内容解压到
// 「本程序所在目录\EasyUCD\」，完成后用资源管理器打开并选中 EasyUCD.exe。
// 不自动启动，由用户手动双击 EasyUCD.exe。
package main

import (
	"archive/zip"
	"bytes"
	_ "embed"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

//go:embed payload.zip
var payload []byte

func main() {
	exe, err := os.Executable()
	if err != nil {
		fail("无法定位自身路径", err)
	}
	target := filepath.Join(filepath.Dir(exe), "EasyUCD")

	fmt.Println("EasyUCD 自解压安装包")
	fmt.Println("解压目标目录：", target)

	zr, err := zip.NewReader(bytes.NewReader(payload), int64(len(payload)))
	if err != nil {
		fail("读取内嵌负载失败", err)
	}

	total := len(zr.File)
	for i, f := range zr.File {
		if err := extractOne(f, target); err != nil {
			fail(fmt.Sprintf("解压 %s 失败（若 EasyUCD 正在运行，请先关闭后重试）", f.Name), err)
		}
		if (i+1)%20 == 0 || i+1 == total {
			fmt.Printf("\r解压中… %d/%d", i+1, total)
		}
	}
	fmt.Println()

	launcher := filepath.Join(target, "EasyUCD.exe")
	fmt.Println("完成！已解压到：", target)
	fmt.Println("请双击 EasyUCD.exe 启动；首次启动后浏览器会自动打开 http://127.0.0.1:5273")

	// 打开资源管理器并选中启动器（explorer 常返回非 0，忽略错误）。
	_ = exec.Command("explorer", "/select,"+launcher).Start()

	fmt.Print("\n按回车键关闭…")
	fmt.Scanln()
}

func extractOne(f *zip.File, target string) error {
	dest := filepath.Join(target, filepath.FromSlash(f.Name))
	// 防 zip-slip：解压路径必须仍在 target 内。
	cleanTarget := filepath.Clean(target)
	if dest != cleanTarget && !strings.HasPrefix(dest, cleanTarget+string(os.PathSeparator)) {
		return fmt.Errorf("非法的归档路径：%s", f.Name)
	}
	if f.FileInfo().IsDir() {
		return os.MkdirAll(dest, 0o755)
	}
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return err
	}
	rc, err := f.Open()
	if err != nil {
		return err
	}
	defer rc.Close()
	out, err := os.OpenFile(dest, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o755)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, rc)
	return err
}

func fail(msg string, err error) {
	if err != nil {
		fmt.Println("\n错误：", msg, "：", err)
	} else {
		fmt.Println("\n错误：", msg)
	}
	fmt.Print("\n按回车键关闭…")
	fmt.Scanln()
	os.Exit(1)
}
