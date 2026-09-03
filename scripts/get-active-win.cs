using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

class Program {
    [DllImport("user32.dll", SetLastError = true)]
    static extern IntPtr OpenInputDesktop(uint dwFlags, bool fInherit, uint dwDesiredAccess);

    [DllImport("user32.dll", SetLastError = true)]
    static extern bool SetThreadDesktop(IntPtr hDesktop);

    [DllImport("user32.dll", SetLastError = true)]
    static extern bool CloseDesktop(IntPtr hDesktop);

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

    static void Main(string[] args) {
        IntPtr hDesk = OpenInputDesktop(0, false, 0x01FF);
        if (hDesk != IntPtr.Zero) {
            SetThreadDesktop(hDesk);
        }

        IntPtr hwnd = GetForegroundWindow();
        if (hwnd == IntPtr.Zero) {
            Console.WriteLine("{\"Process\":\"Idle\",\"Title\":\"\",\"Time\":\"" + DateTime.Now.ToString("HH:mm:ss") + "\"}");
            if (hDesk != IntPtr.Zero) CloseDesktop(hDesk);
            return;
        }

        StringBuilder titleSb = new StringBuilder(512);
        GetWindowText(hwnd, titleSb, 512);
        string title = titleSb.ToString();

        uint pid = 0;
        GetWindowThreadProcessId(hwnd, out pid);

        string procName = "Unknown";
        string exePath = "";

        if (pid > 0) {
            try {
                Process p = Process.GetProcessById((int)pid);
                procName = p.ProcessName;
            } catch {}

            IntPtr hProc = OpenProcess(0x1000 /* PROCESS_QUERY_LIMITED_INFORMATION */, false, pid);
            if (hProc != IntPtr.Zero) {
                StringBuilder pathSb = new StringBuilder(1024);
                int size = 1024;
                if (QueryFullProcessImageName(hProc, 0, pathSb, ref size)) {
                    exePath = pathSb.ToString();
                }
                CloseHandle(hProc);
            }
        }

        if (hDesk != IntPtr.Zero) CloseDesktop(hDesk);

        Console.WriteLine(string.Format("{{\"Process\":\"{0}\",\"Title\":\"{1}\",\"Path\":\"{2}\",\"Id\":{3},\"Time\":\"{4}\"}}",
            Escape(procName), Escape(title), Escape(exePath), pid, DateTime.Now.ToString("HH:mm:ss")));
    }
}
