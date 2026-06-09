# -*- coding: utf-8 -*-
import pathlib

# Find the file
base = pathlib.Path('c:\\Users\\Taller SK\\Documents\\PROYECTOS\\Chat de Atenci\u00f3n Sekunet\\src\\components\\chat')
f = list(base.glob('conversation-list.tsx'))[0]
c = f.read_text(encoding='utf-8')

old = '              </button>\n            </li>'
new = ('              </button>\n'
       '              <button onClick={(e) => { e.stopPropagation(); '
       'if (confirm("Eliminar esta conversacion?")) '
       '{ fetch(`/api/cases/${String(c.id)}`, { method: "DELETE" }); } }} '
       'className="p-1.5 rounded-md text-muted-foreground hover:text-red-500 '
       'hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 '
       'transition-opacity shrink-0" title="Eliminar conversacion">'
       '<Trash2 className="h-3.5 w-3.5" /></button>\n'
       '            </li>')

c = c.replace(old, new)
f.write_text(c, encoding='utf-8')
print('OK')
