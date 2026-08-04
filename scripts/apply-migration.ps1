# Aplica un archivo .sql al proyecto Supabase enlazado usando el token que el
# CLI de Supabase guarda en el Administrador de credenciales de Windows.
# El token nunca se imprime.
#
# Uso: powershell -File scripts\apply-migration.ps1 <ruta_sql>

param(
  [Parameter(Mandatory = $true)][string]$SqlPath
)

$ErrorActionPreference = "Stop"
$ProjectRef = "kzcyxeracvfxynddyjld"

$src = @'
using System;
using System.Runtime.InteropServices;
public class SbCred {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct CREDENTIAL {
    public uint Flags; public uint Type; public IntPtr TargetName; public IntPtr Comment;
    public long LastWritten; public uint CredentialBlobSize; public IntPtr CredentialBlob;
    public uint Persist; public uint AttributeCount; public IntPtr Attributes;
    public IntPtr TargetAlias; public IntPtr UserName;
  }
  [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode, EntryPoint="CredReadW")]
  public static extern bool CredRead(string target, uint type, uint flags, out IntPtr cred);
  [DllImport("advapi32.dll")]
  public static extern void CredFree(IntPtr cred);
  public static byte[] Get(string target) {
    IntPtr p;
    if (!CredRead(target, 1, 0, out p)) return null;
    CREDENTIAL c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
    byte[] b = new byte[c.CredentialBlobSize];
    Marshal.Copy(c.CredentialBlob, b, 0, (int)c.CredentialBlobSize);
    CredFree(p);
    return b;
  }
}
'@
Add-Type -TypeDefinition $src -Language CSharp

$bytes = [SbCred]::Get("Supabase CLI:supabase")
if (-not $bytes) { Write-Host "ERROR: no hay credencial 'Supabase CLI:supabase'. Corre: supabase login"; exit 1 }

$tok = [System.Text.Encoding]::UTF8.GetString($bytes).Trim([char]0)
if ($tok -notmatch '^sbp_') { $tok = [System.Text.Encoding]::Unicode.GetString($bytes).Trim([char]0) }
if ($tok -notmatch '^sbp_') { Write-Host "ERROR: formato de token inesperado (bytes=$($bytes.Length))"; exit 1 }
Write-Host "Token leido de las credenciales de Windows (longitud $($tok.Length))"

$headers = @{ Authorization = "Bearer $tok" }
$uri = "https://api.supabase.com/v1/projects/$ProjectRef/database/query"

$script:Ok = $false

function Invoke-Sql([string]$sql, [string]$label) {
  $script:Ok = $false
  $body = [System.Text.Encoding]::UTF8.GetBytes((@{ query = $sql } | ConvertTo-Json -Compress))
  Write-Host ""
  Write-Host "=== $label ==="
  try {
    $r = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -ContentType "application/json" -Body $body
    Write-Host "OK"
    if ($null -ne $r) { Write-Host ($r | ConvertTo-Json -Depth 6 -Compress) }
    $script:Ok = $true
  } catch {
    Write-Host "FALLO: $($_.Exception.Message)"
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) { Write-Host "DETALLE: $($_.ErrorDetails.Message)" }
    else {
      try {
        $stream = $_.Exception.Response.GetResponseStream()
        $stream.Position = 0
        Write-Host "DETALLE: $((New-Object System.IO.StreamReader($stream)).ReadToEnd())"
      } catch { Write-Host "DETALLE: (no disponible)" }
    }
  }
}

Invoke-Sql "select current_database() as db;" "Conexion"
if (-not $script:Ok) { exit 1 }

$sql = Get-Content -LiteralPath $SqlPath -Raw -Encoding UTF8
Invoke-Sql $sql "Aplicando $([System.IO.Path]::GetFileName($SqlPath))"
if (-not $script:Ok) { exit 1 }

Invoke-Sql @"
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'sek_append_hist';
"@ "Verificacion: funcion registrada"
