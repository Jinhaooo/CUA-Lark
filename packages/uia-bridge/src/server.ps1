param(
    [string]$LarkProcessName = "Lark"
)

# JSON-RPC server over stdin/stdout. Each request line is parsed, dispatched,
# and the response written as a single line of JSON. UiaClient (Node side)
# consumes line-delimited JSON from this process's stdout.
#
# Original implementation was a hybrid C#-in-PowerShell file that mixed PS
# cmdlets (Read-Host / Write-Output) inside an Add-Type @"..."@ block; that
# never compiled on Windows PowerShell 5.1 (.NET Framework 4.x has no
# System.Text.Json and no C# 6 string interpolation). Rewritten as pure
# PowerShell using System.Windows.Automation directly.

$ErrorActionPreference = 'Stop'

# Load UIAutomation. WindowsBase is needed for the underlying types. These
# assemblies ship with .NET Framework on every Windows install.
Add-Type -AssemblyName UIAutomationClient -ErrorAction Stop
Add-Type -AssemblyName UIAutomationTypes -ErrorAction Stop
Add-Type -AssemblyName WindowsBase -ErrorAction Stop

# Win32 P/Invoke for foreground-window detection.
if (-not ([System.Management.Automation.PSTypeName]'CuaUiaWin32').Type) {
    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class CuaUiaWin32 {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
}
"@
}

function Get-ForegroundProcessId {
    $hwnd = [CuaUiaWin32]::GetForegroundWindow()
    $procId = 0
    [void][CuaUiaWin32]::GetWindowThreadProcessId($hwnd, [ref]$procId)
    return [int]$procId
}

function Find-LarkWindow {
    $procId = Get-ForegroundProcessId
    if ($procId -le 0) { return $null }
    try {
        $proc = Get-Process -Id $procId -ErrorAction Stop
    } catch { return $null }

    if ($proc.ProcessName -notmatch '(Lark|Feishu)' -and
        $proc.ProcessName -notlike "*$LarkProcessName*") {
        return $null
    }
    $cond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ProcessIdProperty, $procId
    )
    return [System.Windows.Automation.AutomationElement]::RootElement.FindFirst(
        [System.Windows.Automation.TreeScope]::Children, $cond
    )
}

$ROLE_MAP = @{
    'button'    = [System.Windows.Automation.ControlType]::Button
    'edit'      = [System.Windows.Automation.ControlType]::Edit
    'tabitem'   = [System.Windows.Automation.ControlType]::TabItem
    'list'      = [System.Windows.Automation.ControlType]::List
    'listitem'  = [System.Windows.Automation.ControlType]::ListItem
    'document'  = [System.Windows.Automation.ControlType]::Document
    'text'      = [System.Windows.Automation.ControlType]::Text
    'pane'      = [System.Windows.Automation.ControlType]::Pane
    'window'    = [System.Windows.Automation.ControlType]::Window
}

function Get-ControlType([string]$role) {
    $key = if ($null -eq $role) { '' } else { $role.ToLowerInvariant() }
    if ($ROLE_MAP.ContainsKey($key)) { return $ROLE_MAP[$key] }
    return [System.Windows.Automation.ControlType]::Custom
}

function ConvertTo-ElementHash($elem) {
    if ($null -eq $elem) { return $null }
    try {
        $rect = $elem.Current.BoundingRectangle
        return @{
            name              = $elem.Current.Name
            role              = $elem.Current.ControlType.LocalizedControlType
            automationId      = $elem.Current.AutomationId
            hasKeyboardFocus  = [bool]$elem.Current.HasKeyboardFocus
            boundingRectangle = @{
                x      = [int]$rect.X
                y      = [int]$rect.Y
                width  = [int]$rect.Width
                height = [int]$rect.Height
            }
        }
    } catch {
        return $null
    }
}

function Test-NameMatch([string]$actual, [string]$pattern) {
    if ([string]::IsNullOrEmpty($pattern)) { return $true }
    $actual = if ($null -eq $actual) { '' } else { $actual }
    try {
        return [System.Text.RegularExpressions.Regex]::IsMatch(
            $actual, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
        )
    } catch {
        return $actual.IndexOf($pattern, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
    }
}

function Measure-NodeCount($root, [int]$maxCount = 1000) {
    $count = 0
    try {
        $walker = [System.Windows.Automation.TreeWalker]::RawViewWalker
        $node = $walker.GetFirstChild($root)
        while ($node -and $count -lt $maxCount) {
            $count++
            $node = $walker.GetNextSibling($node)
        }
    } catch {}
    return $count
}

function Invoke-FindElement($win, $params) {
    $role  = if ($params.role)  { [string]$params.role }  else { '' }
    $name  = if ($params.name)  { [string]$params.name }  else { '' }
    $scopeStr = if ($params.scope) { [string]$params.scope } else { 'descendants' }
    $scope = if ($scopeStr -eq 'descendants') {
        [System.Windows.Automation.TreeScope]::Descendants
    } else {
        [System.Windows.Automation.TreeScope]::Children
    }
    $cond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty, (Get-ControlType $role)
    )
    foreach ($el in $win.FindAll($scope, $cond)) {
        if (Test-NameMatch $el.Current.Name $name) {
            return ConvertTo-ElementHash $el
        }
    }
    return $null
}

function Invoke-FindAll($win, $params) {
    $role = if ($params.role) { [string]$params.role } else { '' }
    $name = if ($params.name) { [string]$params.name } else { '' }
    $cond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty, (Get-ControlType $role)
    )
    $results = @()
    foreach ($el in $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)) {
        if (Test-NameMatch $el.Current.Name $name) {
            $h = ConvertTo-ElementHash $el
            if ($h) { $results += $h }
        }
    }
    return ,$results
}

function Write-Response([hashtable]$resp) {
    # ConvertTo-Json with Depth 8 covers boundingRectangle nesting comfortably.
    $json = $resp | ConvertTo-Json -Compress -Depth 8
    [Console]::Out.WriteLine($json)
    [Console]::Out.Flush()
}

# JSON-RPC dispatch loop. [Console]::In.ReadLine() blocks on stdin pipe and
# returns $null when the parent (UiaClient) closes its stdin. PowerShell's
# Read-Host is interactive-only and won't work here.
while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) { break }
    $line = $line.Trim()
    if ([string]::IsNullOrEmpty($line)) { continue }

    $resp = @{ id = $null; result = $null; error = $null }
    try {
        $req = $line | ConvertFrom-Json -ErrorAction Stop
        $resp.id = $req.id
        $reqParams = if ($req.PSObject.Properties.Name -contains 'parameters' -and $req.parameters) {
                        $req.parameters
                     } elseif ($req.PSObject.Properties.Name -contains 'params' -and $req.params) {
                        $req.params
                     } else {
                        [PSCustomObject]@{}
                     }

        switch ($req.method) {
            'isA11yEnabled' {
                $win = Find-LarkWindow
                if ($win) {
                    $n = Measure-NodeCount $win
                    $resp.result = @{ enabled = ($n -ge 50); nodeCount = $n }
                } else {
                    $resp.result = @{ enabled = $false; nodeCount = 0 }
                }
            }
            'findElement' {
                $win = Find-LarkWindow
                if ($null -eq $win) {
                    $resp.result = $null
                } else {
                    $resp.result = Invoke-FindElement $win $reqParams
                }
            }
            'findAll' {
                $win = Find-LarkWindow
                if ($null -eq $win) {
                    $resp.result = @()
                } else {
                    $resp.result = Invoke-FindAll $win $reqParams
                }
            }
            'shutdown' {
                Write-Response $resp
                break
            }
            default {
                $resp.error = @{ code = 'method_not_found'; message = "Unknown method: $($req.method)" }
            }
        }
    } catch {
        $resp.error = @{ code = 'parse_error'; message = $_.Exception.Message }
    }

    Write-Response $resp
}
