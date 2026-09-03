using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

class Program {
    [DllImport("user32.dll")]
    static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll", SetLastError = true)]
    static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, uint dwProcessId);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    static extern bool QueryFullProcessImageName(IntPtr hProcess, int dwFlags, StringBuilder lpExeName, ref int lpdwSize);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool CloseHandle(IntPtr hObject);

    static string Escape(string s) {
        if (string.IsNullOrEmpty(s)) return "";
        return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", " ").Replace("\n", " ");
    }

    static string GetCurrentWindowJson() {
        IntPtr hwnd = GetForegroundWindow();
        if (hwnd == IntPtr.Zero) return null;

        StringBuilder titleSb = new StringBuilder(512);
        GetWindowText(hwnd, titleSb, 512);
        string title = titleSb.ToString();

        uint pid = 0;
        GetWindowThreadProcessId(hwnd, out pid);

        string appName = "Unknown";
        string exePath = "";

        if (pid > 0) {
            IntPtr hProc = OpenProcess(0x1000 /* PROCESS_QUERY_LIMITED_INFORMATION */, false, pid);
            if (hProc != IntPtr.Zero) {
                StringBuilder pathSb = new StringBuilder(1024);
                int size = 1024;
                if (QueryFullProcessImageName(hProc, 0, pathSb, ref size)) {
                    exePath = pathSb.ToString();
                    appName = System.IO.Path.GetFileName(exePath);
                }
                CloseHandle(hProc);
            }
            if (string.IsNullOrEmpty(exePath)) {
                try {
                    Process p = Process.GetProcessById((int)pid);
                    appName = p.ProcessName + ".exe";
                } catch {}
            }
        }

        return string.Format("{{\"title\":\"{0}\",\"app\":\"{1}\",\"path\":\"{2}\",\"pid\":{3}}}",
            Escape(title), Escape(appName), Escape(exePath), pid);
    }

    static void Main(string[] args) {
        bool watch = args.Length > 0 && args[0] == "--watch";
        
        if (!watch) {
            string json = GetCurrentWindowJson();
            Console.WriteLine(json ?? "{}");
            return;
        }

        string lastOutput = "";
        while (true) {
            try {
                string json = GetCurrentWindowJson();
                if (!string.IsNullOrEmpty(json) && json != lastOutput) {
                    lastOutput = json;
                    Console.WriteLine(json);
                }
            } catch {}
            Thread.Sleep(1000);
        }
    }
}
