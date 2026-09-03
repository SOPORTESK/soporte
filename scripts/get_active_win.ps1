Add-Type @"
  using System;
  using System.Runtime.InteropServices;
  using System.Text;

  public class WinHelper {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  }
"@

$handle = [WinHelper]::GetForegroundWindow()
$title = New-Object System.Text.StringBuilder 512
[WinHelper]::GetWindowText($handle, $title, 512) | Out-Null
$procId = 0
[WinHelper]::GetWindowThreadProcessId($handle, [ref]$procId) | Out-Null
$proc = Get-Process -Id $procId -ErrorAction SilentlyContinue

[PSCustomObject]@{
  Process = if ($proc) { $proc.ProcessName } else { "Unknown" }
  Title = $title.ToString()
  Time = (Get-Date).ToString("HH:mm:ss")
} | ConvertTo-Json -Compress