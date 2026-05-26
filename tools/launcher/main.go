// EasyUCD.exe —— 包内启动器（控制台程序，Windows）。
//
// 职责：用内置的 runtime\node.exe 直接拉起 Fastify 服务
// （node --import tsx packages/server/src/server.ts，PORT=5273），
// 健康检查就绪后自动打开浏览器；用 Job Object 绑定子进程，
// 关闭本控制台窗口即终止 node/server，避免残留后台进程。
package main

import (
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"time"
	"unsafe"
)

const (
	port    = "5273"
	baseURL = "http://127.0.0.1:5273"
)

func main() {
	exe, err := os.Executable()
	if err != nil {
		fatal("无法定位自身路径：", err)
	}
	appDir := filepath.Dir(exe)

	node := filepath.Join(appDir, "runtime", "node.exe")
	if _, err := os.Stat(node); err != nil {
		if p, e := exec.LookPath("node"); e == nil {
			node = p // 兜底：用系统 PATH 里的 node
		} else {
			fatal("未找到内置 Node 运行时（runtime\\node.exe），也未在系统中找到 node。", nil)
		}
	}
	serverEntry := filepath.Join(appDir, "packages", "server", "src", "server.ts")

	fmt.Println("EasyUCD 正在启动…")

	// 已有实例在跑？直接打开浏览器，不再重复启动。
	if healthOK(1500 * time.Millisecond) {
		fmt.Println("检测到 EasyUCD 已在运行，直接打开浏览器。")
		openBrowser()
		fmt.Println("（关闭此窗口不会停止已在运行的服务）")
		pause()
		return
	}

	cmd := exec.Command(node, "--import", "tsx", serverEntry)
	cmd.Dir = appDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	// 不设 WTH_OPEN：由本启动器在健康检查就绪后再开浏览器，时机更准。
	cmd.Env = append(os.Environ(), "PORT="+port)

	if err := cmd.Start(); err != nil {
		fatal("启动服务失败：", err)
	}

	// Job Object：关闭本窗口 → 句柄释放 → 连同 node/server 一起被系统终止。
	if job, jerr := newKillOnCloseJob(); jerr == nil {
		_ = assignToJob(job, cmd.Process.Pid) // 句柄故意不关闭，使其生命周期与本进程一致
	}

	// 后台轮询健康检查，就绪后开浏览器。
	go func() {
		deadline := time.Now().Add(60 * time.Second)
		for time.Now().Before(deadline) {
			if healthOK(800 * time.Millisecond) {
				fmt.Println("服务已就绪，正在打开浏览器：" + baseURL)
				openBrowser()
				fmt.Println("提示：关闭此窗口即停止 EasyUCD 服务。")
				return
			}
			time.Sleep(500 * time.Millisecond)
		}
		fmt.Println("等待服务就绪超时，可手动在浏览器访问：" + baseURL)
	}()

	if werr := cmd.Wait(); werr != nil {
		fmt.Println("服务已退出：", werr)
		pause()
	}
}

func healthOK(timeout time.Duration) bool {
	c := http.Client{Timeout: timeout}
	resp, err := c.Get(baseURL + "/api/health")
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == 200
}

func openBrowser() {
	// cmd /c start "" <url>：空标题参数避免把 URL 当成窗口标题。
	_ = exec.Command("cmd", "/c", "start", "", baseURL).Run()
}

func fatal(msg string, err error) {
	if err != nil {
		fmt.Println(msg, err)
	} else {
		fmt.Println(msg)
	}
	pause()
	os.Exit(1)
}

func pause() {
	fmt.Print("\n按回车键关闭…")
	fmt.Scanln()
}

// ---------- Windows Job Object（仅用 syscall，无第三方依赖） ----------

var (
	modkernel32                  = syscall.NewLazyDLL("kernel32.dll")
	procCreateJobObjectW         = modkernel32.NewProc("CreateJobObjectW")
	procSetInformationJobObject  = modkernel32.NewProc("SetInformationJobObject")
	procAssignProcessToJobObject = modkernel32.NewProc("AssignProcessToJobObject")
)

const (
	jobObjectExtendedLimitInformation = 9
	jobObjectLimitKillOnJobClose      = 0x00002000
	processSetQuota                   = 0x0100
	processTerminate                  = 0x0001
)

type jobBasicLimitInformation struct {
	PerProcessUserTimeLimit int64
	PerJobUserTimeLimit     int64
	LimitFlags              uint32
	MinimumWorkingSetSize   uintptr
	MaximumWorkingSetSize   uintptr
	ActiveProcessLimit      uint32
	Affinity                uintptr
	PriorityClass           uint32
	SchedulingClass         uint32
}

type ioCounters struct {
	ReadOperationCount  uint64
	WriteOperationCount uint64
	OtherOperationCount uint64
	ReadTransferCount   uint64
	WriteTransferCount  uint64
	OtherTransferCount  uint64
}

type jobExtendedLimitInformation struct {
	BasicLimitInformation jobBasicLimitInformation
	IoInfo                ioCounters
	ProcessMemoryLimit    uintptr
	JobMemoryLimit        uintptr
	PeakProcessMemoryUsed uintptr
	PeakJobMemoryUsed     uintptr
}

func newKillOnCloseJob() (syscall.Handle, error) {
	h, _, err := procCreateJobObjectW.Call(0, 0)
	if h == 0 {
		return 0, err
	}
	var info jobExtendedLimitInformation
	info.BasicLimitInformation.LimitFlags = jobObjectLimitKillOnJobClose
	r, _, err := procSetInformationJobObject.Call(
		h,
		uintptr(jobObjectExtendedLimitInformation),
		uintptr(unsafe.Pointer(&info)),
		unsafe.Sizeof(info),
	)
	if r == 0 {
		syscall.CloseHandle(syscall.Handle(h))
		return 0, err
	}
	return syscall.Handle(h), nil
}

func assignToJob(job syscall.Handle, pid int) error {
	ph, err := syscall.OpenProcess(processSetQuota|processTerminate, false, uint32(pid))
	if err != nil {
		return err
	}
	defer syscall.CloseHandle(ph)
	r, _, err := procAssignProcessToJobObject.Call(uintptr(job), uintptr(ph))
	if r == 0 {
		return err
	}
	return nil
}
