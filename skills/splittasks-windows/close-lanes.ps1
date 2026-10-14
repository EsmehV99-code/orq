# managed-by: orq
# close-lanes.ps1 — cierra SOLO la ventana de Windows Terminal de una sesión splittasks.
#
# Uso (desde la sesión que lanzó LAUNCH.sh, cuando llega el aviso idle de T1 y T1-done.md existe,
# o cuando la corrida se abandona):
#   powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\you\.claude\skills\splittasks\close-lanes.ps1" -TitlePart "splittasks-<SESSION_ID>"
#
# Códigos de salida: 0 = la ventana ya no existe · 1 = sigue abierta · 2 = el patrón coincide con
# más ventanas que -MaxWindows (no se toca nada) · 3 = ninguna ventana coincide (con -IfExists → 0)
# · 4 = apareció el diálogo pero no se encontró su botón «Close all» (no se manda ninguna tecla).
#
# Cómo funciona (verificado 2026-09-24 en la primera corrida real, WT 1.24):
#   - Todas las ventanas de Windows Terminal viven en UN solo proceso: matar el proceso se
#     llevaría también las ventanas ajenas (la orquestadora, etc.). Nunca Stop-Process/taskkill.
#   - Se busca la ventana por su TÍTULO (clase CASCADIA_HOSTING_WINDOW_CLASS), comparación
#     LITERAL (sin comodines). El título es el de la pestaña activa; LAUNCH.sh y RELAUNCH abren
#     cada pestaña con `--suppressApplicationTitle --title "splittasks-<SESSION_ID> <lane>"`, así
#     que el SESSION_ID se queda en el título aunque claude intente cambiarlo. Las consolas del
#     fallback PowerShell (sin wt.exe) NO son de esa clase: ésas se cierran a mano.
#   - Se le manda WM_CLOSE. Con varias pestañas, WT abre el diálogo «Do you want to close all
#     tabs?»; su botón «Close all» se pulsa por UI Automation DENTRO de esa ventana (nunca con
#     SendKeys: una tecla global puede caer en otra ventana si el foco se mueve).
#   - La supervivencia se comprueba por el HWND (IsWindow), no volviendo a filtrar por título.
#   - Cerrar la ventana mata las sesiones de claude que hubiera dentro (incluida una T1 colgada).
param(
  [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$TitlePart,
  [int]$MaxWindows = 1,   # seguro: si el patrón coincide con más ventanas de las esperadas, aborta
  [switch]$IfExists       # "no encontrada" cuenta como éxito (modo idempotente)
)
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System; using System.Text; using System.Runtime.InteropServices; using System.Collections.Generic;
public class SplitWin {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc p, IntPtr l);
  [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  public static List<KeyValuePair<IntPtr,string>> All() {
    var r = new List<KeyValuePair<IntPtr,string>>();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      var c = new StringBuilder(256); GetClassName(h, c, 256);
      if (c.ToString() != "CASCADIA_HOSTING_WINDOW_CLASS") return true;
      var s = new StringBuilder(512); GetWindowText(h, s, 512);
      r.Add(new KeyValuePair<IntPtr,string>(h, s.ToString())); return true;
    }, IntPtr.Zero);
    return r;
  }
}
'@
function Find-Lanes {
  [SplitWin]::All() | Where-Object { $_.Value.IndexOf($TitlePart, [System.StringComparison]::Ordinal) -ge 0 }
}
function Find-CloseAllButton([IntPtr]$hwnd) {
  # Botón «Close all» del diálogo de WT, buscado SOLO dentro de esa ventana (UI Automation).
  $root = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
  $isButton = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
  $buttons = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $isButton)
  foreach ($b in $buttons) {
    $n = $b.Current.Name
    if ($n -eq 'Close all' -or $n -eq 'Cerrar todo' -or $n -eq 'Cerrar todas') { return $b }
  }
  return $null
}

$all = @([SplitWin]::All())
$hits = @(Find-Lanes)
# Solo se imprimen los títulos que coinciden: los de las ventanas ajenas no son asunto de este script.
"ventanas WT: $($all.Count) · coinciden con '$TitlePart': $($hits.Count)" + $(if ($hits.Count) { ' -> ' + (($hits | ForEach-Object { '[' + $_.Value + ']' }) -join ' ') } else { '' })
if ($hits.Count -eq 0) {
  if ($IfExists) { "ninguna ventana con ese título (modo -IfExists: OK)"; exit 0 }
  "NO ENCONTRADA: ninguna ventana lleva '$TitlePart' en el título (¿pestaña relanzada sin el prefijo, consola del fallback, o ya cerrada?)"; exit 3
}
if ($hits.Count -gt $MaxWindows) { "ABORTO: coinciden $($hits.Count) ventanas y el máximo es $MaxWindows; afina -TitlePart"; exit 2 }

$rc = 0
function Set-Rc([int]$code) { if ($script:rc -eq 0) { $script:rc = $code } }   # se conserva el PRIMER fallo, sin importar el orden
foreach ($hit in $hits) {
  $h = $hit.Key
  # Sin ShowWindow/SetForegroundWindow: ni PostMessage ni UI Automation necesitan el foco, y robarlo
  # haría que lo que el usuario esté tecleando en otra app cayera en la terminal.
  if (-not [SplitWin]::PostMessage($h, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)) { "WM_CLOSE NO entregado a [$($hit.Value)]"; Set-Rc 1; continue }
  "WM_CLOSE -> [$($hit.Value)]"
  # Espera: o la ventana muere (una sola pestaña) o aparece el diálogo con el botón «Close all».
  $btn = $null; $deadline = (Get-Date).AddSeconds(6)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 300
    if (-not [SplitWin]::IsWindow($h)) { break }
    try { $btn = Find-CloseAllButton $h } catch { $btn = $null }
    if ($btn) { break }
  }
  if (-not [SplitWin]::IsWindow($h)) { "cerrada sin diálogo"; continue }
  if (-not $btn) { "la ventana sigue y NO encuentro el botón 'Close all' dentro de ella: no mando ninguna tecla"; Set-Rc 4; continue }
  try {
    $btn.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
    "'Close all' pulsado por UI Automation"
  } catch { "no pude pulsar 'Close all': $($_.Exception.Message)"; Set-Rc 4; continue }
  $deadline = (Get-Date).AddSeconds(6)
  while ((Get-Date) -lt $deadline -and [SplitWin]::IsWindow($h)) { Start-Sleep -Milliseconds 300 }
  if ([SplitWin]::IsWindow($h)) { "SIGUE ABIERTA tras 'Close all'"; Set-Rc 1 } else { "cerrada" }
}
"ventanas WT ahora: $(@([SplitWin]::All()).Count) · con '$TitlePart': $(@(Find-Lanes).Count)"
exit $rc
