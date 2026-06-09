$file = Join-Path $PSScriptRoot 'src\components\chat\conversation-list.tsx'
if (-not (Test-Path $file)) { $file = 'c:\Users\Taller SK\Documents\PROYECTOS\Chat de Atenci' + [char]0xF3 + 'n Sekunet\src\components\chat\conversation-list.tsx' }
$content = Get-Content -Path $file -Raw -Encoding UTF8

# Replace the closing </button></li> with delete button + closing tags
$old = '              </button>
            </li>'
$new = '              </button>
              <button onClick={(e) => { e.stopPropagation(); if (confirm("Eliminar esta conversacion?")) { fetch(`/api/cases/${String(c.id)}`, { method: "DELETE" }); } }} className="p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" title="Eliminar conversacion"><Trash2 className="h-3.5 w-3.5" /></button>
            </li>'

$content = $content.Replace($old, $new)
$content | Out-File -FilePath $file -Encoding utf8 -NoNewline
Write-Host "Done"
