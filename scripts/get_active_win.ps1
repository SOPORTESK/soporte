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

$url = ""
$pName = if ($proc) { $proc.ProcessName.ToLower() } else { "" }

if ($handle -ne 0 -and ($pName -match "chrome|brave|msedge")) {
  try {
    Add-Type -AssemblyName UIAutomationClient -ErrorAction SilentlyContinue
    $elm = [System.Windows.Automation.AutomationElement]::FromHandle($handle)
    if ($elm) {
      $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)
      $edit = $elm.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
      if ($edit) {
        $vp = $edit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern) -as [System.Windows.Automation.ValuePattern]
        if ($vp -and $vp.Current.Value) {
          $val = $vp.Current.Value.Trim()
          if ($val -match "http|www|\.com|\.cr|\.net|\.org|localhost|192\.168|10\.") {
            $url = $val
          }
        }
      }
    }
  } catch {}
}

[PSCustomObject]@{
  Process = if ($proc) { $proc.ProcessName } else { "Unknown" }
  Title = $title.ToString()
  URL = $url
  Time = (Get-Date).ToString("HH:mm:ss")
} | ConvertTo-Json -Compress