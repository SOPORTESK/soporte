using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Automation;

namespace ActiveWinUrl
{
    class Program
    {
        [DllImport("user32.dll")]
        static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll", SetLastError = true)]
        static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        [StructLayout(LayoutKind.Sequential)]
        struct LASTINPUTINFO
        {
            public uint cbSize;
            public uint dwTime;
        }

        [DllImport("user32.dll")]
        static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);

        static int GetIdleSeconds()
        {
            try
            {
                LASTINPUTINFO lii = new LASTINPUTINFO();
                lii.cbSize = (uint)Marshal.SizeOf(typeof(LASTINPUTINFO));
                if (GetLastInputInfo(ref lii))
                {
                    uint elapsedTicks = unchecked((uint)Environment.TickCount - lii.dwTime);
                    return (int)(elapsedTicks / 1000);
                }
            }
            catch {}
            return 0;
        }

        static void Main(string[] args)
        {
            int idleSec = GetIdleSeconds();
            IntPtr hWnd = GetForegroundWindow();
            if (hWnd == IntPtr.Zero)
            {
                Console.WriteLine("{\"Process\":\"Idle\",\"Title\":\"\",\"URL\":\"\",\"Id\":0,\"IdleSeconds\":" + idleSec + ",\"Time\":\"" + DateTime.Now.ToString("HH:mm:ss") + "\"}");
                return;
            }

            StringBuilder titleBuilder = new StringBuilder(512);
            GetWindowText(hWnd, titleBuilder, 512);
            string title = titleBuilder.ToString();

            uint processId = 0;
            GetWindowThreadProcessId(hWnd, out processId);

            string processName = "Unknown";
            try
            {
                using (Process proc = Process.GetProcessById((int)processId))
                {
                    processName = proc.ProcessName;
                }
            }
            catch {}

            string url = "";
            string pLower = processName.ToLowerInvariant();

            if (pLower.Contains("chrome") || pLower.Contains("brave") || pLower.Contains("msedge") || pLower.Contains("firefox") || pLower.Contains("opera"))
            {
                url = GetBrowserUrl(hWnd, pLower);
            }

            string json = string.Format(
                "{{\"Process\":{0},\"Title\":{1},\"URL\":{2},\"Id\":{3},\"IdleSeconds\":{4},\"Time\":{5}}}",
                EscapeJson(processName),
                EscapeJson(title),
                EscapeJson(url),
                processId,
                idleSec,
                EscapeJson(DateTime.Now.ToString("HH:mm:ss"))
            );

            Console.WriteLine(json);
        }

        static string GetBrowserUrl(IntPtr hWnd, string browser)
        {
            try
            {
                AutomationElement elm = AutomationElement.FromHandle(hWnd);
                if (elm == null) return "";

                // Find edit controls. In Chromium, the address bar is ControlType.Edit
                Condition editCond = new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Edit);
                AutomationElementCollection edits = elm.FindAll(TreeScope.Descendants, editCond);
                if (edits != null)
                {
                    foreach (AutomationElement edit in edits)
                    {
                        try
                        {
                            object patternObj;
                            if (edit.TryGetCurrentPattern(ValuePattern.Pattern, out patternObj))
                            {
                                ValuePattern vp = (ValuePattern)patternObj;
                                string val = vp.Current.Value;
                                if (!string.IsNullOrEmpty(val))
                                {
                                    val = val.Trim();
                                    if (val.Contains(".") || val.Contains("localhost") || val.Contains("://") || val.Contains("192.168"))
                                    {
                                        return val;
                                    }
                                }
                            }
                        }
                        catch {}
                    }
                }
            }
            catch {}
            return "";
        }

        static string EscapeJson(string s)
        {
            if (s == null) return "\"\"";
            StringBuilder sb = new StringBuilder("\"", s.Length + 2);
            foreach (char c in s)
            {
                switch (c)
                {
                    case '\\': sb.Append("\\\\"); break;
                    case '\"': sb.Append("\\\""); break;
                    case '\b': sb.Append("\\b"); break;
                    case '\f': sb.Append("\\f"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < ' ')
                        {
                            sb.AppendFormat("\\u{0:X4}", (int)c);
                        }
                        else
                        {
                            sb.Append(c);
                        }
                        break;
                }
            }
            sb.Append('\"');
            return sb.ToString();
        }
    }
}
